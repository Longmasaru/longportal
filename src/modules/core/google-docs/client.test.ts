import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { googleDocsWriterConfig } from "./client";

describe("googleDocsWriterConfig", () => {
  it("URL と合言葉がそろい、URL が Apps Script のときだけ使う", () => {
    const url = "https://script.google.com/macros/s/xxxx/exec";
    assert.deepEqual(googleDocsWriterConfig({ GOOGLE_DOCS_WRITER_URL: url, GOOGLE_DOCS_WRITER_SECRET: " s " }), { url, secret: "s" });
    assert.equal(googleDocsWriterConfig({ GOOGLE_DOCS_WRITER_URL: url }), null);
    assert.equal(googleDocsWriterConfig({ GOOGLE_DOCS_WRITER_URL: "https://example.com/x", GOOGLE_DOCS_WRITER_SECRET: "s" }), null);
  });
});
