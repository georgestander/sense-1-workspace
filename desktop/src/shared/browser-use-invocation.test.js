import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBrowserUsePrompt,
  hasBrowserUseMention,
  inferBrowserUseRequestedUrl,
  replaceActiveBrowserUseShortcut,
  resolveActiveBrowserUseShortcutSuggestion,
  stripBrowserUseMention,
  stripBrowserUseTranscriptText,
} from "./browser-use-invocation.ts";

test("hasBrowserUseMention recognizes browser use mentions", () => {
  assert.equal(hasBrowserUseMention("@ browser use test the app"), true);
  assert.equal(hasBrowserUseMention("@browser use test the app"), true);
  assert.equal(hasBrowserUseMention("@browseruse test the app"), true);
  assert.equal(hasBrowserUseMention("@browser-use test the app"), true);
  assert.equal(hasBrowserUseMention("email browser use notes"), false);
});

test("stripBrowserUseMention removes only the invocation token", () => {
  assert.equal(stripBrowserUseMention("@ browser use test localhost"), "test localhost");
  assert.equal(stripBrowserUseMention("please @browser-use inspect this"), "please inspect this");
});

test("inferBrowserUseRequestedUrl extracts destinations the browser should open immediately", () => {
  assert.equal(inferBrowserUseRequestedUrl("use @browser-use and go to openai.com"), "https://openai.com");
  assert.equal(inferBrowserUseRequestedUrl("@browser-use open http://localhost:5173/settings"), "http://localhost:5173/settings");
  assert.equal(inferBrowserUseRequestedUrl("@browser-use go to gmail and get ready to sign in"), "https://mail.google.com/");
  assert.equal(inferBrowserUseRequestedUrl("@browser-use inspect the current page"), null);
});

test("buildBrowserUsePrompt adds in-app browser context", () => {
  const prompt = buildBrowserUsePrompt("use @browser-use and click the login button", {
    threadId: "thread-1",
    url: "http://localhost:3000/login",
    title: "Login",
  });

  assert.match(prompt, /@browser-use/);
  assert.match(prompt, /Use the Sense-1 in-app browser/);
  assert.match(prompt, /Thread: thread-1/);
  assert.match(prompt, /URL: http:\/\/localhost:3000\/login/);
  assert.match(prompt, /Do not use web search, web lookup, or external browsing/);
  assert.match(prompt, /report the Browser Use failure instead of switching/);
  assert.match(prompt, /click the login button/);
  assert.doesNotMatch(prompt, /use and click/iu);
});

test("stripBrowserUseTranscriptText hides invocation context from user bubble text", () => {
  const prompt = buildBrowserUsePrompt("@browser-use click the login button", {
    threadId: "thread-1",
    url: "http://localhost:3000/login",
    title: "Login",
  });

  assert.equal(stripBrowserUseTranscriptText(prompt), "click the login button");
});

test("resolveActiveBrowserUseShortcutSuggestion recognizes active browser use queries", () => {
  assert.equal(resolveActiveBrowserUseShortcutSuggestion("@bro")?.token, "browser-use");
  assert.equal(resolveActiveBrowserUseShortcutSuggestion("please @browseruse")?.token, "browser-use");
  assert.equal(resolveActiveBrowserUseShortcutSuggestion("@calendar"), null);
});

test("replaceActiveBrowserUseShortcut completes the active mention", () => {
  const result = replaceActiveBrowserUseShortcut("please @bro inspect", "please @bro".length);
  assert.equal(result.prompt, "please @browser-use inspect");
  assert.equal(result.cursorIndex, "please @browser-use".length);
});
