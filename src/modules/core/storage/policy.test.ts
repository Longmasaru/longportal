import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_UPLOAD_BYTES,
  buildObjectKey,
  contentDispositionFor,
  fileExtension,
  isKeyWithinPrefix,
  keyPrefixSchema,
  uploadRequestSchema,
} from "./policy";

const OWNER = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";

test("fileExtension: 小文字化し、不正・無しは空", () => {
  assert.equal(fileExtension("写真.JPG"), "jpg");
  assert.equal(fileExtension("a.tar.gz"), "gz");
  assert.equal(fileExtension("README"), "");
  assert.equal(fileExtension("末尾ドット."), "");
  assert.equal(fileExtension("a.日本語"), "");
  assert.equal(fileExtension("a.verylongextension"), "");
});

test("buildObjectKey: プレフィックス/アプリ/所有者/UUID.拡張子", () => {
  assert.equal(
    buildObjectKey({ prefix: "dev/", appKey: "todo", ownerId: OWNER, fileName: "図面.PDF", uuid: ID }),
    `dev/todo/${OWNER}/${ID}.pdf`,
  );
  assert.equal(
    buildObjectKey({ prefix: "", appKey: "quality", ownerId: OWNER, fileName: "noext", uuid: ID }),
    `quality/${OWNER}/${ID}`,
  );
});

test("buildObjectKey: 元のファイル名はキーに入らない", () => {
  const key = buildObjectKey({ prefix: "prod/", appKey: "todo", ownerId: OWNER, fileName: "../../etc/passwd.txt", uuid: ID });
  assert.ok(!key.includes(".."));
  assert.ok(!key.includes("passwd"));
  assert.ok(key.endsWith(`${ID}.txt`));
});

test("buildObjectKey: 不正な appKey・ID は拒否", () => {
  assert.throws(() => buildObjectKey({ prefix: "", appKey: "../x", ownerId: OWNER, fileName: "a", uuid: ID }));
  assert.throws(() => buildObjectKey({ prefix: "", appKey: "todo", ownerId: "not-uuid", fileName: "a", uuid: ID }));
  assert.throws(() => buildObjectKey({ prefix: "", appKey: "todo", ownerId: OWNER, fileName: "a", uuid: "x" }));
});

test("keyPrefixSchema: dev/ や prod/ や空を許可", () => {
  assert.equal(keyPrefixSchema.safeParse("dev/").success, true);
  assert.equal(keyPrefixSchema.safeParse("prod/").success, true);
  assert.equal(keyPrefixSchema.safeParse("").success, true);
  assert.equal(keyPrefixSchema.safeParse("dev").success, false);
  assert.equal(keyPrefixSchema.safeParse("../").success, false);
  assert.equal(keyPrefixSchema.safeParse("a/b/").success, false);
});

test("isKeyWithinPrefix: 他の環境や不正なキーは範囲外", () => {
  assert.equal(isKeyWithinPrefix(`dev/todo/${OWNER}/${ID}.pdf`, "dev/"), true);
  assert.equal(isKeyWithinPrefix(`prod/todo/${OWNER}/${ID}.pdf`, "dev/"), false);
  assert.equal(isKeyWithinPrefix("dev/../prod/x", "dev/"), false);
  assert.equal(isKeyWithinPrefix("/dev/x", "dev/"), false);
});

test("uploadRequestSchema: サイズ・種類・名前を検証", () => {
  const ok = { fileName: "a.pdf", contentType: "application/pdf", size: 1024 };
  assert.equal(uploadRequestSchema.safeParse(ok).success, true);
  assert.equal(uploadRequestSchema.safeParse({ ...ok, size: 0 }).success, false);
  assert.equal(uploadRequestSchema.safeParse({ ...ok, size: MAX_UPLOAD_BYTES + 1 }).success, false);
  assert.equal(uploadRequestSchema.safeParse({ ...ok, size: MAX_UPLOAD_BYTES }).success, true);
  assert.equal(uploadRequestSchema.safeParse({ ...ok, size: 1.5 }).success, false);
  assert.equal(uploadRequestSchema.safeParse({ ...ok, contentType: "pdf" }).success, false);
  assert.equal(uploadRequestSchema.safeParse({ ...ok, contentType: "text/html; charset=utf-8" }).success, false);
  assert.equal(uploadRequestSchema.safeParse({ ...ok, fileName: "" }).success, false);
  assert.equal(uploadRequestSchema.safeParse({ ...ok, fileName: "a".repeat(201) }).success, false);
});

test("contentDispositionFor: 日本語名は UTF-8 でエンコード、改行や引用符は無害化", () => {
  assert.equal(contentDispositionFor("図面 1.pdf"), "attachment; filename*=UTF-8''%E5%9B%B3%E9%9D%A2%201.pdf");
  assert.ok(!contentDispositionFor('a"\r\nb.txt').includes("\n"));
});
