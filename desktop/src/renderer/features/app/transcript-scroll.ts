import type { DesktopThreadSnapshot } from "../../../main/contracts";

const TRANSCRIPT_AUTO_FOLLOW_DISTANCE_PX = 8;
const TRANSCRIPT_STREAM_SCROLL_BUCKET_CHARS = 1024;
const LARGE_TRANSCRIPT_STREAM_SCROLL_BUCKET_CHARS = 4096;
const HUGE_TRANSCRIPT_STREAM_SCROLL_BUCKET_CHARS = 8192;

export function shouldAutoFollowTranscript(distanceFromBottom: number): boolean {
  return distanceFromBottom <= TRANSCRIPT_AUTO_FOLLOW_DISTANCE_PX;
}

export function resolveTranscriptScrollBucketChars(entryBodyLength: number): number {
  if (entryBodyLength >= 64_000) {
    return HUGE_TRANSCRIPT_STREAM_SCROLL_BUCKET_CHARS;
  }

  if (entryBodyLength >= 16_000) {
    return LARGE_TRANSCRIPT_STREAM_SCROLL_BUCKET_CHARS;
  }

  return TRANSCRIPT_STREAM_SCROLL_BUCKET_CHARS;
}

export function buildTranscriptScrollAnchor(
  entry: DesktopThreadSnapshot["entries"][number] | null | undefined,
  liveStreamingBody: string | null = null,
): string {
  if (!entry) {
    return "";
  }

  const entryStatus = "status" in entry ? entry.status : "";
  const entryBodyLength =
    entryStatus === "streaming" && typeof liveStreamingBody === "string"
      ? liveStreamingBody.length
      : "body" in entry && typeof entry.body === "string"
        ? entry.body.length
      : 0;
  const entryScrollBucket = entryStatus === "streaming"
    ? Math.floor(entryBodyLength / resolveTranscriptScrollBucketChars(entryBodyLength))
    : 0;
  return `${entry.id}:${entryStatus}:${entryScrollBucket}`;
}
