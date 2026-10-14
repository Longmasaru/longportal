// ファイル保管(Cloudflare R2)の規則。DB・ネットワークに依存しない純粋な関数と検証。
// 方式(TODOSample と同じ): ブラウザから R2 へ「署名付き URL」で直接アップロード/ダウンロードする
// (Vercel の関数の本文サイズの上限を避けるため)。誰がどのファイルに触れるかの判定は、
// 署名付き URL を発行する側(各アプリの Server Action)が、アプリの権限(requireAppAccess など)で行う。
import { z } from "zod";

/** 1 ファイルの上限(バイト)。アプリごとに、これより小さい上限を設けてよい。 */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** 署名付き URL の有効期間(秒)。 */
export const SIGNED_URL_TTL_SECONDS = 5 * 60;

const APP_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * 拡張子(小文字・英数字のみ・最大 10 文字)。無い・不正なら空文字。
 * 保存名に拡張子を残すのは、ダッシュボードなどからダウンロードしたときに、拡張子が消えないようにするため。
 */
export function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0 || dot === fileName.length - 1) return "";
  const ext = fileName.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,10}$/.test(ext) ? ext : "";
}

/**
 * 保存先のキー: `<環境のプレフィックス><アプリのキー>/<所有者の ID>/<UUID>.<拡張子>`
 * 元のファイル名はキーに含めない(日本語や記号による問題を避ける。元の名前は DB のメタ情報で持つ)。
 */
export function buildObjectKey(input: {
  /** 環境ごとの置き場所の印(開発 `dev/`、本番 `prod/`)。空でもよい。 */
  prefix: string;
  appKey: string;
  ownerId: string;
  fileName: string;
  /** 一意な ID(UUID)。 */
  uuid: string;
}): string {
  if (!APP_KEY_PATTERN.test(input.appKey)) throw new Error("appKey の形式が正しくありません。");
  if (!z.uuid().safeParse(input.ownerId).success) throw new Error("ownerId の形式が正しくありません。");
  if (!z.uuid().safeParse(input.uuid).success) throw new Error("uuid の形式が正しくありません。");
  const ext = fileExtension(input.fileName);
  return `${input.prefix}${input.appKey}/${input.ownerId}/${input.uuid}${ext ? `.${ext}` : ""}`;
}

/** プレフィックスの形式(空、または `dev/` のような「英数字と - _ で、最後が /」)。 */
export const keyPrefixSchema = z
  .string()
  .regex(/^([a-z0-9_-]+\/)?$/, "R2_KEY_PREFIX は dev/ や prod/ のような形式にしてください。");

/** そのキーが、この環境のプレフィックスの範囲内か(他の環境のファイルを触らせないための確認)。 */
export function isKeyWithinPrefix(key: string, prefix: string): boolean {
  return key.startsWith(prefix) && !key.includes("..") && !key.startsWith("/");
}

/** アップロードの要求(Server Action の入力検証)。サイズ・種類・名前の上限を、ここで検証する。 */
export const uploadRequestSchema = z.object({
  fileName: z.string().trim().min(1, "ファイル名がありません。").max(200, "ファイル名が長すぎます。"),
  contentType: z
    .string()
    .max(100)
    .regex(/^[A-Za-z0-9][A-Za-z0-9.+-]*\/[A-Za-z0-9][A-Za-z0-9.+-]*$/, "ファイルの種類が正しくありません。"),
  size: z
    .number()
    .int()
    .min(1, "空のファイルはアップロードできません。")
    .max(MAX_UPLOAD_BYTES, `ファイルは ${MAX_UPLOAD_BYTES / 1024 / 1024}MB までです。`),
});
export type UploadRequest = z.infer<typeof uploadRequestSchema>;

/** ダウンロード時のファイル名の指定(日本語を含む名前でも、正しく保存されるように RFC 5987 の形式にする)。 */
export function contentDispositionFor(fileName: string): string {
  const safe = fileName.replace(/[\r\n"]/g, "_").slice(0, 200);
  return `attachment; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
