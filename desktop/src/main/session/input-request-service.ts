import type { AppServerProcessManager } from "../runtime/app-server-process-manager.js";
import type { DesktopInputResponseRequest } from "../contracts";
import { resolveDesktopProfile } from "../bootstrap/desktop-bootstrap.js";
import { resolveProfileSubstrateDbPath } from "../profile/profile-state.js";
import {
  answerSubstrateQuestion,
  appendSubstrateEvent,
  appendSubstrateObjectRef,
} from "../substrate/substrate.js";
import { getPendingQuestionByRequestId } from "../substrate/substrate-reader.js";

type RespondToInputRequestArgs = {
  env: NodeJS.ProcessEnv;
  manager: AppServerProcessManager;
  request: DesktopInputResponseRequest;
  resolveProfile?: () => Promise<{ id: string }>;
};

export async function respondToDesktopInputRequest({
  env,
  manager,
  request,
  resolveProfile = async () => await resolveDesktopProfile(env),
}: RespondToInputRequestArgs): Promise<void> {
  const trimmedText = request.text?.trim();
  if (!trimmedText) {
    throw new Error("Provide a response before submitting.");
  }

  const profile = await resolveProfile();
  const dbPath = resolveProfileSubstrateDbPath(profile.id, env);
  const pendingQuestion = await getPendingQuestionByRequestId({
    dbPath,
    requestId: request.requestId,
  });

  manager.respond(request.requestId, { text: trimmedText });

  if (!pendingQuestion) {
    return;
  }

  const targetKind = "pending_run";
  const targetId = pendingQuestion.engine_turn_id ?? pendingQuestion.session_id;
  const targetSnapshot = {
    sessionId: pendingQuestion.session_id,
    threadId: pendingQuestion.codex_thread_id,
    turnId: pendingQuestion.engine_turn_id,
  };
  const answeredQuestion = await answerSubstrateQuestion({
    answerText: trimmedText,
    dbPath,
    questionId: pendingQuestion.id,
    targetId,
    targetKind,
    targetSnapshot,
  });
  if (!answeredQuestion) {
    return;
  }

  await appendSubstrateEvent({
    actorId: answeredQuestion.actor_id,
    afterState: {
      status: "answered",
    },
    beforeState: {
      status: "pending",
    },
    correlationId: answeredQuestion.codex_thread_id,
    dbPath,
    detail: {
      answerText: trimmedText,
      prompt: answeredQuestion.prompt,
      requestId: answeredQuestion.request_id,
      targetId,
      targetKind,
    },
    engineTurnId: answeredQuestion.engine_turn_id,
    profileId: answeredQuestion.profile_id,
    scopeId: answeredQuestion.scope_id,
    sessionId: answeredQuestion.session_id,
    subjectId: answeredQuestion.id,
    subjectType: "question",
    verb: "question.answered",
  });
  await appendSubstrateObjectRef({
    action: "answered",
    dbPath,
    metadata: {
      answerText: trimmedText,
      prompt: answeredQuestion.prompt,
      requestId: answeredQuestion.request_id,
      targetId,
      targetKind,
    },
    refId: answeredQuestion.id,
    refType: "question",
    sessionId: answeredQuestion.session_id,
  });
}
