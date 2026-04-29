import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeBrowserUrl,
  normalizeOrigin,
  resolveOrigin,
} from "./desktop-browser-url.ts";

test("normalizeBrowserUrl accepts localhost shortcuts and supported protocols", () => {
  assert.equal(normalizeBrowserUrl("localhost:3000/settings"), "http://localhost:3000/settings");
  assert.equal(normalizeBrowserUrl("127.0.0.1:5173"), "http://127.0.0.1:5173");
  assert.equal(normalizeBrowserUrl("https://example.com/path"), "https://example.com/path");
  assert.equal(normalizeBrowserUrl("file:///tmp/index.html"), "file:///tmp/index.html");
  assert.equal(normalizeBrowserUrl("about:blank"), "about:blank");
});

test("normalizeBrowserUrl rejects unsupported browser protocols", () => {
  assert.equal(normalizeBrowserUrl("javascript:alert(1)"), null);
  assert.equal(normalizeBrowserUrl("sense1://settings"), null);
  assert.equal(normalizeBrowserUrl("not a url"), null);
});

test("resolveOrigin groups Browser Use trust by origin", () => {
  assert.equal(resolveOrigin("https://example.com/a"), "https://example.com");
  assert.equal(resolveOrigin("https://example.com/b"), "https://example.com");
  assert.equal(resolveOrigin("file:///tmp/index.html"), "file://");
  assert.equal(resolveOrigin("about:blank"), "about:blank");
});

test("normalizeOrigin preserves only valid trust origins", () => {
  assert.equal(normalizeOrigin("https://example.com/path"), "https://example.com");
  assert.equal(normalizeOrigin("file://"), "file://");
  assert.equal(normalizeOrigin("about:blank"), "about:blank");
  assert.equal(normalizeOrigin("not a url"), null);
});
