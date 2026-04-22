import { Children, isValidElement, memo, Profiler, startTransition, useCallback, useEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { cn } from "./lib/cn";
import { getFileIcon, getFileLabel as getFileTypeLabel } from "./lib/file-icons";
import { isExternalUrl, isFilePath } from "./lib/link-targets.ts";
import { tracePerfEvent } from "./lib/perf-debug.ts";
import { extractStandaloneArtifactTarget, resolveArtifactPath } from "./lib/thread-artifacts";
import { hasFencedCodeBlocks, shouldDeferRichMarkdown, shouldUseVirtualizedMarkdown } from "./lib/thread-markdown-performance.ts";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  return (
    <button
      className="rounded bg-surface-soft px-1.5 py-0.5 text-[0.6rem] font-medium text-ink-muted transition-colors hover:text-ink"
      onClick={handleCopy}
      type="button"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function extractLanguage(preChildren: ReactNode): string | null {
  if (!preChildren || typeof preChildren !== "object" || !("props" in (preChildren as unknown as Record<string, unknown>))) {
    return null;
  }
  const child = preChildren as { props?: { className?: string } };
  const className = child.props?.className || "";
  const match = className.match(/language-(\w+)/);
  return match ? match[1] : null;
}

function extractCodeText(preChildren: ReactNode): string {
  if (!preChildren || typeof preChildren !== "object" || !("props" in (preChildren as unknown as Record<string, unknown>))) {
    return "";
  }
  const child = preChildren as { props?: { children?: ReactNode } };
  const inner = child.props?.children;
  if (typeof inner === "string") {
    return inner;
  }
  return "";
}

const FILE_EXT_LABELS: Record<string, string> = {
  html: "HTML",
  htm: "HTML",
  css: "CSS",
  js: "JavaScript",
  jsx: "JSX",
  ts: "TypeScript",
  tsx: "TSX",
  json: "JSON",
  md: "Markdown",
  py: "Python",
  rb: "Ruby",
  go: "Go",
  rs: "Rust",
  sh: "Shell",
  yml: "YAML",
  yaml: "YAML",
  toml: "TOML",
  sql: "SQL",
  csv: "CSV",
  xml: "XML",
  svg: "SVG",
  pdf: "PDF",
  doc: "Word",
  docx: "Word",
  xls: "Excel",
  xlsx: "Excel",
  txt: "Text",
};

function getFileLabel(href: string): string {
  const ext = href.split(".").pop()?.toLowerCase() || "";
  return FILE_EXT_LABELS[ext] || ext.toUpperCase() || "File";
}

function getFileName(href: string): string {
  return href.split(/[\\/]/).pop() || href;
}

function ArtifactLinkCard({
  href,
  children,
  workspaceRoot = null,
}: {
  href: string;
  children: ReactNode;
  workspaceRoot?: string | null;
}) {
  const fileName = getFileName(href);
  const fileLabel = getFileLabel(href);

  const handleClick = () => {
    const bridge = (window as unknown as {
      sense1Desktop?: {
        workspace?: { openFilePath?: (path: string) => Promise<unknown> };
        window?: { openExternalUrl?: (url: string) => Promise<unknown> };
      };
    }).sense1Desktop;
    if (isExternalUrl(href) && bridge?.window?.openExternalUrl) {
      void bridge.window.openExternalUrl(href);
      return;
    }
    const resolvedPath = resolveArtifactPath(href, workspaceRoot);
    if (bridge?.workspace?.openFilePath && resolvedPath) {
      void bridge.workspace.openFilePath(resolvedPath);
    }
  };

  return (
    <div
      className="my-2 flex w-full cursor-pointer items-center gap-3 rounded-xl bg-ink px-4 py-3 text-left shadow-[var(--shadow-raised)] transition-all hover:opacity-90 active:scale-[0.99]"
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleClick(); }}
      role="button"
      tabIndex={0}
    >
      {(() => { const IconComponent = getFileIcon(fileName); return <IconComponent className="size-5 shrink-0 text-canvas/80" />; })()}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-canvas">{typeof children === "string" ? children : fileName}</p>
        <p className="text-[11px] text-canvas/60">{getFileTypeLabel(fileName)} · Click to open</p>
      </div>
      <svg className="size-5 shrink-0 text-canvas/70" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5M15.75 3h5.25v5.25M21 3l-8.25 8.25" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function extractParagraphArtifactTarget(children: ReactNode): string | null {
  const nodes = Children.toArray(children).filter((child) => {
    return !(typeof child === "string" && !child.trim());
  });
  if (nodes.length !== 1) {
    return null;
  }

  const onlyChild = nodes[0];
  if (typeof onlyChild === "string") {
    return extractStandaloneArtifactTarget(onlyChild);
  }

  if (!isValidElement(onlyChild)) {
    return null;
  }

  const childType = typeof onlyChild.type === "string" ? onlyChild.type : null;
  const childProps = onlyChild.props as { children?: ReactNode; className?: string } | null;
  if (!childProps) {
    return null;
  }
  const childText = typeof childProps?.children === "string" ? childProps.children : null;
  if (childType !== "code" || !childText) {
    return null;
  }

  const className = typeof childProps.className === "string" ? childProps.className : "";
  if (className.includes("language-") || className.includes("hljs")) {
    return null;
  }

  return extractStandaloneArtifactTarget(childText);
}

const remarkPlugins = [remarkGfm];
const rehypePlugins = [rehypeHighlight];

type ThreadMarkdownProps = {
  children: string;
  className?: string;
  workspaceRoot?: string | null;
};

function ThreadMarkdownInner({ children, className, workspaceRoot = null }: ThreadMarkdownProps) {
  const markdownSource = children ?? "";
  const hasVisibleContent = markdownSource.trim().length > 0;
  const enableSyntaxHighlighting = hasVisibleContent && hasFencedCodeBlocks(markdownSource);
  const useVirtualizedMarkdown = hasVisibleContent && shouldUseVirtualizedMarkdown(markdownSource);
  const deferRichMarkdown = hasVisibleContent && !enableSyntaxHighlighting && shouldDeferRichMarkdown(markdownSource);
  const [richMarkdownRequested, setRichMarkdownRequested] = useState(!deferRichMarkdown);
  const resolvedClassName = cn(
    "thread-markdown",
    useVirtualizedMarkdown && "thread-markdown-virtualized",
    className,
  );

  useEffect(() => {
    setRichMarkdownRequested(!deferRichMarkdown);
  }, [deferRichMarkdown, markdownSource]);

  useEffect(() => {
    if (!deferRichMarkdown || richMarkdownRequested) {
      return;
    }

    const promoteTimeout = window.setTimeout(() => {
      startTransition(() => {
        setRichMarkdownRequested(true);
      });
    }, 120);

    return () => {
      window.clearTimeout(promoteTimeout);
    };
  }, [deferRichMarkdown, markdownSource, richMarkdownRequested]);

  const markdownComponents = useMemo<NonNullable<ComponentProps<typeof Markdown>["components"]>>(() => ({
    pre({ children: preChildren, ...rest }: ComponentProps<"pre">) {
      const codeText = extractCodeText(preChildren);
      const language = extractLanguage(preChildren);
      if (!language && codeText) {
        const artifactTarget = extractStandaloneArtifactTarget(codeText.trim());
        if (artifactTarget && resolveArtifactPath(artifactTarget, workspaceRoot)) {
          return <ArtifactLinkCard href={artifactTarget} workspaceRoot={workspaceRoot}>{getFileName(artifactTarget)}</ArtifactLinkCard>;
        }
      }
      return (
        <div className="group relative overflow-hidden rounded bg-canvas">
          <pre className="px-3 py-2.5 text-[0.75rem] leading-[1.5]" {...(rest as ComponentProps<"pre">)}>{preChildren}</pre>
          <div className="absolute right-1.5 top-1.5 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
            {language ? (
              <span className="rounded bg-surface-soft px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wider text-ink-muted">{language}</span>
            ) : null}
            {codeText ? <CopyButton text={codeText} /> : null}
          </div>
        </div>
      );
    },
    table({ children: tableChildren, ...rest }: ComponentProps<"table">) {
      return (
        <div className="overflow-x-auto">
          <table {...(rest as ComponentProps<"table">)}>{tableChildren}</table>
        </div>
      );
    },
    p({ children: pChildren, ...rest }: ComponentProps<"p">) {
      const artifactTarget = extractParagraphArtifactTarget(pChildren);
      if (artifactTarget && resolveArtifactPath(artifactTarget, workspaceRoot)) {
        return (
          <ArtifactLinkCard href={artifactTarget} workspaceRoot={workspaceRoot}>
            {getFileName(artifactTarget)}
          </ArtifactLinkCard>
        );
      }
      return <p {...(rest as ComponentProps<"p">)}>{pChildren}</p>;
    },
    code({ children: codeChildren, className: codeClassName, ...rest }: ComponentProps<"code">) {
      if (codeClassName?.includes("language-") || codeClassName?.includes("hljs")) {
        return <code className={codeClassName} {...(rest as ComponentProps<"code">)}>{codeChildren}</code>;
      }
      return <code {...(rest as ComponentProps<"code">)}>{codeChildren}</code>;
    },
    a({ href, children: linkChildren, ...rest }: ComponentProps<"a">) {
      const resolvedHref = href || "";
      if (isFilePath(resolvedHref) && resolveArtifactPath(resolvedHref, workspaceRoot)) {
        return <ArtifactLinkCard href={resolvedHref} workspaceRoot={workspaceRoot}>{linkChildren}</ArtifactLinkCard>;
      }
      return (
        <a
          href={resolvedHref}
          onClick={(event) => {
            if (!isExternalUrl(resolvedHref)) {
              return;
            }
            event.preventDefault();
            const bridge = (window as unknown as {
              sense1Desktop?: {
                window?: { openExternalUrl?: (url: string) => Promise<unknown> };
              };
            }).sense1Desktop;
            if (bridge?.window?.openExternalUrl) {
              void bridge.window.openExternalUrl(resolvedHref);
            }
          }}
          {...(rest as ComponentProps<"a">)}
        >
          {linkChildren}
        </a>
      );
    },
  }), [workspaceRoot]);

  if (!hasVisibleContent) {
    return <div className={cn("thread-markdown", className)} />;
  }

  const markdown = (
    <Markdown
      components={markdownComponents}
      rehypePlugins={enableSyntaxHighlighting ? rehypePlugins : undefined}
      remarkPlugins={remarkPlugins}
    >
      {markdownSource}
    </Markdown>
  );

  if (deferRichMarkdown && !richMarkdownRequested) {
    return (
      <div className={resolvedClassName}>
        <div className="thread-markdown-plain-preview">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className={resolvedClassName}>
      {useVirtualizedMarkdown ? (
        <Profiler
          id="ThreadMarkdown.large"
          onRender={(_id, phase, actualDuration, baseDuration) => {
            if (actualDuration < 24) {
              return;
            }

            tracePerfEvent("react-render", {
              actualDurationMs: Number(actualDuration.toFixed(2)),
              baseDurationMs: Number(baseDuration.toFixed(2)),
              hasFencedCodeBlocks: enableSyntaxHighlighting,
              phase,
              textLength: markdownSource.length,
              virtualized: useVirtualizedMarkdown,
            }, {
              level: "warn",
              minIntervalMs: 1000,
              throttleKey: `ThreadMarkdown.large:${phase}:${markdownSource.length}`,
            });
          }}
        >
          {markdown}
        </Profiler>
      ) : markdown}
    </div>
  );
}

export const ThreadMarkdown = memo(ThreadMarkdownInner);
