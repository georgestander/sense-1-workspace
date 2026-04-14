export interface DesktopVoiceAudioChunk {
  readonly data: string;
  readonly sampleRate: number;
  readonly numChannels: number;
  readonly samplesPerChannel: number | null;
  readonly itemId?: string | null;
}

export interface DesktopVoiceStartRequest {
  readonly threadId: string;
  readonly prompt?: string | null;
  readonly sessionId?: string | null;
}

export interface DesktopVoiceAppendAudioRequest {
  readonly threadId: string;
  readonly audio: DesktopVoiceAudioChunk;
}

export interface DesktopVoiceStopRequest {
  readonly threadId: string;
}

export type DesktopVoiceState = "starting" | "active" | "stopped";
