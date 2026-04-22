export type StreamingAssistantPreview = {
  hiddenCharacterCount: number;
  truncated: boolean;
  visibleText: string;
};

const STREAMING_PREVIEW_THRESHOLD_CHARS = 12_000;
const STREAMING_PREVIEW_TAIL_CHARS = 8_000;

export function buildStreamingAssistantPreview(text: string): StreamingAssistantPreview {
  if (text.length <= STREAMING_PREVIEW_THRESHOLD_CHARS) {
    return {
      hiddenCharacterCount: 0,
      truncated: false,
      visibleText: text,
    };
  }

  const visibleText = text.slice(-STREAMING_PREVIEW_TAIL_CHARS).trimStart();
  return {
    hiddenCharacterCount: Math.max(text.length - visibleText.length, 0),
    truncated: true,
    visibleText,
  };
}
