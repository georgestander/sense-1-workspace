import test from "node:test";
import assert from "node:assert/strict";

import { ThreadInputQueueService } from "./thread-input-queue-service.ts";

test("queueInput adds FIFO follow-ups with stable ids", () => {
  const service = new ThreadInputQueueService();

  const firstState = service.queueInput("thread-1", "First follow-up");
  const secondState = service.queueInput("thread-1", "Second follow-up");

  assert.deepEqual(
    firstState?.queuedMessages.map((message) => message.id),
    ["queued-1"],
  );
  assert.deepEqual(
    secondState?.queuedMessages.map((message) => message.text),
    ["First follow-up", "Second follow-up"],
  );
});

test("handleTurnCompleted drains the next queued message only after successful completion", () => {
  const service = new ThreadInputQueueService();
  service.queueInput("thread-1", "First follow-up");
  service.queueInput("thread-1", "Second follow-up");

  const completion = service.handleTurnCompleted({
    threadId: "thread-1",
    visibleThreadId: "thread-2",
    windowFocused: true,
    status: "completed",
  });

  assert.equal(completion.nextQueuedMessage?.text, "First follow-up");
  assert.deepEqual(
    completion.threadInputState?.queuedMessages.map((message) => message.text),
    ["Second follow-up"],
  );
  assert.equal(completion.shouldNotify, false);
});

test("restoreQueuedMessage puts a drained follow-up back at the front of the queue", () => {
  const service = new ThreadInputQueueService();
  service.queueInput("thread-1", "First follow-up");
  service.queueInput("thread-1", "Second follow-up");

  const completion = service.handleTurnCompleted({
    threadId: "thread-1",
    visibleThreadId: "thread-2",
    windowFocused: true,
    status: "completed",
  });
  assert.ok(completion.nextQueuedMessage);
  const restoredState = service.restoreQueuedMessage("thread-1", completion.nextQueuedMessage);

  assert.deepEqual(
    restoredState?.queuedMessages.map((message) => message.text),
    ["First follow-up", "Second follow-up"],
  );
  assert.deepEqual(
    restoredState?.queuedMessages.map((message) => message.id),
    ["queued-1", "queued-2"],
  );
});

test("handleTurnCompleted keeps queued follow-ups intact after interruption and surfaces completion state", () => {
  const service = new ThreadInputQueueService();
  service.queueInput("thread-1", "Still queued");

  const completion = service.handleTurnCompleted({
    threadId: "thread-1",
    visibleThreadId: null,
    windowFocused: false,
    status: "interrupted",
  });

  assert.equal(completion.nextQueuedMessage, null);
  assert.equal(completion.threadInputState?.lastCompletionStatus, "interrupted");
  assert.equal(completion.threadInputState?.hasUnseenCompletion, true);
  assert.deepEqual(
    completion.threadInputState?.queuedMessages.map((message) => message.text),
    ["Still queued"],
  );
  assert.equal(completion.shouldNotify, true);
});

test("markThreadViewed clears unseen completion without dropping queued messages", () => {
  const service = new ThreadInputQueueService();
  service.queueInput("thread-1", "Queued");
  service.handleTurnCompleted({
    threadId: "thread-1",
    visibleThreadId: "thread-2",
    windowFocused: true,
    status: "failed",
  });

  const viewedState = service.markThreadViewed("thread-1");

  assert.equal(viewedState?.hasUnseenCompletion, false);
  assert.deepEqual(
    viewedState?.queuedMessages.map((message) => message.text),
    ["Queued"],
  );
});
