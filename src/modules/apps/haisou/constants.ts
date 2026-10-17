// 配達ルートの定数(元の Apps Script「配達ルート作成ツール v5」と同じ値)。

export const HQ_NAME = "株式会社ロング";
export const HQ_ADDRESS = "石川県金沢市東蚊爪町1丁目34-3";
export const HQ_LATLNG = "36.637632,136.661719";

export type Break = { start: number; end: number; label: string };

/** 休憩(分単位、0 時から)。移動・滞在がかかると、休憩の終わりまで時刻を進める。 */
export const BREAKS: readonly Break[] = [
  { start: 12 * 60, end: 12 * 60 + 45, label: "昼休み 12:00〜12:45" },
  { start: 15 * 60, end: 15 * 60 + 15, label: "休憩 15:00〜15:15" },
  { start: 17 * 60 + 30, end: 17 * 60 + 40, label: "休憩 17:30〜17:40" },
];

/** 既定の滞在時間(分)。 */
export const DEFAULT_STAY = 10;

/** 経路が取れなかったときの、1 区間の概算(分)。 */
export const FALLBACK_LEG_MIN = 15;

/** 1 つの Google マップのリンクに入れる経由地の上限。 */
export const MAX_LINK_WAYPOINTS = 9;

/** 住所を探すときに前に付ける語(元の Apps Script と同じ)。 */
export const GEOCODE_PREFIX = "日本 石川県周辺 ";

/** 会社別の「詳細」の候補を探す範囲(履歴の新しい方から)と、1 社あたりの件数。 */
export const HISTORY_DETAIL_SCAN = 1000;
export const HISTORY_DETAIL_MAX = 8;
