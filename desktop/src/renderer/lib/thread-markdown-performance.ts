const FENCED_CODE_BLOCK_PATTERN = /(^|\n)\s*(`{3,}|~{3,})/;
const LIST_ITEM_PATTERN = /^\s*(?:[-*+]|\d+[.)])\s+/;

const LARGE_MARKDOWN_CHARACTER_THRESHOLD = 6_000;
const LARGE_MARKDOWN_LINE_THRESHOLD = 120;
const LARGE_MARKDOWN_LIST_ITEM_THRESHOLD = 80;
const DEFERRED_RICH_MARKDOWN_CHARACTER_THRESHOLD = 12_000;
const DEFERRED_RICH_MARKDOWN_LINE_THRESHOLD = 220;
const DEFERRED_RICH_MARKDOWN_LIST_ITEM_THRESHOLD = 140;

function countListItems(lines: string[]): number {
  let listItemCount = 0;
  for (const line of lines) {
    if (!LIST_ITEM_PATTERN.test(line)) {
      continue;
    }

    listItemCount += 1;
  }

  return listItemCount;
}

export function hasFencedCodeBlocks(markdown: string): boolean {
  return FENCED_CODE_BLOCK_PATTERN.test(markdown);
}

export function shouldUseVirtualizedMarkdown(markdown: string): boolean {
  if (!markdown.trim()) {
    return false;
  }

  if (markdown.length >= LARGE_MARKDOWN_CHARACTER_THRESHOLD) {
    return true;
  }

  const lines = markdown.split(/\r?\n/);
  if (lines.length >= LARGE_MARKDOWN_LINE_THRESHOLD) {
    return true;
  }

  return countListItems(lines) >= LARGE_MARKDOWN_LIST_ITEM_THRESHOLD;
}

export function shouldDeferRichMarkdown(markdown: string): boolean {
  if (!markdown.trim()) {
    return false;
  }

  if (markdown.length >= DEFERRED_RICH_MARKDOWN_CHARACTER_THRESHOLD) {
    return true;
  }

  const lines = markdown.split(/\r?\n/);
  if (lines.length >= DEFERRED_RICH_MARKDOWN_LINE_THRESHOLD) {
    return true;
  }

  return countListItems(lines) >= DEFERRED_RICH_MARKDOWN_LIST_ITEM_THRESHOLD;
}
