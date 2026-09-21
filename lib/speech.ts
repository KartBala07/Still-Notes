// Free, on-device speech-to-text for live note capture.
//
// Uses the browser's Web Speech API (Chrome, Edge, Safari). It needs no API key
// and no backend, so a recording can be turned into text even when the Fish
// Audio key is missing or the audio should stay on this device.

export type LiveSpeechOptions = {
  lang?: string;
  onFinal: (text: string) => void;
  onInterim?: (text: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
};

type SpeechRecognitionAlternative = { transcript: string };
type SpeechRecognitionResult = {
  isFinal: boolean;
  0: SpeechRecognitionAlternative;
  length: number;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResult };
};
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionConstructor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return scope.SpeechRecognition || scope.webkitSpeechRecognition || null;
}

export function speechSupported(): boolean {
  return recognitionConstructor() !== null;
}

export function speechErrorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was blocked. Allow the microphone for this site, then start again.";
    case "audio-capture":
      return "No microphone was found. Connect one and try again.";
    case "network":
      return "Live transcription lost its connection. Check the internet connection and try again.";
    default:
      return "Live transcription stopped (" + code + "). The audio is kept so you can transcribe it later.";
  }
}

export type LiveSpeech = { start: () => void; stop: () => void };

/**
 * Start a live transcription session. Returns null when the browser has no
 * speech recognition support, so callers can fall back to uploads.
 */
export function createLiveSpeech(options: LiveSpeechOptions): LiveSpeech | null {
  const Ctor = recognitionConstructor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.lang =
    options.lang ||
    (typeof navigator !== "undefined" && navigator.language) ||
    "en-US";

  // Chrome ends the session after a short pause. Keep listening for as long as
  // the lesson is recording by restarting automatically.
  let wanted = false;

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result[0]?.transcript ?? "";
      if (result.isFinal) {
        const clean = transcript.trim();
        if (clean) options.onFinal(clean);
      } else {
        interim += transcript;
      }
    }
    options.onInterim?.(interim);
  };

  recognition.onerror = (event) => {
    // These are routine and are handled by the restart logic below.
    if (event.error === "no-speech" || event.error === "aborted") return;
    options.onError?.(speechErrorMessage(event.error));
  };

  recognition.onend = () => {
    if (wanted) {
      try {
        recognition.start();
        return;
      } catch {
        // The browser refused to restart; fall through and report the end.
      }
    }
    options.onEnd?.();
  };

  return {
    start() {
      wanted = true;
      try {
        recognition.start();
      } catch {
        // start() throws when a session is already running; that is fine.
      }
    },
    stop() {
      wanted = false;
      try {
        recognition.stop();
      } catch {
        // Nothing to stop.
      }
    },
  };
}
