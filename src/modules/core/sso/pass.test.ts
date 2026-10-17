import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { buildPass, signPass, ssoEntryUrl } from "./pass";

const SECRET = "s".repeat(40);

test("通行証: 60 秒の期限と、アプリ側と同じ形式の署名", () => {
  const pass = buildPass({
    appKey: "aikyoshitsu",
    userId: "11111111-1111-4111-8111-111111111111",
    name: "老川",
    perms: ["aikyoshitsu.materials.manage"],
    nowSeconds: 1000,
    jti: "22222222-2222-4222-8222-222222222222",
  });
  assert.equal(pass.exp - pass.iat, 60);
  const token = signPass(pass, SECRET);
  const [body, mac] = token.split(".");
  assert.equal(mac, createHmac("sha256", SECRET).update(body).digest("base64url"));
  assert.deepEqual(JSON.parse(Buffer.from(body, "base64url").toString("utf8")), pass);
});

test("通行証: 鍵が短すぎるときは作らない", () => {
  const pass = buildPass({ appKey: "a", userId: "u", name: "n", perms: [], nowSeconds: 0, jti: "j" });
  assert.throws(() => signPass(pass, "short"));
});

test("入口の URL: 末尾のスラッシュやパスがあっても /sso をつなげる", () => {
  assert.equal(ssoEntryUrl("https://ai.example.com", "t.k"), "https://ai.example.com/sso?token=t.k");
  assert.equal(ssoEntryUrl("https://ai.example.com/", "t"), "https://ai.example.com/sso?token=t");
  assert.equal(ssoEntryUrl("https://example.com/ai", "t"), "https://example.com/ai/sso?token=t");
});
