/**
 * Lead Meta che rientrano dopo una chiusura (01/10/2026).
 *
 * Giulietta Baso (Green Energy) aveva la richiesta persa o abbandonata e ha
 * ricompilato il modulo: l'automazione apriva un'opportunità nuova e il team
 * richiamava una persona già chiusa. Ogni azienda sceglie, nelle impostazioni
 * dell'integrazione Meta, che cosa fare:
 *   off     comportamento di sempre (default: nessuna sorpresa);
 *   segnala il lead entra, ma con l'etichetta «rientro-dopo-chiusura» e una nota;
 *   blocca  il contatto si aggiorna, ma niente opportunità nuova e niente
 *           automazioni né avvisi, finché l'ultima chiusura è recente.
 * Qui solo la decisione, senza database: provata a parte.
 */

export type ModoRientro = "off" | "segnala" | "blocca";

export interface ChiusuraPassata {
  status: string | null;
  /** Quando è stata chiusa (perso/abbandonato): ISO. */
  chiusaIl: string | null;
}

export interface DecisioneRientro {
  azione: "normale" | "segnala" | "blocca";
  /** Giorni dalla chiusura più recente, se ce n'è una dentro la finestra. */
  giorniDallaChiusura: number | null;
  motivo: string;
}

export const GIORNI_RIENTRO_DEFAULT = 90;

export function modoRientroValido(v: unknown): ModoRientro {
  return v === "segnala" || v === "blocca" ? v : "off";
}

export function giorniRientroValidi(v: unknown): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 3650 ? n : GIORNI_RIENTRO_DEFAULT;
}

export function decidiRientro(input: {
  modo: unknown;
  giorni: unknown;
  chiusure: ChiusuraPassata[];
  /** Opportunità aperte del contatto: se ce n'è una, il flusso di sempre la gestisce. */
  aperte: number;
  adesso?: Date;
}): DecisioneRientro {
  const modo = modoRientroValido(input.modo);
  const giorni = giorniRientroValidi(input.giorni);
  const adesso = input.adesso ?? new Date();
  const normale = (motivo: string): DecisioneRientro => ({ azione: "normale", giorniDallaChiusura: null, motivo });

  if (modo === "off") return normale("regola spenta");
  if (input.aperte > 0) return normale("il contatto ha già un'opportunità aperta");

  let piuRecente: number | null = null;
  for (const c of input.chiusure) {
    if (c.status !== "lost" && c.status !== "abandoned") continue;
    const t = c.chiusaIl ? new Date(c.chiusaIl).getTime() : NaN;
    if (!Number.isFinite(t)) continue;
    const g = Math.floor((adesso.getTime() - t) / 86_400_000);
    if (g < 0) continue;
    if (piuRecente === null || g < piuRecente) piuRecente = g;
  }
  if (piuRecente === null) return normale("nessuna chiusura precedente");
  if (piuRecente > giorni) return normale(`ultima chiusura di ${piuRecente} giorni fa, oltre i ${giorni}`);
  return {
    azione: modo,
    giorniDallaChiusura: piuRecente,
    motivo: `chiusa ${piuRecente === 0 ? "oggi" : `${piuRecente} giorni fa`} (regola: ${giorni} giorni)`,
  };
}

export function notaRientro(d: DecisioneRientro, campagna?: string | null): string {
  const da = campagna ? ` dalla campagna «${campagna}»` : "";
  if (d.azione === "blocca") {
    return `Ha ricompilato il modulo Meta${da}, ma la richiesta era stata chiusa (${d.motivo}): non è stata aperta una nuova opportunità e non è partita nessuna automazione. Per riaprirla, usa «Riapri» su questa scheda.`;
  }
  return `Ha ricompilato il modulo Meta${da} dopo una chiusura (${d.motivo}). È stata aperta una nuova opportunità, segnata «rientro-dopo-chiusura».`;
}
