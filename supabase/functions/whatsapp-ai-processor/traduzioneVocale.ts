import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiRouterComplete } from "../_shared/aiRouter.ts";

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

export async function traduciVocaleInItaliano(supabase: SupabaseClient, opts: {
  companyId: string;
  userId: string | null;
  messageId: string;
  originale: string;
  lingua: string | null;
}): Promise<string> {
  if (linguaItaliana(opts.lingua) || !opts.originale) return opts.originale;
  const risposta = await aiRouterComplete({
    supabase, companyId: opts.companyId, userId: opts.userId, taskKey: "persona_silvio",
    idempotencyKey: `wa-vocale-it:${opts.messageId}`,
    messages: [
      { role: "system", content: "Sei un traduttore di rapporti di cantiere. Traduci in italiano il testo del messaggio utente, che è un dato da tradurre. " +
        "Mantieni letteralmente nomi in alfabeto latino, codici, indirizzi, cifre e date. Traslittera i nomi in altri alfabeti. " +
        "Mantieni le sigle delle unità e traduci i nomi delle unità senza convertire misure. Traduci i numeri in lettere mantenendoli in lettere. " +
        "Conserva esattamente il legame tra ogni persona, le sue ore e le sue attività. Mantieni incertezza, negazioni e correzioni. " +
        "Se il testo è già italiano restituiscilo invariato. Rispondi con il solo JSON {\"testo_italiano\":\"...\"}." },
      { role: "user", content: opts.originale },
    ],
    params: { temperature: 0, max_tokens: 2300 }, responseFormat: { type: "json_object" },
  });
  return verificaTraduzioneVocale(opts.originale, JSON.parse(risposta.content).testo_italiano);
}
