// MP3 — Tool carica_ddt (pipeline reale).
//
// Storia: in MP02 era uno stub che apriva solo una cantiere_segnalazioni
// 'ddt_da_registrare' (la registrazione richiede purchase_order + warehouse).
//
// Ora il DDT fotografato dall'operaio entra nella STESSA pipeline del DDT via
// email (MP-EMAIL-AI-06/07):
//   1. Persistiamo i dati estratti in `email_documento_estratto` (tipo='ddt',
//      email_id=NULL → discriminatore "non-email"; sorgente WhatsApp/foto).
//   2. Match fornitore (suppliers per ragione sociale) + match ODA + confronto
//      righe vs ordinato via helper condiviso `buildDdtCarico` → bozza in
//      `email_ddt_carico` (stato 'bozza', giacenza NON toccata: conferma umana).
//   3. Manteniamo la cantiere_segnalazioni come notifica al titolare (zero
//      regressioni sulla visibilità in "Regia"), arricchita con l'esito.
//
// La bozza è poi confermabile dal titolare nel pannello "DDT da registrare"
// (sorgente foto/WhatsApp) — vedi src/pages/azienda/whatsapp/CarichiDaRegistrareCard.tsx
// montato in OperationalControlPage.tsx.

import type { ToolCtx, ToolResult, ToolDef } from "../shared/types.ts";
import { errResult, okResult } from "../shared/types.ts";
import { resolveCantiere } from "../shared/resolve_cantiere.ts";
import { buildDdtCarico } from "../../../_shared/ddtCarico.ts";

export const caricaDDTDef: Omit<ToolDef, "handler"> = {
  name: "carica_ddt",
  description:
    "Registra un DDT (Documento di Trasporto) ricevuto al cantiere a partire dalla foto. " +
    "Estrae i dati, cerca l'ordine d'acquisto del fornitore, confronta le quantità consegnate " +
    "con quelle ordinate e prepara una bozza di carico che il titolare conferma sul gestionale. " +
    "Chiama dopo aver mostrato all'operaio i dati estratti (numero, fornitore, righe) e ricevuto conferma.",
  parameters: {
    type: "object",
    properties: {
      numero_ddt: { type: "string" },
      fornitore: { type: "string" },
      data_ddt: { type: "string", description: "Data DDT in formato YYYY-MM-DD se leggibile" },
      righe: {
        type: "array",
        items: {
          type: "object",
          properties: {
            descrizione: { type: "string" },
            codice: { type: "string", description: "Codice articolo/SKU se presente" },
            quantita: { type: "number" },
            unita_misura: { type: "string" },
          },
          required: ["descrizione"],
        },
      },
      riferimento_ordine: {
        type: "string",
        description: "Numero ordine d'acquisto citato sul DDT (es. 'Rif. Vs ordine 2025/128'), se presente",
      },
      indirizzo_consegna: {
        type: "string",
        description: "Indirizzo di consegna/destinazione riportato sul DDT (es. 'Cantiere Via Roma 12'), se presente. Aiuta a capire il cantiere.",
      },
      order_id: { type: "string", description: "ID commessa/cantiere se già noto" },
      cantiere_hint: { type: "string" },
      media_url: { type: "string", description: "URL della foto del DDT" },
      note: { type: "string" },
    },
    required: ["numero_ddt", "fornitore"],
    additionalProperties: false,
  },
  requires_grants: ["ddt.write"],
};

interface RigaArg {
  descrizione: string;
  codice?: string;
  quantita?: number;
  unita_misura?: string;
}

interface Args {
  numero_ddt: string;
  fornitore: string;
  data_ddt?: string;
  righe?: RigaArg[];
  riferimento_ordine?: string;
  indirizzo_consegna?: string;
  order_id?: string;
  cantiere_hint?: string;
  media_url?: string;
  note?: string;
}

/** Normalizza una data libera (gg/mm/aaaa o aaaa-mm-gg) → ISO YYYY-MM-DD o null. */
function toIsoDate(raw?: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const yyyy = y.length === 2 ? `20${y}` : y;
    return `${yyyy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

export async function caricaDDT(
  ctx: ToolCtx,
  args: Args,
): Promise<ToolResult> {
  const numero = (args.numero_ddt ?? "").toString().trim();
  const fornitore = (args.fornitore ?? "").toString().trim();
  if (!fornitore) return errResult("no_fornitore", "Mi serve il nome del fornitore per registrare il DDT.");

  const righeArg = Array.isArray(args.righe) ? args.righe : [];
  const dataIso = toIsoDate(args.data_ddt);

  // ── Risoluzione cantiere (per la notifica + contesto) ─────────────────────
  // P0-B: oltre al hint/sessione, passiamo i segnali documentali (ODA citato,
  // fornitore, indirizzo di consegna) → match commessa molto più preciso.
  let orderId = args.order_id ?? null;
  let cantiereNome: string | null = null;
  if (!orderId) {
    const resolved = await resolveCantiere(ctx, args.cantiere_hint, {
      riferimento_ordine: args.riferimento_ordine ?? null,
      fornitore,
      indirizzo: args.indirizzo_consegna ?? null,
    });
    if (resolved.cantiere_id) {
      orderId = resolved.cantiere_id;
      cantiereNome = resolved.cantiere_nome;
    }
  }

  // ── Match fornitore (suppliers per ragione sociale) ───────────────────────
  let fornitoreMatchId: string | null = null;
  try {
    const { data: sup } = await ctx.supabase
      .from("suppliers")
      .select("id")
      .eq("company_id", ctx.company_id)
      .ilike("name", fornitore)
      .limit(1)
      .maybeSingle();
    fornitoreMatchId = sup?.id ?? null;
  } catch {
    fornitoreMatchId = null;
  }

  // ── Riga descrittiva (per la segnalazione di visibilità) ──────────────────
  const righeStr = righeArg
    .map((r) =>
      `- ${r.descrizione}${r.quantita ? ` x ${r.quantita}${r.unita_misura ? " " + r.unita_misura : ""}` : ""}`
    )
    .join("\n");

  // ── Se NON ci sono righe estratte: fallback "solo segnalazione" ───────────
  // Senza righe non si può costruire un confronto di carico: avvisiamo il
  // titolare via segnalazione (come MP02) ma SENZA promettere una bozza.
  if (righeArg.length === 0) {
    const descrizione = [
      `DDT #${numero || "?"} di ${fornitore}${dataIso ? ` del ${dataIso}` : ""}`,
      cantiereNome ? `Cantiere: ${cantiereNome}` : "",
      "Righe non leggibili dalla foto — registrazione manuale.",
      args.note ? `Note: ${args.note}` : "",
    ].filter(Boolean).join("\n");
    const { data: seg, error: segErr } = await ctx.supabase
      .from("cantiere_segnalazioni")
      .insert({
        company_id: ctx.company_id,
        order_id: orderId,
        employee_id: ctx.employee_id,
        user_id: ctx.user_id,
        descrizione,
        urgenza: "media",
        tipo_problema: "ddt_da_registrare",
        photo_urls: args.media_url ? [args.media_url] : [],
        source: "whatsapp",
      })
      .select("id")
      .single();
    if (segErr) return errResult(segErr.message, "Errore salvando il DDT.");
    return okResult(
      { segnalazione_id: seg.id, numero_ddt: numero },
      `📄 DDT #${numero || "(senza numero)"} di ${fornitore} ricevuto. Non sono riuscito a leggere le righe dalla foto: ho avvisato l'ufficio per la registrazione manuale.`,
    );
  }

  // ── Pipeline reale: documento estratto (tipo='ddt') ───────────────────────
  const campi: Record<string, unknown> = {
    numero: { valore: numero || null, conf: numero ? 0.8 : 0.3 },
    data: { valore: dataIso, conf: dataIso ? 0.7 : 0.2 },
    fornitore_ragione_sociale: { valore: fornitore, conf: 0.8 },
    riferimento_ordine: {
      valore: args.riferimento_ordine ? args.riferimento_ordine.toString().trim() : null,
      conf: args.riferimento_ordine ? 0.6 : 0.0,
    },
    righe: righeArg.map((r) => ({
      descrizione: (r.descrizione ?? "").toString().trim(),
      codice: r.codice ? r.codice.toString().trim() : null,
      qta: typeof r.quantita === "number" ? r.quantita : null,
      unita_misura: r.unita_misura ? r.unita_misura.toString().trim() : null,
    })),
    // Contesto WhatsApp (non standard email): foto + cantiere risolto.
    foto_url: args.media_url ?? null,
    cantiere: orderId ? { id: orderId, nome: cantiereNome } : null,
    indirizzo_consegna: args.indirizzo_consegna ?? null,
    note_libere: args.note ?? null,
  };

  const { data: doc, error: docErr } = await ctx.supabase
    .from("email_documento_estratto")
    .insert({
      company_id: ctx.company_id,
      email_id: null, // ← discriminatore "non-email" (sorgente foto/WhatsApp)
      attachment_id: null,
      tipo: "ddt",
      confidenza_tipo: 0.8,
      campi,
      dati_incerti: [],
      note: args.note ?? null,
      stato: "da_confermare",
      fornitore_match_id: fornitoreMatchId,
      fornitore_match_tipo: fornitoreMatchId ? "supplier" : null,
      iban_alert: false,
      created_by: ctx.user_id,
    })
    .select("id, company_id, email_id, campi, fornitore_match_id")
    .single();

  if (docErr || !doc) {
    return errResult(docErr?.message ?? "doc_insert_failed", "Errore salvando i dati del DDT.");
  }

  // ── Bozza di carico (match ODA + confronto righe) — helper condiviso ──────
  const carico = await buildDdtCarico(
    ctx.supabase,
    {
      id: doc.id,
      company_id: doc.company_id,
      email_id: doc.email_id,
      campi: (doc.campi ?? {}) as Record<string, unknown>,
      fornitore_match_id: doc.fornitore_match_id,
    },
    ctx.user_id,
  );

  // ── Segnalazione di visibilità al titolare (arricchita con l'esito) ───────
  const esitoCarico = carico.ok
    ? (carico.ordine_collegato
      ? `Bozza carico pronta (ordine ${carico.carico?.purchase_order_numero ?? "collegato"})${carico.scostamenti > 0 ? `, ${carico.scostamenti} righe con scostamento` : ", quantità coerenti"}.`
      : `Bozza carico pronta SENZA ordine collegato${carico.scostamenti > 0 ? `, ${carico.scostamenti} righe da verificare` : ""}.`)
    : "Bozza carico non generata automaticamente — verificare a gestionale.";

  const descrizione = [
    `DDT #${numero || "?"} di ${fornitore}${dataIso ? ` del ${dataIso}` : ""}`,
    cantiereNome ? `Cantiere: ${cantiereNome}` : "",
    righeStr ? `Righe:\n${righeStr}` : "",
    esitoCarico,
    args.note ? `Note: ${args.note}` : "",
  ].filter(Boolean).join("\n");

  await ctx.supabase
    .from("cantiere_segnalazioni")
    .insert({
      company_id: ctx.company_id,
      order_id: orderId,
      employee_id: ctx.employee_id,
      user_id: ctx.user_id,
      descrizione,
      urgenza: "media",
      tipo_problema: "ddt_da_registrare",
      photo_urls: args.media_url ? [args.media_url] : [],
      source: "whatsapp",
    });

  // ── Messaggio all'operaio ─────────────────────────────────────────────────
  let userMsg: string;
  if (carico.ok) {
    const ordineTxt = carico.ordine_collegato
      ? `collegato all'ordine ${carico.carico?.purchase_order_numero ?? ""}`.trim()
      : "senza ordine collegato";
    const scostTxt = carico.scostamenti > 0
      ? ` Attenzione: ${carico.scostamenti} righe con quantità diverse dall'ordine.`
      : " Quantità coerenti con l'ordine.";
    userMsg =
      `📄 DDT #${numero || "(senza numero)"} di ${fornitore} registrato (${ordineTxt}).${scostTxt} ` +
      `L'ufficio lo conferma a gestionale.`;
  } else {
    userMsg =
      `📄 DDT #${numero || "(senza numero)"} di ${fornitore} ricevuto e salvato. ` +
      `L'ufficio completa la registrazione del carico.`;
  }

  return okResult(
    {
      documento_estratto_id: doc.id,
      carico_id: carico.ok ? carico.carico?.id ?? null : null,
      numero_ddt: numero,
      ordine_collegato: carico.ok ? carico.ordine_collegato : false,
      scostamenti: carico.ok ? carico.scostamenti : null,
    },
    userMsg,
  );
}
