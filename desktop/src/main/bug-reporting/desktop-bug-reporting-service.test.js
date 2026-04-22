import test from "node:test";
import assert from "node:assert/strict";

import { DesktopBugReportingService } from "./desktop-bug-reporting-service.ts";

test("DesktopBugReportingService submits reports to Sentry with redacted diagnostics", async () => {
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
    getRecentMainSentryEvents: () => [{
      eventId: "main_evt_1",
      source: "main",
      title: "Error: runtime bridge failed at /Users/george/project",
      level: "error",
      timestamp: "2026-04-20T07:09:00.000Z",
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
    correlation: {
      view: {
        view: "thread",
        url: "http://localhost:5173/",
        documentTitle: "Sense-1 Workspace",
        selectedThreadId: "thread-1",
      },
      recentActions: [{
        kind: "click",
        status: "observed",
        name: "Send prompt",
        detail: "/Users/george/project",
        timestamp: "2026-04-20T07:09:30.000Z",
      }],
      recentEvents: [{
        eventId: "renderer_evt_1",
        source: "renderer",
        title: "Error: Composer failed at /Users/george/project",
        level: "error",
        timestamp: "2026-04-20T07:09:20.000Z",
      }],
    },
  });

  assert.equal(captured.length, 1);
  assert.equal(captured[0]?.report.attachments[0]?.path, "~/Desktop/screenshot.png");
  assert.equal(captured[0]?.report.correlation?.recentActions[0]?.detail, "~/project");
  assert.equal(captured[0]?.report.correlation?.recentEvents[0]?.title, "Error: Composer failed at ~/project");
  assert.equal(captured[0]?.context.thread?.workspaceRoot, "~/project");
  assert.equal(captured[0]?.context.thread?.cwd, "~/project");
  assert.equal(captured[0]?.context.recentMainSentryEvents[0]?.title, "Error: runtime bridge failed at ~/project");
  assert.equal(result.sentryEventId, "evt_123");
  assert.equal(result.sentryIssueUrl, null);
});

test("DesktopBugReportingService redacts Windows paths before sending Sentry intake", async () => {
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
    getRecentMainSentryEvents: () => [{
      eventId: "main_evt_2",
      source: "main",
      title: "Error: write EPIPE in C:\\Users\\George\\project",
      level: "fatal",
      timestamp: "2026-04-20T07:09:00.000Z",
    }],
    captureManualBugReport: ({ report, context }) => {
      captured.push({ report, context });
      return "evt_456";
    },
  });

  const result = await service.submitReport({
    reportType: "manual",
    title: "Save action fails on Windows",
    description: "Saving after opening the workspace fails and should keep the screenshot attached.",
    expectedBehavior: null,
    reproductionSteps: null,
    severity: "high",
    attachments: [{
      kind: "file",
      path: "C:\\Users\\George\\Desktop\\screenshot.png",
      mimeType: "image/png",
    }],
    correlation: {
      view: {
        view: "automations",
        url: "http://localhost:5173/",
        documentTitle: "Sense-1 Workspace",
        selectedThreadId: "thread-2",
      },
      recentActions: [{
        kind: "action",
        status: "failed",
        name: "Create automation",
        detail: "C:\\Users\\George\\project",
        timestamp: "2026-04-20T07:09:30.000Z",
      }],
      recentEvents: [],
    },
  });

  assert.equal(captured.length, 1);
  assert.equal(captured[0]?.report.attachments[0]?.path, "~\\Desktop\\screenshot.png");
  assert.equal(captured[0]?.report.correlation?.recentActions[0]?.detail, "~\\project");
  assert.equal(captured[0]?.context.thread?.workspaceRoot, "~\\project");
  assert.equal(captured[0]?.context.thread?.cwd, "~\\project");
  assert.equal(captured[0]?.context.recentMainSentryEvents[0]?.title, "Error: write EPIPE in ~\\project");
  assert.equal(result.sentryEventId, "evt_456");
  assert.equal(result.sentryIssueUrl, null);
});
