/**
 * Classifica la risposta WhatsApp di un invitato a un evento e mette il tag giusto sul contatto,
 * così le sequenze di inviti e promemoria escono da sole per chi ha detto di no (o seguono
 * solo chi ha confermato).
 *
 * Si accende per numero, in `ai_whatsapp_numbers.operational_settings.classifica_risposte`:
 *   { "tag_filtro": "levante-sequenza", "tag_si": "levante-confermato", "tag_no": "levante-no" }
 * Senza questa impostazione non succede niente.
 *
 * Prudenza: un dubbio non mette nessun tag. Il rifiuto toglie l'invitato da ogni promemoria,
 * quindi si decide solo su frasi chiare (parole) o su un'AI che risponde senza equivoci.
 */

// deno-lint-ignore-file no-explicit-any

import { aiRouterPrompt } from "./aiRouter.ts";

export type EsitoRisposta = "si" | "no" | "altro";

export interface ImpostazioniClassifica {
  tag_filtro: string;
  tag_si: string;
  tag_no: string;
}

/** Legge l'impostazione dal numero; null se non è accesa o è incompleta. */
export function impostazioniClassifica(operationalSettings: unknown): ImpostazioniClassifica | null {
  const s = (operationalSettings as { classifica_risposte?: Partial<ImpostazioniClassifica> } | null)?.classifica_risposte;
  if (!s || typeof s !== "object") return null;
  const { tag_filtro, tag_si, tag_no } = s;
  if (![tag_filtro, tag_si, tag_no].every((t) => typeof t === "string" && t.trim().length > 0)) return null;
  return { tag_filtro: tag_filtro!.trim(), tag_si: tag_si!.trim(), tag_no: tag_no!.trim() };
}

function normalizza(testo: string): string {
  return testo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const RIFIUTO = [
  /\bnon (sono|siamo|mi|ci) (piu )?interessat/,
  /\bnon (mi |ci )?interessa\b/,
  /\bno grazie\b/,
  /^no\b.{0,20}$/,
  /\bnon (vengo|veniamo|verro|verremo|ci saro|ci saremo|potro venire|potremo venire|posso venire|possiamo venire)\b/,
  /\b(non|nn) (riesco|riusciamo|posso|possiamo|potro|potremo)\b/,
  /\bnon sara possibile\b/,
  /\bpurtroppo\b.{0,40}\b(no|non)\b/,
  /\b(troppo|un po|proprio) lontan/,
  /\bgia (visto|vista|visti|preso|presa|comprato|comprata|scelto|scelta)\b/,
  /\b(disdico|disdiciamo|annullo|annulliamo)\b/,
  /\b(toglietemi|toglimi|cancellatemi|cancellami|non scrivetemi|non scrivermi|non contattatemi|non contattarmi|smettete)\b/,
];

// Conferma solo con parole esplicite: «ok grazie» o «bellissimo» non vogliono dire «vengo».
const CONFERMA = [
  /^(si)\b(?!.*\bma\b)/,
  /\b(confermo|confermiamo)\b/,
  /\bci (sono|siamo|saro|saremo)\b/,
  /\b(verro|verremo|vengo|veniamo)\b/,
];

// Se l'AI dice «si» ma nel testo non c'è nessun segno di presenza, non si mette il tag.
const SEGNO_DI_PRESENZA =
  /\b(si|vengo|veniamo|verro|verremo|ci sono|ci siamo|ci saro|ci saremo|confermo|confermiamo|in (due|tre|quattro|cinque|sei|\d+)|domani|stasera|venerdi|sabato|domenica)\b/;

/** Esito da parole chiare, o null se serve l'AI. Il rifiuto vince sempre sulla conferma. */
export function classificaConParole(testo: string | null | undefined): EsitoRisposta | null {
  const t = normalizza(testo ?? "");
  if (!t) return null;
  if (RIFIUTO.some((r) => r.test(t))) return "no";
  // Con una negazione («non so se ci sono») meglio lasciar decidere all'AI.
  if (/\bnon\b/.test(t)) return null;
  if (t.length <= 80 && CONFERMA.some((r) => r.test(t))) return "si";
  return null;
}

/** L'AI può dire «no» da sola, ma «si» solo se il testo ha un segno di presenza. */
export function esitoAIConControllo(esito: EsitoRisposta, testo: string): EsitoRisposta {
  if (esito === "si" && !SEGNO_DI_PRESENZA.test(normalizza(testo))) return "altro";
  return esito;
}

/** L'AI risponde con una parola: qualunque altra cosa vale «altro», mai un tag per sbaglio. */
export function esitoDaAI(output: string | null | undefined): EsitoRisposta {
  const parola = String(output ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
  if (parola === "si" || parola === "no") return parola;
  return "altro";
}

export async function classificaRisposta(admin: any, companyId: string, testo: string): Promise<EsitoRisposta> {
  const conParole = classificaConParole(testo);
  if (conParole) return conParole;
  if (!normalizza(testo)) return "altro";
  try {
    const r = await aiRouterPrompt({
      supabase: admin,
      taskKey: "openwa_classifica_risposta",
      companyId,
      systemPrompt: [
        "Un'azienda ha invitato una persona a un evento e la persona risponde su WhatsApp.",
        "Rispondi SOLO con una di queste parole:",
        "- si: dice chiaramente che viene o conferma la presenza",
        "- no: dice chiaramente che non viene, non è interessata o non vuole essere ricontattata",
        "- altro: tutto il resto (domande, dubbi, 'forse', richieste di informazioni, emoji, fuori tema)",
        "In caso di dubbio rispondi altro. Nessuna spiegazione.",
      ].join("\n"),
      userPrompt: `Risposta della persona:\n${testo.slice(0, 600)}`,
    });
    return esitoAIConControllo(esitoDaAI(r.content), testo);
  } catch (e) {
    console.warn("[classificaRispostaEvento] AI:", (e as Error)?.message);
    return "altro";
  }
}

/**
 * Per un contatto che ha il tag del filtro, classifica il messaggio e aggiunge il tag.
 * Torna l'esito applicato, o null se non c'era niente da fare.
 */
export async function classificaERegistra(
  admin: any,
  opts: { companyId: string; contactId: string; testo: string | null | undefined; impostazioni: ImpostazioniClassifica },
): Promise<EsitoRisposta | null> {
  const testo = String(opts.testo ?? "").trim();
  if (!testo) return null;
  const { data: contatto, error } = await admin
    .from("marketing_contacts")
    .select("id, tags")
    .eq("company_id", opts.companyId)
    .eq("id", opts.contactId)
    .maybeSingle();
  if (error || !contatto) return null;
  const tags: string[] = Array.isArray(contatto.tags) ? contatto.tags : [];
  if (!tags.includes(opts.impostazioni.tag_filtro)) return null;

  const esito = await classificaRisposta(admin, opts.companyId, testo);
  if (esito === "altro") return "altro";
  const tag = esito === "si" ? opts.impostazioni.tag_si : opts.impostazioni.tag_no;
  if (tags.includes(tag)) return esito;
  const { error: errUpd } = await admin
    .from("marketing_contacts")
    .update({ tags: [...tags, tag] })
    .eq("id", opts.contactId)
    .eq("company_id", opts.companyId);
  if (errUpd) {
    console.error("[classificaRispostaEvento] tag non scritto:", errUpd.message);
    return null;
  }
  return esito;
}
