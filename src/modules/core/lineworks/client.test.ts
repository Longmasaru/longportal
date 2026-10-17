import assert from "node:assert/strict";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { test } from "node:test";
import { lineWorksConfig, signAssertion } from "./client";

test("設定は 5 つそろったときだけ使う。1 行で保存した鍵の \\n は改行に戻す", () => {
  const env = {
    LINEWORKS_CLIENT_ID: "cid",
    LINEWORKS_CLIENT_SECRET: "sec",
    LINEWORKS_SERVICE_ACCOUNT: "sa@example",
    LINEWORKS_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nAAA\\n-----END PRIVATE KEY-----",
    LINEWORKS_BOT_ID: "123",
  };
  assert.equal(lineWorksConfig(env)?.privateKey, "-----BEGIN PRIVATE KEY-----\nAAA\n-----END PRIVATE KEY-----");
  assert.equal(lineWorksConfig({ ...env, LINEWORKS_BOT_ID: "" }), null);
});

test("アクセストークン用の JWT は RS256 で署名し、iss = クライアント ID、sub = サービスアカウント", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwt = signAssertion(
    {
      clientId: "cid",
      clientSecret: "sec",
      serviceAccount: "sa@example",
      privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      botId: "1",
    },
    1000,
  );
  const [h, p, s] = jwt.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(h, "base64url").toString()), { alg: "RS256", typ: "JWT" });
  assert.deepEqual(JSON.parse(Buffer.from(p, "base64url").toString()), {
    iss: "cid",
    sub: "sa@example",
    iat: 1000,
    exp: 4600,
  });
  const v = createVerify("RSA-SHA256");
  v.update(`${h}.${p}`);
  assert.equal(v.verify(publicKey, Buffer.from(s, "base64url")), true);
});
