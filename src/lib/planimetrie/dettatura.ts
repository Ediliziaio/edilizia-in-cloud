export type Riconoscitore = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function costruttoreRiconoscitore() {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: new () => Riconoscitore; webkitSpeechRecognition?: new () => Riconoscitore };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function dettaturaDisponibile() {
  return !!costruttoreRiconoscitore();
}

export function creaRiconoscitore(): Riconoscitore | null {
  const Costruttore = costruttoreRiconoscitore();
  return Costruttore ? new Costruttore() : null;
}
