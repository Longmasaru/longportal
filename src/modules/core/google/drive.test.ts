import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import { googleServiceAccount, signGoogleAssertion } from "./drive";

test("鍵: JSON(または base64)の client_email と private_key を読む。配達ルートの鍵でもよい。足りない・壊れているときは null", () => {
  const key = JSON.stringify({ client_email: "sa@x.iam.gserviceaccount.com", private_key: "-----BEGIN\\nabc\\n-----END" });
  assert.deepEqual(googleServiceAccount({ GOOGLE_SERVICE_ACCOUNT_KEY: key }), {
    clientEmail: "sa@x.iam.gserviceaccount.com",
    privateKey: "-----BEGIN\nabc\n-----END",
  });
  assert.equal(googleServiceAccount({ HAISOU_SHEETS_CREDENTIALS: Buffer.from(key).toString("base64") })?.clientEmail, "sa@x.iam.gserviceaccount.com");
  assert.equal(googleServiceAccount({}), null);
  assert.equal(googleServiceAccount({ GOOGLE_SERVICE_ACCOUNT_KEY: "{" }), null);
  assert.equal(googleServiceAccount({ GOOGLE_SERVICE_ACCOUNT_KEY: JSON.stringify({ client_email: "a" }) }), null);
});

test("トークン用の JWT: ドライブの scope と Google の宛先で、鍵で署名する", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const jwt = signGoogleAssertion({ clientEmail: "sa@x", privateKey: pem }, 1000);
  const [h, p, s] = jwt.split(".");
  const payload = JSON.parse(Buffer.from(p, "base64url").toString());
  assert.equal(payload.iss, "sa@x");
  assert.equal(payload.scope, "https://www.googleapis.com/auth/drive");
  assert.equal(payload.aud, "https://oauth2.googleapis.com/token");
  assert.equal(payload.exp - payload.iat, 3600);
  const v = createVerify("RSA-SHA256");
  v.update(`${h}.${p}`);
  assert.ok(v.verify(publicKey, Buffer.from(s, "base64url")));
});
