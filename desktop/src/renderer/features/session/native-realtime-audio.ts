import type { DesktopVoiceAudioChunk } from "../../../main/contracts";

export const MODEL_AUDIO_CHANNELS = 1;
export const MODEL_AUDIO_SAMPLE_RATE = 24_000;

type AudioFrameCopyTarget = Float32Array | Int16Array;

type AudioFrameCopyOptions = {
  planeIndex?: number;
};

export type AudioFrameLike = {
  readonly format?: string;
  readonly numberOfChannels: number;
  readonly numberOfFrames: number;
  readonly sampleRate: number;
  copyTo(destination: AudioFrameCopyTarget, options?: AudioFrameCopyOptions): void;
  close(): void;
};

function encodePcm16Base64(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < samples.length; index += 1) {
    view.setInt16(index * 2, samples[index] ?? 0, true);
  }

  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
  }

  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function clampFloat32ToPcm16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  return clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
}

function readFloat32Planar(frame: AudioFrameLike): Float32Array[] {
  return Array.from({ length: frame.numberOfChannels }, (_unused, planeIndex) => {
    const channel = new Float32Array(frame.numberOfFrames);
    frame.copyTo(channel, { planeIndex });
    return channel;
  });
}

function readInt16Planar(frame: AudioFrameLike): Float32Array[] {
  return Array.from({ length: frame.numberOfChannels }, (_unused, planeIndex) => {
    const channel = new Int16Array(frame.numberOfFrames);
    frame.copyTo(channel, { planeIndex });
    return Float32Array.from(channel, (sample) => sample / 0x8000);
  });
}

function readFloat32Interleaved(frame: AudioFrameLike): Float32Array[] {
  const interleaved = new Float32Array(frame.numberOfFrames * frame.numberOfChannels);
  frame.copyTo(interleaved);
  return Array.from({ length: frame.numberOfChannels }, (_unused, channelIndex) => {
    const channel = new Float32Array(frame.numberOfFrames);
    for (let frameIndex = 0; frameIndex < frame.numberOfFrames; frameIndex += 1) {
      channel[frameIndex] = interleaved[(frameIndex * frame.numberOfChannels) + channelIndex] ?? 0;
    }
    return channel;
  });
}

function readInt16Interleaved(frame: AudioFrameLike): Float32Array[] {
  const interleaved = new Int16Array(frame.numberOfFrames * frame.numberOfChannels);
  frame.copyTo(interleaved);
  return Array.from({ length: frame.numberOfChannels }, (_unused, channelIndex) => {
    const channel = new Float32Array(frame.numberOfFrames);
    for (let frameIndex = 0; frameIndex < frame.numberOfFrames; frameIndex += 1) {
      channel[frameIndex] =
        (interleaved[(frameIndex * frame.numberOfChannels) + channelIndex] ?? 0) / 0x8000;
    }
    return channel;
  });
}

function readFrameChannels(frame: AudioFrameLike): Float32Array[] {
  const format = typeof frame.format === "string" ? frame.format : "f32-planar";
  switch (format) {
    case "f32-planar":
      return readFloat32Planar(frame);
    case "f32":
      return readFloat32Interleaved(frame);
    case "s16-planar":
      return readInt16Planar(frame);
    case "s16":
      return readInt16Interleaved(frame);
    default:
      throw new Error(`Unsupported audio frame format: ${format}`);
  }
}

function resampleAndDownmix(
  channels: readonly Float32Array[],
  sampleRate: number,
): Int16Array {
  const inputFrames = channels[0]?.length ?? 0;
  if (inputFrames === 0) {
    return new Int16Array();
  }

  const outputFrames =
    sampleRate === MODEL_AUDIO_SAMPLE_RATE
      ? inputFrames
      : Math.max(1, Math.round((inputFrames * MODEL_AUDIO_SAMPLE_RATE) / sampleRate));
  const samples = new Int16Array(outputFrames);

  for (let outputFrameIndex = 0; outputFrameIndex < outputFrames; outputFrameIndex += 1) {
    const sourcePosition =
      outputFrames <= 1 || inputFrames <= 1
        ? 0
        : (outputFrameIndex * (inputFrames - 1)) / (outputFrames - 1);
    const lowerFrameIndex = Math.floor(sourcePosition);
    const upperFrameIndex = Math.min(lowerFrameIndex + 1, inputFrames - 1);
    const frameWeight = sourcePosition - lowerFrameIndex;
    let sample = 0;

    for (const channel of channels) {
      const lower = channel[lowerFrameIndex] ?? 0;
      const upper = channel[upperFrameIndex] ?? lower;
      sample += lower + ((upper - lower) * frameWeight);
    }

    samples[outputFrameIndex] = clampFloat32ToPcm16(sample / channels.length);
  }

  return samples;
}

export function appendVoiceTranscriptFragment(currentValue: string, fragment: string): string {
  const normalizedFragment = fragment.trim();
  if (!normalizedFragment) {
    return currentValue;
  }
  if (!currentValue) {
    return normalizedFragment;
  }
  if (/^[,.;:!?)]/.test(normalizedFragment)) {
    return `${currentValue}${normalizedFragment}`;
  }
  return `${currentValue} ${normalizedFragment}`;
}

export function convertAudioFrameToModelAudioChunk(
  frame: AudioFrameLike,
): DesktopVoiceAudioChunk | null {
  const inputFrames = frame.numberOfFrames;
  if (inputFrames === 0 || !Number.isFinite(frame.sampleRate) || frame.sampleRate <= 0) {
    return null;
  }

  const channels = readFrameChannels(frame);
  const samples = resampleAndDownmix(channels, frame.sampleRate);
  if (samples.length === 0) {
    return null;
  }

  return {
    data: encodePcm16Base64(samples),
    itemId: null,
    numChannels: MODEL_AUDIO_CHANNELS,
    sampleRate: MODEL_AUDIO_SAMPLE_RATE,
    samplesPerChannel: samples.length,
  };
}
