import { ChevronDown, Folder } from "lucide-react";

import { Input } from "../ui/input";
import { formatWorkspaceOptionLabel, normalizeWorkspaceOptions } from "./automation-form-utils.js";

type AutomationWorkspaceFieldProps = {
  mode: "recent" | "custom";
  onChange: (value: string) => void;
  onModeChange: (mode: "recent" | "custom") => void;
  options: string[];
  value: string;
};

const CUSTOM_WORKSPACE_VALUE = "__custom_workspace__";

export function AutomationWorkspaceField({
  mode,
  onChange,
  onModeChange,
  options,
  value,
}: AutomationWorkspaceFieldProps) {
  const normalizedOptions = normalizeWorkspaceOptions(options);
  const selectedValue = mode === "custom"
    ? CUSTOM_WORKSPACE_VALUE
    : normalizedOptions.includes(value.trim())
      ? value.trim()
      : "";

  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Workspace</span>
      <div className="rounded-2xl border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none focus-within:ring-[3px] focus-within:ring-accent/30">
        <div className="flex items-center gap-2">
          <Folder className="size-4 shrink-0 text-muted" />
          <select
            className="min-w-0 flex-1 bg-transparent outline-none"
            onChange={(event) => {
              const nextValue = event.target.value;
              if (nextValue === CUSTOM_WORKSPACE_VALUE) {
                onModeChange("custom");
                return;
              }
              onModeChange("recent");
              onChange(nextValue);
            }}
            title={value || "Choose a workspace"}
            value={selectedValue}
          >
            <option value="">Choose workspace</option>
            {normalizedOptions.map((workspacePath) => (
              <option key={workspacePath} value={workspacePath}>
                {formatWorkspaceOptionLabel(workspacePath)}
              </option>
            ))}
            <option value={CUSTOM_WORKSPACE_VALUE}>Custom path...</option>
          </select>
          <ChevronDown className="size-4 shrink-0 text-muted" />
        </div>
      </div>
      {mode === "custom" ? (
        <Input
          onChange={(event) => onChange(event.target.value)}
          placeholder="/absolute/path/to/project"
          value={value}
        />
      ) : null}
      <p className="text-xs leading-5 text-ink-muted">
        {mode === "custom"
          ? "Type a path directly when the workspace is not already in recent workspaces."
          : "Pick a recent workspace or switch to a custom path."}
      </p>
    </label>
  );
}
