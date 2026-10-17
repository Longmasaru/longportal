import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import {
  SIGNED_URL_TTL_SECONDS,
  buildObjectKey,
  contentDispositionFor,
  isKeyWithinPrefix,
  keyPrefixSchema,
  uploadRequestSchema,
  type UploadRequest,
} from "./policy";

// Cloudflare R2(S3 互換)へのアクセス。サーバー専用(秘密のキーを使う)。
// 環境変数: R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET / R2_KEY_PREFIX(dev/ か prod/)

const envSchema = z.object({
  R2_ACCOUNT_ID: z.string().regex(/^[0-9a-f]{32}$/, "R2_ACCOUNT_ID が正しくありません。"),
  R2_ACCESS_KEY_ID: z.string().min(1, "R2_ACCESS_KEY_ID がありません。"),
  R2_SECRET_ACCESS_KEY: z.string().min(1, "R2_SECRET_ACCESS_KEY がありません。"),
  R2_BUCKET: z.string().min(1, "R2_BUCKET がありません。"),
  R2_KEY_PREFIX: keyPrefixSchema.default(""),
});

type R2Config = z.infer<typeof envSchema>;

let cached: { config: R2Config; client: S3Client } | undefined;

function r2() {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`R2 の設定が不足・不正です: ${parsed.error.issues.map((i) => i.message).join(" / ")}`);
  }
  const config = parsed.data;
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.R2_ACCESS_KEY_ID, secretAccessKey: config.R2_SECRET_ACCESS_KEY },
  });
  cached = { config, client };
  return cached;
}

/** 署名付きのアップロード URL を発行する。ブラウザは、この URL へ PUT する(Content-Type を同じにすること)。 */
export async function createUploadUrl(input: {
  appKey: string;
  ownerId: string;
  file: UploadRequest;
}): Promise<{ key: string; url: string; expiresInSeconds: number }> {
  const file = uploadRequestSchema.parse(input.file);
  const { config, client } = r2();
  const key = buildObjectKey({
    prefix: config.R2_KEY_PREFIX,
    appKey: input.appKey,
    ownerId: input.ownerId,
    fileName: file.fileName,
    uuid: randomUUID(),
  });
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: config.R2_BUCKET,
      Key: key,
      ContentType: file.contentType,
      ContentLength: file.size,
    }),
    { expiresIn: SIGNED_URL_TTL_SECONDS },
  );
  return { key, url, expiresInSeconds: SIGNED_URL_TTL_SECONDS };
}

/** 署名付きのダウンロード URL を発行する(元のファイル名で保存されるよう指定する)。 */
export async function createDownloadUrl(input: { key: string; fileName: string }): Promise<string> {
  const { config, client } = r2();
  if (!isKeyWithinPrefix(input.key, config.R2_KEY_PREFIX)) throw new Error("このキーは、この環境のものではありません。");
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: config.R2_BUCKET,
      Key: input.key,
      ResponseContentDisposition: contentDispositionFor(input.fileName),
    }),
    { expiresIn: SIGNED_URL_TTL_SECONDS },
  );
}

/**
 * 画面の中に表示するための署名付き URL(画像など。ダウンロードにせず、その場で表示する)。
 * ファイルを見せてよいかの判定は、呼び出す側で済ませること。
 */
export async function createViewUrl(input: { key: string; contentType: string }): Promise<string> {
  const { config, client } = r2();
  if (!isKeyWithinPrefix(input.key, config.R2_KEY_PREFIX)) throw new Error("このキーは、この環境のものではありません。");
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: config.R2_BUCKET,
      Key: input.key,
      ResponseContentType: input.contentType,
      ResponseContentDisposition: "inline",
    }),
    { expiresIn: SIGNED_URL_TTL_SECONDS },
  );
}

/**
 * サーバー(取り込みのコマンドなど)から直接ファイルを保存する。キーは createUploadUrl と同じ形で、保存したキーを返す。
 * 画面からのアップロードには使わない(ブラウザは createUploadUrl の署名付き URL へ送る)。
 */
export async function putObject(input: {
  appKey: string;
  ownerId: string;
  fileName: string;
  contentType: string;
  body: Uint8Array;
}): Promise<string> {
  const { config, client } = r2();
  const key = buildObjectKey({
    prefix: config.R2_KEY_PREFIX,
    appKey: input.appKey,
    ownerId: input.ownerId,
    fileName: input.fileName,
    uuid: randomUUID(),
  });
  await client.send(
    new PutObjectCommand({
      Bucket: config.R2_BUCKET,
      Key: key,
      Body: input.body,
      ContentType: input.contentType,
      ContentLength: input.body.byteLength,
    }),
  );
  return key;
}

/** ファイルを削除する。 */
export async function deleteObject(key: string): Promise<void> {
  const { config, client } = r2();
  if (!isKeyWithinPrefix(key, config.R2_KEY_PREFIX)) throw new Error("このキーは、この環境のものではありません。");
  await client.send(new DeleteObjectCommand({ Bucket: config.R2_BUCKET, Key: key }));
}

/** アップロードが完了しているかの確認(DB にメタ情報を登録する前に使う)。無ければ null。 */
export async function headObject(key: string): Promise<{ size: number; contentType: string | undefined } | null> {
  const { config, client } = r2();
  if (!isKeyWithinPrefix(key, config.R2_KEY_PREFIX)) throw new Error("このキーは、この環境のものではありません。");
  try {
    const r = await client.send(new HeadObjectCommand({ Bucket: config.R2_BUCKET, Key: key }));
    return { size: r.ContentLength ?? 0, contentType: r.ContentType };
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return null;
    throw err;
  }
}

/** この環境のプレフィックス配下の一覧(接続確認や掃除用)。 */
export async function listObjects(limit = 100): Promise<{ key: string; size: number }[]> {
  const { config, client } = r2();
  const r = await client.send(
    new ListObjectsV2Command({ Bucket: config.R2_BUCKET, Prefix: config.R2_KEY_PREFIX, MaxKeys: limit }),
  );
  return (r.Contents ?? []).map((o) => ({ key: o.Key ?? "", size: o.Size ?? 0 }));
}

export function currentKeyPrefix(): string {
  return r2().config.R2_KEY_PREFIX;
}
