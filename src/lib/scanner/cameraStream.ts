/**
 * cameraStream — gestione MediaStream condivisa per tutti gli scanner barcode/QR.
 *
 * Risolve il bug noto "camera blurred / non mette a fuoco" su iPhone e Android
 * recenti. Cause storiche:
 *
 *  1. ZXing.decodeFromVideoDevice(deviceId,…) apre lo stream SENZA constraint
 *     avanzati. Nessun focusMode/exposureMode/whiteBalanceMode → la lente
 *     resta bloccata sul fuoco pre-impostato (spesso infinito) e non
 *     aggiusta sui codici a 10–20 cm.
 *  2. Pinnare il deviceId esatto su iOS Safari forza una singola lente fisica
 *     e impedisce alla "smart back camera" virtuale di switchare
 *     automaticamente tra wide/tele/macro in base al subject distance.
 *  3. Senza width/height ideal il browser sceglie 640×480: dettaglio
 *     insufficiente per barcode densi a corta distanza.
 *
 * Strategia adottata:
 *   - facingMode: { ideal: "environment" } SENZA deviceId.exact → su iOS
 *     ottieni la smart camera virtuale; su Android il browser sceglie la
 *     posteriore principale. Nessun bisogno di enumerateDevices().
 *   - width/height/frameRate ideal alti per dare al sensore più informazioni.
 *   - applyConstraints({ advanced: [...] }) DOPO che lo stream è live, perché
 *     le capabilities (focusMode, exposureMode, …) sono popolate solo dopo
 *     il primo frame su Chrome/Android e dopo `loadedmetadata` su Safari.
 *   - tap-to-focus tramite single-shot pulse → torna a continuous dopo 1.5s.
 *   - torch/flashlight gestito con feature detection (caps.torch).
 *
 * Note iOS:
 *   - Safari spesso non espone caps.focusMode (vuoto o undefined). In quel
 *     caso lo stream è già in continuous AF di default sulla smart camera,
 *     quindi non c'è nulla da fare e silenziamo l'errore.
 *   - applyConstraints fallisce silenziosamente: try/catch tutto e degrade
 *     gracefully.
 */

// MediaTrackCapabilities/Constraints non includono ancora torch/focusMode
// nelle TS lib standard → cast sicuro a Record<string, unknown> con guard.
type MediaCapabilitiesLike = Record<string, unknown>;

interface OpenStreamOptions {
  /** Risoluzione massima richiesta (ideal). Default 1920×1080. */
  maxResolution?: { width: number; height: number };
  /** Frame rate ideale. Default 30. */
  frameRate?: number;
}

/**
 * Apre lo stream della fotocamera posteriore con constraint ottimizzati per
 * scansione barcode/QR a corta distanza. Applica AF/AE/WB continui appena
 * il track è disponibile.
 *
 * Throws se i permessi sono negati o non c'è fotocamera.
 */
export async function openScannerStream(
  options: OpenStreamOptions = {},
): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Fotocamera non disponibile su questo browser.");
  }

  const { maxResolution = { width: 1920, height: 1080 }, frameRate = 30 } =
    options;

  const constraints: MediaStreamConstraints = {
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: maxResolution.width },
      height: { ideal: maxResolution.height },
      frameRate: { ideal: frameRate },
    },
  };

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    // Fallback più permissivo: alcune webcam laptop non supportano risoluzioni
    // alte e Chrome rifiuta hard. Riproviamo con solo facingMode.
    const name = (err as Error)?.name;
    if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
    } else {
      throw err;
    }
  }

  // Fire-and-forget: applica AF appena il track è ready.
  // Non await-iamo per non rallentare l'avvio del rendering.
  void applyContinuousAutoFocus(stream);

  return stream;
}

/**
 * Applica focusMode/exposureMode/whiteBalanceMode = "continuous" se supportati.
 * Su Chrome/Android è ciò che fa la differenza tra "sfocato" e "nitido".
 * Su Safari iOS è no-op silenzioso (capabilities vuote, ma il default è già
 * continuous sulla smart camera).
 */
export async function applyContinuousAutoFocus(
  stream: MediaStream,
): Promise<void> {
  const track = stream.getVideoTracks()[0];
  if (!track) return;

  // Su Chrome Android le capabilities possono essere vuote nei primi ms
  // dopo il start. Aspettiamo un microtask + un piccolo delay per dare
  // tempo al driver di popolarle.
  await new Promise((r) => setTimeout(r, 50));

  const caps = (track.getCapabilities?.() ?? {}) as MediaCapabilitiesLike;
  const advanced: MediaTrackConstraintSet[] = [];

  const focusModes = caps.focusMode as string[] | undefined;
  if (Array.isArray(focusModes) && focusModes.includes("continuous")) {
    advanced.push({ focusMode: "continuous" } as unknown as MediaTrackConstraintSet);
  }

  const exposureModes = caps.exposureMode as string[] | undefined;
  if (Array.isArray(exposureModes) && exposureModes.includes("continuous")) {
    advanced.push({ exposureMode: "continuous" } as unknown as MediaTrackConstraintSet);
  }

  const whiteBalanceModes = caps.whiteBalanceMode as string[] | undefined;
  if (Array.isArray(whiteBalanceModes) && whiteBalanceModes.includes("continuous")) {
    advanced.push({ whiteBalanceMode: "continuous" } as unknown as MediaTrackConstraintSet);
  }

  if (advanced.length === 0) return;

  try {
    await track.applyConstraints({ advanced });
  } catch {
    // applyConstraints può rifiutare se la combinazione non è supportata.
    // Riproviamo uno alla volta — degrade graceful.
    for (const c of advanced) {
      try {
        await track.applyConstraints({ advanced: [c] });
      } catch {
        /* ignora */
      }
    }
  }
}

/**
 * Tap-to-focus: applica un focus single-shot per ri-focalizzare il sensore
 * sul soggetto corrente, poi torna a continuous dopo un breve delay.
 *
 * Utile per barcode in condizioni di luce difficile o codici grigi/bassissimo
 * contrasto dove l'algoritmo continuous fatica.
 *
 * No-op silenzioso se single-shot non è supportato (la maggior parte di iOS).
 */
export async function pulseFocus(stream: MediaStream): Promise<void> {
  const track = stream.getVideoTracks()[0];
  if (!track) return;
  const caps = (track.getCapabilities?.() ?? {}) as MediaCapabilitiesLike;
  const focusModes = caps.focusMode as string[] | undefined;
  if (!Array.isArray(focusModes) || !focusModes.includes("single-shot")) {
    return;
  }
  try {
    await track.applyConstraints({
      advanced: [{ focusMode: "single-shot" } as unknown as MediaTrackConstraintSet],
    });
    setTimeout(() => {
      if (focusModes.includes("continuous")) {
        track
          .applyConstraints({
            advanced: [
              { focusMode: "continuous" } as unknown as MediaTrackConstraintSet,
            ],
          })
          .catch(() => {});
      }
    }, 1500);
  } catch {
    /* ignora */
  }
}

/** True se la torch (flash) è supportata sul track corrente. */
export function isTorchSupported(stream: MediaStream | null): boolean {
  if (!stream) return false;
  const track = stream.getVideoTracks()[0];
  const caps = (track?.getCapabilities?.() ?? {}) as MediaCapabilitiesLike;
  return Boolean(caps.torch);
}

/** Accende/spegne la torch. No-op se non supportata. */
export async function setTorch(
  stream: MediaStream | null,
  on: boolean,
): Promise<boolean> {
  if (!stream) return false;
  const track = stream.getVideoTracks()[0];
  if (!track) return false;
  try {
    await track.applyConstraints({
      advanced: [{ torch: on } as unknown as MediaTrackConstraintSet],
    });
    return true;
  } catch {
    return false;
  }
}

/** Stop di tutti i track. Idempotente. */
export function stopStream(stream: MediaStream | null): void {
  if (!stream) return;
  stream.getTracks().forEach((t) => {
    try {
      t.stop();
    } catch {
      /* ignora */
    }
  });
}
