import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBrowserUsePrompt,
  hasBrowserUseMention,
  stripBrowserUseMention,
} from "./browser-use-invocation.ts";

test("hasBrowserUseMention recognizes browser use mentions", () => {
  assert.equal(hasBrowserUseMention("@ browser use test the app"), true);
  assert.equal(hasBrowserUseMention("@browser use test the app"), true);
  assert.equal(hasBrowserUseMention("@browser-use test the app"), true);
  assert.equal(hasBrowserUseMention("email browser use notes"), false);
});

test("stripBrowserUseMention removes only the invocation token", () => {
  assert.equal(stripBrowserUseMention("@ browser use test localhost"), "test localhost");
  assert.equal(stripBrowserUseMention("please @browser-use inspect this"), "please inspect this");
});

test("buildBrowserUsePrompt adds in-app browser context", () => {
  const prompt = buildBrowserUsePrompt("@ browser use click the login button", {
    threadId: "thread-1",
    url: "http://localhost:3000/login",
    title: "Login",
  });

  assert.match(prompt, /@Browser Use/);
  assert.match(prompt, /Use the Sense-1 in-app browser/);
  assert.match(prompt, /Thread: thread-1/);
  assert.match(prompt, /URL: http:\/\/localhost:3000\/login/);
  assert.match(prompt, /click the login button/);
});
