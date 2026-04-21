import test from "node:test";
import assert from "node:assert/strict";

import { DesktopBugReportingService } from "./desktop-bug-reporting-service.ts";

test("DesktopBugReportingService submits reports to Sentry and defers Linear when not configured", async () => {
  const captured = [];
  const service = new DesktopBugReportingService({
    env: {
      HOME: "/Users/george",
    },
    runtimeInfo: {
      apiVersion: "1.0.0",
      appVersion: "0.11.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-04-20T07:00:00.000Z",
    },
    getBootstrap: async () => ({
      profile: {
        id: "default",
        source: "default",
        rootPath: "/tmp/runtime",
        codexHome: "/tmp/codex",
      },
      auth: {
        isSignedIn: true,
        email: "george@example.com",
        accountType: "chatgpt",
        requiresOpenaiAuth: false,
      },
      runtime: {
        apiVersion: "1.0.0",
        appVersion: "0.11.0",
        electronVersion: "35.2.1",
        platform: "darwin",
        startedAt: "2026-04-20T07:00:00.000Z",
        state: "running",
        lastError: null,
        restartCount: 0,
        lastStateAt: "2026-04-20T07:00:00.000Z",
      },
      profileId: "default",
      profileOptions: [],
      isSignedIn: true,
      accountEmail: "george@example.com",
      runtimeStatus: { appVersion: "0.11.0", platform: "darwin" },
      runtimeSetup: null,
      tenant: null,
      teamSetup: {
        mode: "local",
        source: "desktopLocal",
        canWorkLocally: true,
        canCreateFirstTeam: true,
        canManageTeam: true,
      },
      runContext: null,
      auditEvents: [],
      recentThreads: [],
      recentFolders: [],
      workspaceSidebarOrder: [],
      lastSelectedThreadId: null,
      selectedThread: null,
      pendingApprovals: [],
    }),
    getVisibleThreadContext: () => ({
      id: "thread-1",
      title: "Broken composer flow",
      workspaceRoot: "/Users/george/project",
      cwd: "/Users/george/project",
    }),
    getRecentLogs: () => [{
      level: "error",
      message: "OPENAI_API_KEY=abc123",
      timestamp: "2026-04-20T07:10:00.000Z",
    }],
    captureManualBugReport: ({ report, context }) => {
      captured.push({ report, context });
      return "evt_123";
    },
  });

  const result = await service.submitReport({
    reportType: "manual",
    title: "Composer send button stopped working",
    description: "Clicking send does nothing after switching threads twice.",
    expectedBehavior: "The current prompt should submit immediately.",
    reproductionSteps: "Switch threads twice and click send.",
    attachments: [{
      kind: "file",
      path: "/Users/george/Desktop/screenshot.png",
      mimeType: "image/png",
    }],
  });

  assert.equal(captured.length, 1);
  assert.equal(captured[0]?.report.attachments[0]?.path, "~/Desktop/screenshot.png");
  assert.equal(captured[0]?.context.thread?.workspaceRoot, "~/project");
  assert.equal(captured[0]?.context.thread?.cwd, "~/project");
  assert.equal(result.sentryEventId, "evt_123");
  assert.equal(result.promotionDisposition, "deferred");
});

test("DesktopBugReportingService defers gracefully when Linear issue creation fails after Sentry capture", async () => {
  const captured = [];
  const service = new DesktopBugReportingService({
    env: {
      USERPROFILE: "C:\\Users\\George",
    },
    runtimeInfo: {
      apiVersion: "1.0.0",
      appVersion: "0.11.0",
      electronVersion: "35.2.1",
      platform: "win32",
      startedAt: "2026-04-20T07:00:00.000Z",
    },
    getBootstrap: async () => ({
      profile: {
        id: "default",
        source: "default",
        rootPath: "C:\\runtime",
        codexHome: "C:\\codex",
      },
      auth: {
        isSignedIn: true,
        email: "george@example.com",
        accountType: "chatgpt",
        requiresOpenaiAuth: false,
      },
      runtime: {
        apiVersion: "1.0.0",
        appVersion: "0.11.0",
        electronVersion: "35.2.1",
        platform: "win32",
        startedAt: "2026-04-20T07:00:00.000Z",
        state: "running",
        lastError: null,
        restartCount: 0,
        lastStateAt: "2026-04-20T07:00:00.000Z",
      },
      profileId: "default",
      profileOptions: [],
      isSignedIn: true,
      accountEmail: "george@example.com",
      runtimeStatus: { appVersion: "0.11.0", platform: "win32" },
      runtimeSetup: null,
      tenant: null,
      teamSetup: {
        mode: "local",
        source: "desktopLocal",
        canWorkLocally: true,
        canCreateFirstTeam: true,
        canManageTeam: true,
      },
      runContext: null,
      auditEvents: [],
      recentThreads: [],
      recentFolders: [],
      workspaceSidebarOrder: [],
      lastSelectedThreadId: null,
      selectedThread: null,
      pendingApprovals: [],
    }),
    getVisibleThreadContext: () => ({
      id: "thread-2",
      title: "Windows path leak",
      workspaceRoot: "C:\\Users\\George\\project",
      cwd: "C:\\Users\\George\\project",
    }),
    getRecentLogs: () => [{
      level: "error",
      message: "OPENAI_API_KEY=abc123 C:\\Users\\George\\project",
      timestamp: "2026-04-20T07:10:00.000Z",
    }],
    captureManualBugReport: ({ report, context }) => {
      captured.push({ report, context });
      return "evt_456";
    },
    linearIssueAdapter: /** @type {any} */ ({
      isConfigured: () => true,
      createIssue: async () => {
        throw new Error("403 Forbidden");
      },
    }),
  });

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => {
    warnings.push(args.join(" "));
  };

  try {
    const result = await service.submitReport({
      reportType: "manual",
      title: "Save action fails on Windows",
      description: "Saving after opening the workspace fails and should create a ticket.",
      expectedBehavior: null,
      reproductionSteps: null,
      severity: "high",
      attachments: [{
        kind: "file",
        path: "C:\\Users\\George\\Desktop\\screenshot.png",
        mimeType: "image/png",
      }],
    });

    assert.equal(captured.length, 1);
    assert.equal(captured[0]?.report.attachments[0]?.path, "~\\Desktop\\screenshot.png");
    assert.equal(captured[0]?.context.thread?.workspaceRoot, "~\\project");
    assert.equal(captured[0]?.context.thread?.cwd, "~\\project");
    assert.equal(result.sentryEventId, "evt_456");
    assert.equal(result.promotionDisposition, "deferred");
    assert.equal(result.linearIssueId, null);
    assert.match(result.promotionReason, /deferred/i);
    assert.equal(warnings.length, 1);
  } finally {
    console.warn = originalWarn;
  }
});

test("DesktopBugReportingService returns created Linear issue metadata when promotion succeeds", async () => {
  const captured = [];
  const createRequests = [];
  const service = new DesktopBugReportingService({
    env: {
      HOME: "/Users/george",
    },
    runtimeInfo: {
      apiVersion: "1.0.0",
      appVersion: "0.11.0",
      electronVersion: "35.2.1",
      platform: "darwin",
      startedAt: "2026-04-20T07:00:00.000Z",
    },
    getBootstrap: async () => ({
      profile: {
        id: "default",
        source: "default",
        rootPath: "/tmp/runtime",
        codexHome: "/tmp/codex",
      },
      auth: {
        isSignedIn: true,
        email: "george@example.com",
        accountType: "chatgpt",
        requiresOpenaiAuth: false,
      },
      runtime: {
        apiVersion: "1.0.0",
        appVersion: "0.11.0",
        electronVersion: "35.2.1",
        platform: "darwin",
        startedAt: "2026-04-20T07:00:00.000Z",
        state: "running",
        lastError: null,
        restartCount: 0,
        lastStateAt: "2026-04-20T07:00:00.000Z",
      },
      profileId: "default",
      profileOptions: [],
      isSignedIn: true,
      accountEmail: "george@example.com",
      runtimeStatus: { appVersion: "0.11.0", platform: "darwin" },
      runtimeSetup: null,
      tenant: null,
      teamSetup: {
        mode: "local",
        source: "desktopLocal",
        canWorkLocally: true,
        canCreateFirstTeam: true,
        canManageTeam: true,
      },
      runContext: null,
      auditEvents: [],
      recentThreads: [],
      recentFolders: [],
      workspaceSidebarOrder: [],
      lastSelectedThreadId: null,
      selectedThread: null,
      pendingApprovals: [],
    }),
    getVisibleThreadContext: () => ({
      id: "thread-3",
      title: "Screenshot handoff",
      workspaceRoot: "/Users/george/project",
      cwd: "/Users/george/project",
    }),
    getRecentLogs: () => [{
      level: "warn",
      message: "Workspace write failed at /Users/george/project",
      timestamp: "2026-04-20T07:10:00.000Z",
    }],
    captureManualBugReport: ({ report, context }) => {
      captured.push({ report, context });
      return "evt_created";
    },
    linearIssueAdapter: /** @type {any} */ ({
      isConfigured: () => true,
      createIssue: async (request) => {
        createRequests.push(request);
        return {
          id: "issue_123",
          identifier: "SEN-70",
          url: "https://linear.app/sense-1/issue/SEN-70",
        };
      },
    }),
  });

  const result = await service.submitReport({
    reportType: "manual",
    title: "Composer screenshot attachment disappears before submit",
    description: "Attaching a screenshot should survive submission and create a ticket when the report is actionable.",
    expectedBehavior: "The screenshot metadata should reach the backend contract.",
    reproductionSteps: "1. Attach screenshot\n2. Submit bug report",
    severity: "high",
    attachments: [{
      kind: "screenshot",
      path: "/Users/george/Desktop/report.png",
      mimeType: "image/png",
    }],
  });

  assert.equal(captured.length, 1);
  assert.equal(captured[0]?.report.attachments[0]?.kind, "screenshot");
  assert.equal(captured[0]?.report.attachments[0]?.path, "~/Desktop/report.png");
  assert.equal(createRequests.length, 1);
  assert.equal(createRequests[0]?.title, "Composer screenshot attachment disappears before submit");
  assert.match(createRequests[0]?.description ?? "", /Sentry event ID: `evt_created`/);
  assert.match(createRequests[0]?.description ?? "", /Attachment metadata/);
  assert.match(createRequests[0]?.description ?? "", /screenshot: `~\/Desktop\/report.png`/);
  assert.equal(result.sentryEventId, "evt_created");
  assert.equal(result.promotionDisposition, "create");
  assert.equal(result.linearIssueId, "issue_123");
  assert.equal(result.linearIssueUrl, "https://linear.app/sense-1/issue/SEN-70");
});
