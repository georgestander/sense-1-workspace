import { useState } from "react";

interface AffectedLocationsProps {
  locations: string[];
  wsRoot: string | null;
}

/**
 * Strips the workspace root prefix from an absolute path, returning a
 * workspace-relative path.
 */
function relativize(location: string, wsRoot: string | null): string {
  if (wsRoot && location.startsWith(wsRoot)) {
    return location.slice(wsRoot.length).replace(/^\//, "");
  }
  return location;
}

/**
 * Derives a human-readable scope summary from a set of affected paths.
 */
function buildScopeSummary(
  relativePaths: string[],
): { text: string; segments: string[] } {
  if (relativePaths.length === 0) {
    return { text: "", segments: [] };
  }

  if (relativePaths.length === 1) {
    if (relativePaths[0] === ".") {
      return { text: "Changes may affect the entire workspace", segments: [] };
    }
    return {
      text: "Changes will affect {0}",
      segments: [relativePaths[0]],
    };
  }

  // If any path is "." (the workspace root), the scope is the whole workspace
  if (relativePaths.includes(".")) {
    return { text: "Changes may affect the entire workspace", segments: [] };
  }

  // Extract unique top-level directories (first segment of each path)
  const topLevelDirs = Array.from(
    new Set(
      relativePaths.map((p) => {
        const first = p.split("/")[0];
        return p.includes("/") ? `${first}/` : first;
      }),
    ),
  );

  if (topLevelDirs.length === 1) {
    return {
      text: "Changes will be in the {0} directory",
      segments: [topLevelDirs[0]],
    };
  }

  if (topLevelDirs.length <= 3) {
    return {
      text: "Changes will touch {dirs}",
      segments: topLevelDirs,
    };
  }

  return {
    text: `Changes will touch ${topLevelDirs.length} areas of the project`,
    segments: [],
  };
}

/**
 * Renders an inline-code styled span for directory / file names inside the
 * scope summary.
 */
function InlineCode({ children }: { children: string }) {
  return (
    <code className="rounded-sm bg-surface-low px-[0.25rem] font-mono text-[0.8125rem]">
      {children}
    </code>
  );
}

/**
 * Renders a human-readable scope summary line. Replaces placeholder tokens
 * with InlineCode-wrapped segments.
 */
function ScopeSummaryLine({ relativePaths }: { relativePaths: string[] }) {
  const { text, segments } = buildScopeSummary(relativePaths);

  if (!text) return null;

  // Single-segment placeholder: {0}
  if (text.includes("{0}")) {
    const parts = text.split("{0}");
    return (
      <p className="mt-[0.4rem] text-[0.875rem] leading-[1.6] text-ink">
        {parts[0]}
        <InlineCode>{segments[0]}</InlineCode>
        {parts[1]}
      </p>
    );
  }

  // Multi-segment placeholder: {dirs}
  if (text.includes("{dirs}")) {
    const prefix = text.split("{dirs}")[0];
    return (
      <p className="mt-[0.4rem] text-[0.875rem] leading-[1.6] text-ink">
        {prefix}
        {segments.map((seg, i) => (
          <span key={seg}>
            {i > 0 && i < segments.length - 1 && ", "}
            {i > 0 && i === segments.length - 1 && ", and "}
            <InlineCode>{seg}</InlineCode>
          </span>
        ))}
      </p>
    );
  }

  // Plain text (4+ dirs)
  return (
    <p className="mt-[0.4rem] text-[0.875rem] leading-[1.6] text-ink">
      {text}
    </p>
  );
}

export function AffectedLocations({ locations, wsRoot }: AffectedLocationsProps) {
  const [expanded, setExpanded] = useState(false);

  const relativePaths = locations.map((loc) => relativize(loc, wsRoot) || ".");

  return (
    <div className="mt-[0.65rem]">
      <p className="text-[0.75rem] font-medium uppercase leading-[1.2] tracking-[0.05em] text-ink-muted">
        Where changes will happen
      </p>
      <ScopeSummaryLine relativePaths={relativePaths} />
      <button
        className="mt-[0.4rem] cursor-pointer bg-transparent p-0 text-[0.8125rem] leading-[1.52] text-accent hover:underline"
        onClick={() => setExpanded((prev) => !prev)}
        type="button"
      >
        {expanded ? "Hide paths" : `Show ${relativePaths.length} path${relativePaths.length === 1 ? "" : "s"}`}
      </button>
      <div
        className="grid transition-[grid-template-rows,opacity] duration-300"
        style={{
          gridTemplateRows: expanded ? "1fr" : "0fr",
          opacity: expanded ? 1 : 0,
          transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div className="overflow-hidden">
          <ul className="mt-[0.4rem] space-y-[0.4rem]">
            {relativePaths.map((rp, i) => (
              <li
                className="break-all font-mono text-[0.8125rem] leading-[1.5] text-ink-muted"
                key={i}
              >
                {rp === "." ? "(workspace root)" : rp}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
