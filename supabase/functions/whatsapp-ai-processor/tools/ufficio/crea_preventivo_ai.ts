// Preventivo col LISTINO e la MANODOPERA veri, da WhatsApp (28/09/2026).
//
// Generate a proposal first; save only after the exact priced lines are confirmed.

import { errResult, okResult, type ToolCtx } from "../shared/types.ts";
import { quoteDraftIssue } from "../../../_shared/operationalDraftValidation.ts";

interface Args {
  descrizione?: string;
  cliente_nome?: string;
  tipo_lavoro?: string;
  iva?: number;
  invia_pdf_qui?: boolean;
}

interface RigaAI {
  nome?: string;
  descrizione?: string;
  quantita?: number;
  unita_misura?: string;
  unit_price?: number | null;
  family_id?: string | null;
  item_category?: string;
  is_posa_di?: string | null;
}

export const creaPreventivoAiDef = {
  name: "crea_preventivo_ai",
  description:
    "Prepara un’ANTEPRIMA NON SALVATA usando il LISTINO e la MANODOPERA dell'azienda. " +
    "Riporta tutte le misure, le voci di computo e le lavorazioni dettate o già lette dal documento. Dai il nome del cliente. " +
    "Mostra al titolare le righe, quantità, unità, prezzi e IVA; chiedi di correggere i dati mancanti. " +
    "Solo dopo la conferma delle righe esatte usa salva_preventivo_bozza. Non dichiarare un preventivo creato o un PDF disponibile prima del salvataggio.",
  parameters: {
    type: "object",
    properties: {
      descrizione: { type: "string", description: "Cosa va preventivato, il più preciso possibile (misure, materiali, lavorazioni)." },
      cliente_nome: { type: "string", description: "Nome o ragione sociale del cliente." },
      tipo_lavoro: { type: "string", description: "Es. cappotto, infissi, bagno, fotovoltaico (aiuta il motore)." },
      iva: { type: "number", minimum: 0, maximum: 100, description: "Aliquota IVA % verificata dall'utente, anche zero; nessun default dedotto." },
      invia_pdf_qui: { type: "boolean", description: "Vero se la persona ha chiesto di ricevere il PDF nella chat, anche in un messaggio precedente." },
    },
    required: ["descrizione", "cliente_nome", "iva"],
  },
  requires_grants: ["preventivi.ai"],
  // Anteprima: non salva e non invia niente, quindi niente «Sì» prima (18/10/2026).
  // Prima la conferma faceva perdere le voci: il risultato non tornava all'assistente.
  requires_confirmation: false,
};

export async function creaPreventivoAi(ctx: ToolCtx, args: Args) {
  const descrizione = typeof args.descrizione === "string" ? args.descrizione.trim().slice(0, 24_000) : "";
  const clienteNome = typeof args.cliente_nome === "string" ? args.cliente_nome.trim() : "";
  if (descrizione.length < 5) return errResult("descrizione_corta", "Dimmi cosa devo preventivare, un po' più nel dettaglio.");
  if (clienteNome.length < 2 || clienteNome.length > 200) return errResult("cliente_mancante", "Per chi è il preventivo? Indicami un nome valido, da 2 a 200 caratteri.");
  if (!ctx.user_id || !["ufficio", "admin"].includes(ctx.kind)) return errResult("no_user", "Per preparare il preventivo serve un utente dell’ufficio autorizzato.");
  if (typeof args.iva !== "number" || !Number.isFinite(args.iva) || args.iva < 0 || args.iva > 100) return errResult("iva_mancante", "Quale aliquota IVA devo usare? Indicami quella verificata, anche zero.");

  const base = Deno.env.get("SUPABASE_URL")!;
  const chiave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  let sezioni: Array<{ righe?: RigaAI[] }> = [];
  try {
    const res = await fetch(`${base}/functions/v1/ai-genera-preventivo-v2`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${chiave}` },
      body: JSON.stringify({
        company_id: ctx.company_id,
        per_utente: ctx.user_id,
        ai_richiesta_id: ctx.requestId,
        descrizione,
        tipo_lavoro: args.tipo_lavoro ?? null,
        input_mode: "testo",
      }),
      // Il motore impiega fino a 80 secondi sui lavori grandi.
      signal: AbortSignal.timeout(110_000),
    });
    const j = await res.json().catch((): null => null) as { success?: boolean; error?: unknown; sezioni?: Array<{ righe?: RigaAI[] }> } | null;
    if (!res.ok || j?.success === false || j?.error || !Array.isArray(j?.sezioni) || j.sezioni.some(s => !s || typeof s !== "object" || Array.isArray(s) || !Array.isArray(s.righe))) {
      console.error(JSON.stringify({ level: "error", fn: "crea_preventivo_ai", passo: "motore", status: res.status }));
      return errResult("motore_ko", "Generazione non confermata. Nessuna bozza salvata: verifica nell’app prima di rilanciare l’analisi.");
    }
    sezioni = j.sezioni;
  } catch (e) {
    console.error(JSON.stringify({ level: "error", fn: "crea_preventivo_ai", error: String(e) }));
    return errResult("motore_errore", "Analisi interrotta o con esito incerto. Nessuna bozza salvata: controlla nell’app e riprova tu.");
  }

  const righe: RigaAI[] = sezioni.flatMap((s) => Array.isArray(s.righe) ? s.righe : []);
  if (righe.length === 0) return errResult("nessuna_riga", "Dalla descrizione non ho tirato fuori righe utili: dammi qualche dettaglio in più (misure, materiali).");

  if (righe.length > 100 || righe.some(r => !r || typeof r !== "object")) return errResult("righe_non_valide", "Anteprima non valida o troppo lunga. Nessuna bozza salvata: verifica le voci nell’app.");
  const items = righe.map(r => ({ name: r.nome ?? r.descrizione, description: r.descrizione ?? r.nome,
    quantity: r.quantita, unit_price: r.unit_price, unit_of_measure: r.unita_misura,
    vat_rate: args.iva, item_type: r.is_posa_di || r.item_category === "manodopera" || r.item_category === "posa" ? "labor"
      : ["trasporto", "smaltimento", "nolo"].includes(r.item_category ?? "") ? "service" : "material" }));
  const proposed = { client_name: clienteNome, title: `Preventivo ${clienteNome}`, description: descrizione, items,
    ...(args.tipo_lavoro?.trim() ? { tipo_lavoro: args.tipo_lavoro.trim().slice(0, 120) } : {}),
    ...(args.invia_pdf_qui === true ? { invia_pdf_qui: true } : {}) };
  const senzaUnita = items.findIndex(item => !item.unit_of_measure?.trim());
  const issue = quoteDraftIssue(proposed) ?? (senzaUnita >= 0 ? "Indica l’unità di misura della voce " + (senzaUnita + 1) + "." : null);
  const freeNeedsReview = items.some(item => item.unit_price === 0);
  return okResult({ status: "anteprima_non_salvata", created: false, items, client_name: clienteNome,
    needs_clarification: !!issue || freeNeedsReview, clarification: issue ?? (freeNeedsReview ? "Conferma se le voci a zero sono gratuite oppure indica il prezzo mancante." : null),
    dati_da_confermare: proposed },
    `Anteprima di ${items.length} voci per ${clienteNome}: nessun preventivo salvato e nulla inviato al cliente. ${issue ?? (freeNeedsReview ? "Verifica le voci a zero prima di confermare." : "Controlla le voci e il totale, poi conferma per salvare la bozza.")}`);
}
