/**
 * openwa-classifica-una-risposta — classifica con l'AI la risposta di UN
 * destinatario campagna WhatsApp Locale, negli stessi esiti della pipeline
 * (appuntamento / da_ricontattare / non_interessato / incerto). Estratta da
 * openwa-classifica-risposte (il bottone manuale nel report risposte) perché
 * il percorso automatico all'arrivo del messaggio (openwa-webhook) la deve
 * chiamare identica — una sola definizione della politica di classificazione.
 *
 * "cliente" NON è tra gli esiti che questa funzione può assegnare:
 * dichiarare vinto un contratto resta una decisione umana.
 */

// deno-lint-ignore-file no-explicit-any

import { aiRouterPrompt } from "./aiRouter.ts";

const ESITI_AI = new Set(["appuntamento", "da_ricontattare", "non_interessato"]);
const PLATFORM_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

export interface DestinatarioDaClassificare {
  id: string;
  contact_id: string;
  primo_inviato_at: string | null;
}

export type EsitoClassificazione = "appuntamento" | "da_ricontattare" | "non_interessato" | "incerto" | "senza_testo";

/**
 * Classifica un destinatario e scrive `esito`/`esito_at` se l'AI decide un
 * esito valido (senza sovrascrivere una scelta umana nel frattempo). Torna
 * l'esito assegnato, o "incerto"/"senza_testo" se non ha scritto nulla.
 */
export async function classificaUnaRisposta(admin: any, d: DestinatarioDaClassificare): Promise<EsitoClassificazione> {
  // Fino a 3 messaggi della persona: il primo "Ciao?" da solo dice poco.
  const { data: msgs } = await admin
    .from("openwa_messages")
    .select("body")
    .eq("contact_id", d.contact_id)
    .eq("direction", "inbound")
    .gte("created_at", d.primo_inviato_at ?? "1970-01-01")
    .order("created_at", { ascending: true })
    .limit(3);
  const testi = (msgs ?? []).map((m: { body: string | null }) => m.body).filter(Boolean);
  if (!testi.length) return "senza_testo";

  try {
    const r = await aiRouterPrompt({
      supabase: admin,
      taskKey: "openwa_classifica_risposta",
      companyId: PLATFORM_COMPANY_ID,
      systemPrompt: [
        "Classifichi la risposta di un'azienda a un primo contatto WhatsApp B2B.",
        "Rispondi SOLO con una di queste parole:",
        "- appuntamento: vuole parlare, chiede una chiamata/incontro, chiede quando",
        "- da_ricontattare: interessato ma non ora, chiede materiale, risposta interlocutoria",
        "- non_interessato: rifiuta, dice di no, chiede di non essere contattato",
        "- incerto: non si capisce (un solo 'Ciao?', emoji, fuori tema)",
        "Nessun'altra parola, nessuna spiegazione.",
      ].join("\n"),
      userPrompt: `Risposta del contatto:\n${testi.join("\n---\n")}`,
    });
    const parola = (r.content ?? "").trim().toLowerCase().replace(/[^a-z_]/g, "");
    if (ESITI_AI.has(parola)) {
      await admin.from("openwa_campagna_destinatari")
        .update({ esito: parola, esito_at: new Date().toISOString() })
        .eq("id", d.id)
        .is("esito", null); // non sovrascrive una scelta umana nel frattempo
      return parola as EsitoClassificazione;
    }
    return "incerto";
  } catch (e) {
    console.warn("[openwa-classifica-una-risposta] AI:", (e as Error)?.message);
    return "incerto";
  }
}
