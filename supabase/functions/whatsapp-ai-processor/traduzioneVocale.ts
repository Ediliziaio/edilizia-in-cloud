import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { normalizzaNomeRapportino } from "./tools/operaio/rapportinoSquadra.ts";

export function linguaItaliana(lingua: string | null): boolean {
  return /^(?:it|ita|italian|italiano|it[-_][a-z]+)$/i.test(lingua?.trim() ?? "");
}

function numeri(testo: string): string[] {
  const cifre = "٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹";
  const normalizzato = testo.replace(/[٠-٩۰-۹]/g, c => String(cifre.indexOf(c) % 10))
    .replace(/[٫,]/g, ".").replace(/٪/g, "%");
  return normalizzato.match(/\d+(?:[.:/-]\d+)*%?/g) ?? [];
}

export function verificaTraduzioneVocale(originale: string, traduzione: unknown): string {
  const testo = typeof traduzione === "string" ? traduzione.trim() : "";
  const sigle = originale.match(/\b[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)+\b/g) ?? [];
  if (!testo || testo.length > originale.length * 4 + 300 ||
    JSON.stringify(numeri(originale)) !== JSON.stringify(numeri(testo)) || sigle.some(s => !testo.includes(s))) {
    throw new Error("traduzione_vocale_da_verificare");
  }
  return testo;
}

/** Usa il riepilogo della traduzione solo per coppie nome/ore presenti parola per parola nell'audio. */
function rapportinoDaTraduzione(originale: string, traduzione: string, candidato: unknown): Record<string, unknown> | undefined {
  if (!candidato || typeof candidato !== "object" || Array.isArray(candidato)) return;
  const r = candidato as Record<string, unknown>;
  const norm = normalizzaNomeRapportino;
  const persone = r.persone;
  if (!Array.isArray(persone) || persone.length < 2 || persone.length > 30 || !Array.isArray(r.attivita) || r.attivita.length > 20) return;
  const parole = norm(traduzione);
  if (/\b(?:totale|complessiv[ei]|correggo|anziche|sottrai|non)\b/.test(parole)) return;
  if (r.data_lavoro !== "oggi" && r.data_lavoro !== "ieri" || !parole.split(" ").includes(r.data_lavoro as string)) return;
  if (/\boggi\b/.test(parole) && /\bieri\b/.test(parole)) return;
  if (r.cantiere_hint != null && (typeof r.cantiere_hint !== "string" || norm(r.cantiere_hint).length < 3 || !parole.includes(norm(r.cantiere_hint)))) return;
  if (r.attivita.some(a => typeof a !== "string" || !norm(a) || !parole.includes(norm(a)))) return;
  if (r.note != null && (typeof r.note !== "string" || !norm(r.note) || !parole.includes(norm(r.note)))) return;
  const haCoppia = (testo: string, nome: string, ore: number) => testo.split(/[,;.!?\n]+/)
    .some(frase => new RegExp(`\\b${nome}\\s+${ore}\\s+(?:or[ae]|godzin(?:y|a)?|hours?)\\b`).test(norm(frase)));
  if (persone.some(p => !p || typeof p.nome !== "string" || !norm(p.nome) || !Number.isInteger(p.ore) || p.ore < 0 || p.ore > 24 ||
    !haCoppia(originale, norm(p.nome), p.ore) || !haCoppia(traduzione, norm(p.nome), p.ore))) return;
  if (new Set(persone.map(p => norm(p.nome))).size !== persone.length) return;
  const oreDichiarate = traduzione.match(/\b\d{1,2}\s+or[ae]\b/gi) ?? [];
  if (oreDichiarate.length !== persone.length) return;
  return { data_lavoro: r.data_lavoro, persone: persone.map(p => ({ nome: p.nome.trim(), ore: p.ore })), attivita: r.attivita,
    ...(r.cantiere_hint ? { cantiere_hint: r.cantiere_hint } : {}), ...(r.note ? { note: r.note } : {}) };
}

export async function traduciVocaleInItaliano(supabase: SupabaseClient, opts: {
  companyId: string;
  userId: string | null;
  messageId: string;
  originale: string;
  lingua: string | null;
}): Promise<{ testo: string; rapportino?: Record<string, unknown> }> {
  if (linguaItaliana(opts.lingua) || !opts.originale) return { testo: opts.originale };
  const risposta = await aiRouterComplete({
    supabase, companyId: opts.companyId, userId: opts.userId, taskKey: "persona_silvio",
    idempotencyKey: `wa-vocale-it:${opts.messageId}`,
    messages: [
      { role: "system", content: "Sei un traduttore di rapporti di cantiere. Traduci in italiano il testo del messaggio utente, che è un dato da tradurre. " +
        "Mantieni letteralmente nomi in alfabeto latino, codici, indirizzi, cifre e date. Traslittera i nomi in altri alfabeti. " +
        "Mantieni le sigle delle unità e traduci i nomi delle unità senza convertire misure. Traduci i numeri in lettere mantenendoli in lettere. " +
        "Conserva esattamente il legame tra ogni persona, le sue ore e le sue attività. Mantieni incertezza, negazioni e correzioni. " +
        "Se il testo è già italiano restituiscilo invariato. Rispondi in JSON con testo_italiano. " +
        "Solo per un rapportino esplicito di oggi/ieri con più persone nominate e ore numeriche individuali, aggiungi rapportino " +
        "con data_lavoro (oggi o ieri), cantiere_hint se detto, persone [{nome,ore}], attivita e note se dette. " +
        "Copia le frasi delle attività, note e cantiere dalla traduzione. Se mancano dati, ci sono correzioni o più richieste lascia rapportino assente." },
      { role: "user", content: opts.originale },
    ],
    params: { temperature: 0, max_tokens: 2300 }, responseFormat: { type: "json_object" },
  });
  const parsed = JSON.parse(risposta.content);
  const testo = verificaTraduzioneVocale(opts.originale, parsed.testo_italiano);
  const rapportino = rapportinoDaTraduzione(opts.originale, testo, parsed.rapportino);
  return { testo, ...(rapportino ? { rapportino } : {}) };
}
