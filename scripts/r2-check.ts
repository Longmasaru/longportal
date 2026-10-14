// R2 の接続確認: 一覧 → 署名付きアップロード → 確認 → 署名付きダウンロード → 削除(試験用のファイルを作って、消す)。
// 実行: npm run r2:check(.env.local の R2_* を使う。環境のプレフィックス配下だけを触る)
import { randomUUID } from "node:crypto";
import {
  createDownloadUrl,
  createUploadUrl,
  currentKeyPrefix,
  deleteObject,
  headObject,
  listObjects,
} from "../src/modules/core/storage";

async function main(): Promise<void> {
  const prefix = currentKeyPrefix();
  console.log(`[r2] バケット=${process.env.R2_BUCKET} プレフィックス="${prefix}"`);

  const before = await listObjects(1000);
  console.log(`[r2] 一覧: OK(${prefix || "全体"} 配下に ${before.length} 件)`);

  const body = `LONG PORTAL 接続確認 ${new Date().toISOString()} 日本語ファイル名のテスト`;
  const bytes = new TextEncoder().encode(body);
  const { key, url } = await createUploadUrl({
    appKey: "connection_check",
    ownerId: randomUUID(),
    file: { fileName: "接続確認.TXT", contentType: "text/plain", size: bytes.length },
  });
  console.log(`[r2] 署名付きアップロード URL: OK(キー=${key})`);

  const put = await fetch(url, { method: "PUT", headers: { "Content-Type": "text/plain" }, body: bytes });
  if (!put.ok) throw new Error(`アップロード失敗: HTTP ${put.status} ${await put.text()}`);
  console.log(`[r2] アップロード: OK(HTTP ${put.status})`);

  const head = await headObject(key);
  if (!head || head.size !== bytes.length) throw new Error(`確認失敗: ${JSON.stringify(head)}`);
  console.log(`[r2] 確認(HEAD): OK(サイズ ${head.size} バイト、種類 ${head.contentType})`);

  const downloadUrl = await createDownloadUrl({ key, fileName: "接続確認.txt" });
  const get = await fetch(downloadUrl);
  const text = await get.text();
  if (!get.ok || text !== body) throw new Error(`ダウンロード失敗: HTTP ${get.status}`);
  console.log(`[r2] ダウンロード: OK(内容一致。Content-Disposition=${get.headers.get("content-disposition")})`);

  // 他の環境のキーを触れないことの確認
  try {
    await deleteObject(prefix === "dev/" ? `prod/${key.slice(prefix.length)}` : `dev/${key}`);
    throw new Error("他の環境のキーを削除できてしまいました");
  } catch (err) {
    if (err instanceof Error && err.message.includes("この環境のものではありません")) {
      console.log("[r2] 他の環境のキーの削除を拒否: OK");
    } else {
      throw err;
    }
  }

  await deleteObject(key);
  if ((await headObject(key)) !== null) throw new Error("削除後も残っています");
  console.log("[r2] 削除: OK(試験用のファイルを消しました)");
  console.log("[r2] すべて成功");
}

main().catch((err) => {
  console.error("[r2] 失敗:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
