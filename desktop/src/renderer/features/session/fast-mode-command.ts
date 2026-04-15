export type FastModeAction = "on" | "off" | "status";

export type FastModeSuggestion = {
  command: string;
  description: string;
  label: string;
};

const FAST_MODE_SUGGESTIONS = Object.freeze([
  {
    command: "/fast on",
    description: "Enable fast service tier for new runs.",
    label: "Enable Fast mode",
  },
  {
    command: "/fast off",
    description: "Return to the default flex tier.",
    label: "Disable Fast mode",
  },
  {
    command: "/fast status",
    description: "Show whether Fast mode is active.",
    label: "Show Fast mode status",
  },
]);

export function parseFastModeCommand(prompt: string): FastModeAction | null {
  const match = prompt.trim().match(/^\/fast(?:\s+(on|off|status))?$/iu);
  if (!match) {
    return null;
  }

  const action = match[1]?.toLowerCase() ?? "status";
  if (action === "on" || action === "off" || action === "status") {
    return action;
  }

  return null;
}

export function resolveFastModeSuggestions(prompt: string, cursorIndex: number): FastModeSuggestion[] {
  const beforeCursor = prompt.slice(0, cursorIndex);
  const afterCursor = prompt.slice(cursorIndex);
  if (afterCursor.trim().length > 0) {
    return [];
  }

  const trimmed = beforeCursor.trim();
  if (!trimmed.startsWith("/")) {
    return [];
  }

  if (parseFastModeCommand(trimmed) !== null) {
    return [];
  }

  if ("/fast".startsWith(trimmed.toLowerCase())) {
    return [...FAST_MODE_SUGGESTIONS];
  }

  const match = trimmed.match(/^\/fast(?:\s+(\S*))?$/iu);
  if (!match) {
    return [];
  }

  const actionFragment = match[1]?.toLowerCase() ?? "";
  return FAST_MODE_SUGGESTIONS.filter((suggestion) => {
    const action = suggestion.command.split(/\s+/u)[1] ?? "";
    return action.startsWith(actionFragment);
  });
}

export function applyFastModeSuggestion(command: string) {
  return {
    cursorIndex: command.length,
    prompt: command,
  };
}
