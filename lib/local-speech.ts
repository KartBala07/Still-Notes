// Offline, on-device speech-to-text through the paired local connector.
//
// The browser's Web Speech API sends audio to the browser vendor's servers and
// simply fails on machines or networks where those servers are unreachable.
// This module records short PCM slices and hands them to the local companion
// (scripts/local-companion.py → Vosk), so live notes keep working offline.
import { localConfig } from "./local-ai";

const COMPANION = "http://127.0.0.1:8766";
const SLICE_MS = 7000;
const SAMPLE_RATE = 16000;

export type LocalSpeech = { start: () => void; stop: () => void };

export type LocalSpeechOptions = {
  stream: MediaStream;
  onFinal: (text: string) => void;
  onError?: (message: string) => void;
  pairing?: string;
  sliceMs?: number;
};

export type LocalSpeechStatus = {
  ready: boolean;
  model?: string;
  reason?: string;
};

function base64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step)
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(binary);
}

/** Decode a recorded slice and resample it to the 16 kHz mono PCM Vosk wants. */
async function toPcm(blob: Blob): Promise<Uint8Array> {
  const bytes = await blob.arrayBuffer();
  const ctx = new OfflineAudioContext(1, 1, SAMPLE_RATE);
  const audio = await ctx.decodeAudioData(bytes);
  const channel = audio.getChannelData(0);
  const pcm = new Int16Array(channel.length);
  for (let i = 0; i < channel.length; i++) {
    const sample = Math.max(-1, Math.min(1, channel[i]));
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return new Uint8Array(pcm.buffer);
}

function recorderType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
}

/** Is the local speech engine installed and reachable? */
export async function localSpeechReady(
  pairing = localConfig().pairing,
): Promise<LocalSpeechStatus> {
  if (!pairing)
    return {
      ready: false,
      reason: "Pair this computer in Settings → Local AI to use offline speech.",
    };
  try {
    const response = await fetch(COMPANION + "/asr/status", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Still-Pairing": pairing },
      body: "{}",
      signal: AbortSignal.timeout(2500),
    });
    const data = (await response.json().catch(() => ({}))) as {
      ready?: boolean;
      model?: string;
      error?: string;
    };
    if (response.ok && data.ready) return { ready: true, model: data.model };
    return { ready: false, reason: String(data.error || "The local speech model is not installed.") };
  } catch {
    return { ready: false, reason: "The local connector is not running on this computer." };
  }
}

export function createLocalSpeech(options: LocalSpeechOptions): LocalSpeech {
  const pairing = options.pairing ?? localConfig().pairing;
  const sliceMs = options.sliceMs ?? SLICE_MS;
  const mimeType = recorderType();
  let running = false;
  let recorder: MediaRecorder | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();
  let consecutiveFailures = 0;

  function send(blob: Blob) {
    chain = chain.then(async () => {
      try {
        const pcm = await toPcm(blob);
        // Under ~0.2 s there is nothing worth transcribing.
        if (pcm.byteLength < 6400) return;
        const response = await fetch(COMPANION + "/asr", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Still-Pairing": pairing },
          body: JSON.stringify({ audio: base64(pcm) }),
          signal: AbortSignal.timeout(30000),
        });
        const data = (await response.json().catch(() => ({}))) as { text?: string; error?: string };
        if (!response.ok) throw Error(String(data.error || `Local speech failed (${response.status}).`));
        consecutiveFailures = 0;
        const text = String(data.text || "").trim();
        if (text) options.onFinal(text);
      } catch (error) {
        consecutiveFailures += 1;
        // One dropped slice is survivable; a dead engine should be reported once.
        if (consecutiveFailures === 1)
          options.onError?.(error instanceof Error ? error.message : "Local speech stopped.");
      }
    });
  }

  function startSlice() {
    if (!running) return;
    let current: MediaRecorder;
    try {
      current = new MediaRecorder(options.stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 64000,
      });
    } catch {
      options.onError?.("This browser cannot record audio for local transcription.");
      return;
    }
    recorder = current;
    const chunks: Blob[] = [];
    current.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    current.onstop = () => {
      if (chunks.length) send(new Blob(chunks, { type: current.mimeType || "audio/webm" }));
      if (running) startSlice();
    };
    current.start();
    timer = setTimeout(() => {
      if (current.state === "recording") current.stop();
    }, sliceMs);
  }

  return {
    start() {
      if (running) return;
      running = true;
      startSlice();
    },
    stop() {
      running = false;
      if (timer) clearTimeout(timer);
      timer = null;
      if (recorder?.state === "recording") recorder.stop();
      recorder = null;
    },
  };
}
