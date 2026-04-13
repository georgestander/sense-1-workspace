import type { Dispatch, SetStateAction } from "react";

import { Button } from "../ui/button";
import { cn } from "../../lib/cn";
import { type DesktopInputQuestion, type DesktopInputRequestState } from "../../../main/contracts";

type ThreadClarificationPanelProps = {
  threadInputRequest: DesktopInputRequestState | null;
  clarificationAnswer: string;
  clarificationPending: boolean;
  setClarificationAnswer: Dispatch<SetStateAction<string>>;
  setClarificationPending: Dispatch<SetStateAction<boolean>>;
  selectedChipIndex: number | null;
  setSelectedChipIndex: Dispatch<SetStateAction<number | null>>;
  structuredQuestions: DesktopInputQuestion[];
  hasStructuredQuestions: boolean;
  respondToInputRequest: (requestId: number, text: string) => Promise<void>;
};

export function ThreadClarificationPanel({
  threadInputRequest,
  clarificationAnswer,
  clarificationPending,
  setClarificationAnswer,
  setClarificationPending,
  selectedChipIndex,
  setSelectedChipIndex,
  structuredQuestions,
  hasStructuredQuestions,
  respondToInputRequest,
}: ThreadClarificationPanelProps) {
  if (!threadInputRequest) {
    return null;
  }

  return (
    <div className="animate-fade-in-up">
      <div className="w-full rounded-2xl bg-surface-high">
        <div className="p-[1.25rem]">
          {hasStructuredQuestions ? (
            structuredQuestions.map((question, qIndex) => (
              <div key={question.id ?? qIndex} className={cn(qIndex > 0 && "mt-[1.25rem]")}>
                {question.header ? <p className="mb-[0.2rem] text-[0.6875rem] font-medium uppercase tracking-[0.05em] text-ink-muted">{question.header}</p> : null}
                <p className="font-display text-[1rem] font-semibold leading-[1.45] text-ink">{question.question}</p>
                {question.choices.length > 0 ? (
                  <div className="mt-[0.65rem] space-y-[0.4rem]">
                    {question.choices.map((choice, cIndex) => (
                      <button
                        className={cn(
                          "flex w-full items-center gap-[0.65rem] rounded-lg px-[0.9rem] py-[0.65rem] text-left text-[0.875rem] leading-[1.6] transition-colors",
                          selectedChipIndex === cIndex ? "bg-accent-faint text-accent ring-1 ring-accent/30" : "bg-surface-low text-ink hover:bg-accent-faint",
                        )}
                        key={cIndex}
                        onClick={() => {
                          setSelectedChipIndex(cIndex);
                          setClarificationAnswer(choice.value ?? choice.label);
                        }}
                        type="button"
                      >
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface text-[0.75rem] font-medium text-ink-muted">{cIndex + 1}</span>
                        <span>
                          {choice.label}
                          {choice.description ? <span className="ml-1 text-ink-muted">{choice.description}</span> : null}
                        </span>
                      </button>
                    ))}
                    {question.isOther ? (
                      <button
                        className={cn(
                          "flex w-full items-center gap-[0.65rem] rounded-lg px-[0.9rem] py-[0.65rem] text-left text-[0.875rem] leading-[1.6] transition-colors",
                          selectedChipIndex === question.choices.length ? "bg-accent-faint text-accent ring-1 ring-accent/30" : "bg-surface-low text-ink-muted hover:bg-accent-faint",
                        )}
                        onClick={() => {
                          setSelectedChipIndex(question.choices.length);
                          setClarificationAnswer("");
                        }}
                        type="button"
                      >
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface text-[0.75rem] font-medium text-ink-muted">
                          {question.choices.length + 1}
                        </span>
                        Something else
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <p className="font-display text-[1rem] font-semibold leading-[1.45] text-ink">{threadInputRequest.prompt || "Sense-1 needs your input."}</p>
          )}

          <div className="mt-[0.65rem]">
            <textarea
              className="min-h-[2.8rem] w-full resize-none rounded-lg bg-canvas px-[0.65rem] py-[0.4rem] text-[0.875rem] leading-[1.6] text-ink outline-none transition-all placeholder:text-ink-muted focus:ring-1 focus:ring-line"
              disabled={clarificationPending}
              onChange={(event) => {
                setClarificationAnswer(event.target.value);
                setSelectedChipIndex(null);
              }}
              onInput={(event) => {
                const target = event.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = `${target.scrollHeight}px`;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && clarificationAnswer.trim() && threadInputRequest.requestId != null) {
                  event.preventDefault();
                  setClarificationPending(true);
                  void respondToInputRequest(threadInputRequest.requestId, clarificationAnswer.trim()).finally(() => {
                    setClarificationPending(false);
                    setClarificationAnswer("");
                    setSelectedChipIndex(null);
                  });
                }
              }}
              placeholder="Type your answer..."
              rows={1}
              value={clarificationAnswer}
            />
          </div>

          <div className="mt-[0.65rem] flex items-center gap-[0.4rem]">
            <Button
              className="flex-1 rounded-md bg-ink text-canvas hover:bg-ink/90"
              disabled={clarificationPending || !clarificationAnswer.trim() || threadInputRequest.requestId == null}
              onClick={() => {
                if (threadInputRequest.requestId == null) return;
                setClarificationPending(true);
                void respondToInputRequest(threadInputRequest.requestId, clarificationAnswer.trim()).finally(() => {
                  setClarificationPending(false);
                  setClarificationAnswer("");
                  setSelectedChipIndex(null);
                });
              }}
              size="sm"
            >
              {selectedChipIndex != null ? "Enter to select" : "Send answer"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
