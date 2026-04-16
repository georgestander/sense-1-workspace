import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeRenderableUrl } from "./renderable-url.ts";

test("sanitizeRenderableUrl keeps http and https URLs", () => {
  assert.equal(sanitizeRenderableUrl("https://example.com/logo.png"), "https://example.com/logo.png");
  assert.equal(sanitizeRenderableUrl("http://example.com/logo.png"), "http://example.com/logo.png");
});

test("sanitizeRenderableUrl keeps data URIs", () => {
  const dataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9bU5yxwAAAAASUVORK5CYII=";
  assert.equal(sanitizeRenderableUrl(dataUri), dataUri);
});

test("sanitizeRenderableUrl keeps protocol-relative URLs", () => {
  assert.equal(sanitizeRenderableUrl("//cdn.example.com/logo.png"), "//cdn.example.com/logo.png");
});

test("sanitizeRenderableUrl drops unknown schemes including connectors://", () => {
  assert.equal(sanitizeRenderableUrl("connectors://gmail/logo"), null);
  assert.equal(sanitizeRenderableUrl("CONNECTORS://gmail/logo"), null);
  assert.equal(sanitizeRenderableUrl("file:///Users/me/.sense1/icon.png"), null);
  assert.equal(sanitizeRenderableUrl("javascript:alert(1)"), null);
  assert.equal(sanitizeRenderableUrl("chrome://about"), null);
});

test("sanitizeRenderableUrl drops relative paths and empty input", () => {
  assert.equal(sanitizeRenderableUrl("/local/icon.png"), null);
  assert.equal(sanitizeRenderableUrl("icon.png"), null);
  assert.equal(sanitizeRenderableUrl(""), null);
  assert.equal(sanitizeRenderableUrl("   "), null);
  assert.equal(sanitizeRenderableUrl(null), null);
  assert.equal(sanitizeRenderableUrl(undefined), null);
});

test("sanitizeRenderableUrl trims whitespace around valid URLs", () => {
  assert.equal(sanitizeRenderableUrl("  https://example.com/icon.png  "), "https://example.com/icon.png");
});
