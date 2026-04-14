export interface DesktopVoiceAudioChunk {
  readonly data: string;
  readonly sampleRate: number;
  readonly numChannels: number;
  readonly samplesPerChannel: number | null;
  readonly itemId?: string | null;
}

export type DesktopVoiceOutputModality = "text" | "audio";

export type DesktopVoiceStartTransport =
  | {
      readonly type: "websocket";
    }
  | {
      readonly type: "webrtc";
      readonly sdp: string;
    };

export interface DesktopVoiceStartRequest {
  readonly threadId: string;
  readonly prompt?: string | null;
  readonly outputModality?: DesktopVoiceOutputModality;
  readonly sessionId?: string | null;
  readonly transport?: DesktopVoiceStartTransport | null;
}

export interface DesktopVoiceAppendAudioRequest {
  readonly threadId: string;
  readonly audio: DesktopVoiceAudioChunk;
}

export interface DesktopVoiceStopRequest {
  readonly threadId: string;
}

export type DesktopVoiceState = "starting" | "active" | "stopped";
