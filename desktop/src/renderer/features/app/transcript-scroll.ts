import type { DesktopThreadSnapshot } from "../../../main/contracts";

const TRANSCRIPT_AUTO_FOLLOW_DISTANCE_PX = 8;
const TRANSCRIPT_STREAM_SCROLL_BUCKET_CHARS = 1024;

export function shouldAutoFollowTranscript(distanceFromBottom: number): boolean {
  return distanceFromBottom <= TRANSCRIPT_AUTO_FOLLOW_DISTANCE_PX;
}

export function buildTranscriptScrollAnchor(entry: DesktopThreadSnapshot["entries"][number] | null | undefined): string {
  if (!entry) {
    return "";
  }

  const entryBodyLength =
    "body" in entry && typeof entry.body === "string"
      ? entry.body.length
      : 0;
  const entryStatus = "status" in entry ? entry.status : "";
  const entryScrollBucket = entryStatus === "streaming"
    ? Math.floor(entryBodyLength / TRANSCRIPT_STREAM_SCROLL_BUCKET_CHARS)
    : 0;
  return `${entry.id}:${entryStatus}:${entryScrollBucket}`;
}
