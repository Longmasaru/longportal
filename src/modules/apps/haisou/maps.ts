// Google Maps Platform の呼び出し(サーバー側だけ)。元の Apps Script の Maps サービスの代わり。
// - 住所 → 位置: Geocoding API
// - 経路・訪問順の最適化: Routes API(computeRoutes。旧 Directions API の後継)
// キーは環境変数 GOOGLE_MAPS_API_KEY(Vercel では Sensitive)。無いときは、呼び出さずに失敗として扱う。
import { HQ_LATLNG } from "./constants";
import { parseLatLng } from "./schedule";

const TIMEOUT_MS = 15_000;

export function mapsApiKey(): string | null {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() || null;
}

export type GeocodeResult =
  | {
      ok: true;
      lat: number;
      lng: number;
      formatted: string;
      partial: boolean;
      /** ROOFTOP(番地まで一致)など */
      type: string;
    }
  | { ok: false; status: string };

type GeocodeApiResponse = {
  status: string;
  error_message?: string;
  results?: {
    formatted_address: string;
    partial_match?: boolean;
    geometry: { location: { lat: number; lng: number }; location_type: string };
  }[];
};

/** 住所から位置を探す(地域は日本、日本語)。 */
export async function geocode(address: string): Promise<GeocodeResult> {
  const key = mapsApiKey();
  if (!key) return { ok: false, status: "API キー未設定" };
  const url =
    "https://maps.googleapis.com/maps/api/geocode/json?region=jp&language=ja" +
    `&address=${encodeURIComponent(address)}&key=${encodeURIComponent(key)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) return { ok: false, status: `HTTP ${res.status}` };
  const body = (await res.json()) as GeocodeApiResponse;
  const r = body.results?.[0];
  if (body.status !== "OK" || !r) return { ok: false, status: body.status };
  return {
    ok: true,
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    formatted: r.formatted_address,
    partial: !!r.partial_match,
    type: r.geometry.location_type,
  };
}

export type RouteResult =
  | {
      ok: true;
      /** 最適化したときの訪問順(経由地の添字)。最適化しないときは渡した順。 */
      order: number[];
      /** 区間ごとの秒・メートル(会社 → 1 件目 → … → 会社)。 */
      legSecs: number[];
      legMeters: number[];
    }
  | { ok: false; reason: string };

type RoutesApiResponse = {
  routes?: {
    optimizedIntermediateWaypointIndex?: number[];
    legs?: { duration?: string; distanceMeters?: number }[];
  }[];
  error?: { status?: string; message?: string };
};

function waypointOf(loc: string) {
  const ll = parseLatLng(loc);
  return ll ? { location: { latLng: ll } } : { address: loc };
}

/**
 * 会社を出て、経由地を回り、会社へ戻る経路を求める(自動車、交通状況は考慮しない)。
 * locs は「緯度,経度」または住所。
 */
export async function computeRoute(
  locs: string[],
  opts: { optimize: boolean; avoidHighways: boolean },
): Promise<RouteResult> {
  const key = mapsApiKey();
  if (!key) return { ok: false, reason: "Google マップの API キーが未設定です" };
  const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "routes.legs.duration,routes.legs.distanceMeters,routes.optimizedIntermediateWaypointIndex",
    },
    body: JSON.stringify({
      origin: waypointOf(HQ_LATLNG),
      destination: waypointOf(HQ_LATLNG),
      intermediates: locs.map(waypointOf),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
      optimizeWaypointOrder: opts.optimize && locs.length > 1,
      routeModifiers: { avoidHighways: opts.avoidHighways },
      languageCode: "ja",
      regionCode: "JP",
      units: "METRIC",
    }),
  });
  const body = (await res.json().catch(() => ({}))) as RoutesApiResponse;
  if (!res.ok || body.error) {
    const status = body.error?.status ?? `HTTP ${res.status}`;
    return { ok: false, reason: `経路検索の応答: ${status}${body.error?.message ? `(${body.error.message})` : ""}` };
  }
  const route = body.routes?.[0];
  const legs = route?.legs ?? [];
  if (!route || legs.length !== locs.length + 1) return { ok: false, reason: "経路検索の応答: ZERO_RESULTS" };
  const optimized = route.optimizedIntermediateWaypointIndex;
  const order =
    opts.optimize && optimized && optimized.length === locs.length && optimized.every((i) => i >= 0)
      ? optimized
      : locs.map((_, i) => i);
  return {
    ok: true,
    order,
    legSecs: legs.map((l) => Number.parseInt(String(l.duration ?? "0s"), 10) || 0),
    legMeters: legs.map((l) => l.distanceMeters ?? 0),
  };
}
