import { percorsoStorageSicuro } from "../_shared/storageAmmesso.ts";
import { incorniciaTestoDocumento } from "../_shared/documentoNonFidato.ts";
import { idWhatsAppValido } from "./bolleInConversazione.ts";
import { buildInteractivePayload, idRispostaInterattiva, type InteractivePayload } from "./interactive.ts";
import { nuovaRichiestaPreventivo, sostituzionePdfPreventivo, vuolePreventivoInChat } from "./intentiRapidi.ts";
import { creaPreventivoAi } from "./tools/ufficio/crea_preventivo_ai.ts";
import type { ToolCtx } from "./tools/shared/types.ts";

type Bozza = {
  id: string;
  codice: string;
  cliente: string | null;
  iva: number | null;
  invia_pdf_qui: boolean;
  testo: string;
  pdf_path: string | null;
  testo_pdf: string | null;
  stato: "da_completare" | "in_elaborazione" | "pronta" | "da_verificare" | "salvata";
  revisione: number;
  anteprima: Record<string, unknown> | null;
  da_verificare: string | null;
  quote_id: string | null;
  updated_at: string;
};

type Risposta = {
  id?: string;
  messaggio?: string;
  menu?: InteractivePayload;
  conferma?: Record<string, unknown>;
  elabora?: () => Promise<void>;
};

const CAMPI = "id,cliente,iva,invia_pdf_qui,testo,pdf_path,testo_pdf,stato,revisione,anteprima,da_verificare,quote_id,updated_at";
const LEASE_MS = 4 * 60 * 1000;
const MAX_TESTO = 24_000;
const COMANDO_BOZZA = /^(riprendi|riprova|aggiorna)\s+(?:(?:il|la)\s+)?(?:bozza(?:\s+di\s+preventivo)?|preventivo)\s*([a-f0-9]{8}-[a-f0-9])?(?:\s+(.+))?$/is;
const DATI_BOZZA = /^(?:cliente\s*:\s*[^?]+$|cliente\s+[^,?]+,\s*iva\b|iva\s*(?:al\s+)?\d{1,3}(?:[.,]\d{1,2})?\s*(?:%|per cento)?[.!]?\s*$)/i;

export function riguardaBozzaPreventivo(testo: string, citazione: string | null) {
  return COMANDO_BOZZA.test(testo.trim()) || DATI_BOZZA.test(testo.trim()) || !!sostituzionePdfPreventivo(testo) ||
    (nuovaRichiestaPreventivo(testo) && (!!citazione || /\b(?:pdf|computo)\b/i.test(testo)));
}

function datiDichiarati(testo: string) {
  const valore = testo.match(/\biva\s*(?:(?:al|del|a)\s+|[:=]\s*)?(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:%|per cento)?\b/i)?.[1];
  const iva = valore === undefined ? NaN : Number(valore.replace(",", "."));
  const nome = testo.match(/\bcliente\s*[:=]?\s+([^\n,.!?;]+?)(?=\s+(?:con\s+)?iva\b|\s+(?:devo|dobbiamo|lavori|misure)\b|[,!.?;\n]|$)/i)?.[1]?.trim() ??
    testo.match(/\bpreventivo\s+per\s+([A-ZÀ-Ù][^\n,.!?;]{1,100}?)(?=\s+(?:(?:con\s+)?(?:[Ii][Vv][Aa])|per\s+(?:fare|la|il|i|le))\b|[,!.?;\n]|$)/)?.[1]?.trim();
  return {
    ...(nome && nome.length >= 2 ? { cliente: nome.slice(0, 200) } : {}),
    ...(Number.isFinite(iva) && iva >= 0 && iva <= 100 ? { iva } : {}),
  };
}

function percorsoDellaChat(ctx: ToolCtx, path: unknown): path is string {
  return typeof path === "string" && path.startsWith(ctx.company_id + "/") && percorsoStorageSicuro(path);
}

async function pdfDellaRichiesta(ctx: ToolCtx, testo: string, citazione: string | null) {
  if (ctx.mediaCorrente?.tipo === "document" && percorsoDellaChat(ctx, ctx.mediaCorrente.storagePath) &&
      /\.pdf$/i.test(ctx.mediaCorrente.storagePath)) return { path: ctx.mediaCorrente.storagePath, ambiguo: false };
  const chiedePdf = /\b(?:da|dal|questo|del)\s+(?:(?:questo|il)\s+)?(?:pdf|computo|documento)\b/i.test(testo);
  if (!citazione && !chiedePdf) return { path: null, ambiguo: false };
  const query = ctx.supabase.from("whatsapp_messages").select("media_storage_path")
    .eq("company_id", ctx.company_id).eq("wa_number_id", ctx.waNumberId).eq("from_phone", ctx.phone)
    .eq("direction", "inbound").eq("message_type", "document").not("media_storage_path", "is", null);
  const { data, error } = await (citazione ? query.eq("wa_message_id", citazione) :
    query.gte("created_at", new Date(Date.now() - 30 * 60_000).toISOString()).order("created_at", { ascending: false }).limit(5));
  if (error) throw new Error("pdf_della_bozza_non_disponibile");
  const disponibili = (data ?? []).map(r => r.media_storage_path)
    .filter(p => percorsoDellaChat(ctx, p) && /\.pdf$/i.test(p));
  return { path: disponibili.length === 1 ? disponibili[0] : null, ambiguo: disponibili.length !== 1 && chiedePdf };
}

function bozze(ctx: ToolCtx) {
  return ctx.supabase.from("whatsapp_preventivi_bozze").select(CAMPI).eq("company_id", ctx.company_id)
    .eq("created_by", ctx.user_id!).eq("wa_number_id", ctx.waNumberId).eq("mittente", ctx.phone);
}

function aggiorna(ctx: ToolCtx, b: Bozza, dati: Record<string, unknown>) {
  return ctx.supabase.from("whatsapp_preventivi_bozze").update(dati).eq("id", b.id)
    .eq("company_id", ctx.company_id).eq("created_by", ctx.user_id!).eq("wa_number_id", ctx.waNumberId).eq("mittente", ctx.phone)
    .eq("revisione", b.revisione).eq("stato", b.stato).eq("updated_at", b.updated_at);
}

async function estraiDalPdf(ctx: ToolCtx, path: string) {
  if (!percorsoDellaChat(ctx, path)) throw new Error("PDF originale non disponibile.");
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/silvio-extract-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
    body: JSON.stringify({ storage_path: path, bucket: "whatsapp-media", company_id: ctx.company_id, per_utente: ctx.user_id, max_chars: MAX_TESTO }),
    signal: AbortSignal.timeout(75_000),
  });
  const j = await res.json().catch((): null => null);
  if (!res.ok || typeof j?.text !== "string" || j.text.trim().length < 5 || j.coverage?.complete === false || j.truncated) {
    return null;
  }
  return j.text.trim();
}

function daVerificare(messaggio: string) {
  return { stato: "da_verificare", da_verificare: messaggio };
}

/** La versione in elaborazione viene presa prima delle chiamate AI e aggiornata solo dal suo tentativo. */
async function elaboraBozza(ctx: ToolCtx, b: Bozza) {
  const ora = new Date().toISOString();
  const { data, error } = await aggiorna(ctx, b, { stato: "in_elaborazione", updated_at: ora }).select("id").maybeSingle();
  if (error || !data) return;
  let risultato: Record<string, unknown> = { stato: "da_completare" };
  let testoPdf = b.testo_pdf;
  try {
    if (b.pdf_path && !testoPdf) testoPdf = await estraiDalPdf(ctx, b.pdf_path);
    if (b.pdf_path && !testoPdf) {
      risultato = daVerificare(`Non ho letto tutto il PDF. Per usare una copia più leggibile, allegala con «Sostituisci PDF ${b.codice}».`);
    } else if (b.cliente !== null && b.iva !== null) {
      const descrizione = testoPdf ? `${b.testo}\n\n${incorniciaTestoDocumento(testoPdf)}` : b.testo;
      if (descrizione.length > MAX_TESTO) {
        risultato = daVerificare(`Il computo è troppo lungo per la chat. Allega le pagine da preventivare con «Sostituisci PDF ${b.codice}».`);
      } else {
        const res = await creaPreventivoAi(ctx, { cliente_nome: b.cliente, iva: b.iva, descrizione });
        if (res.ok && res.data && typeof res.data === "object" && "dati_da_confermare" in res.data) {
          const anteprima: Record<string, unknown> = { ...res.data.dati_da_confermare };
          // Il testo originale serve alla lavorazione della bozza. Il PDF finale usa le voci approvate.
          delete anteprima.description;
          risultato = {
            stato: res.data.needs_clarification ? "da_verificare" : "pronta",
            anteprima,
            da_verificare: res.data.needs_clarification ? res.data.clarification ?? "Verifica le voci." : null,
          };
        } else risultato = daVerificare("La generazione si è interrotta. Puoi riprovare dalla stessa bozza.");
      }
    }
  } catch { risultato = daVerificare("La lettura si è interrotta. Puoi riprovare dalla stessa bozza."); }
  const fine = await aggiorna(ctx, { ...b, stato: "in_elaborazione", updated_at: ora },
    { ...risultato, testo_pdf: testoPdf, updated_at: new Date().toISOString() });
  if (fine.error) throw new Error("esito_preventivo_non_salvato");
}

function apriBozza(ctx: ToolCtx, b: Bozza): Risposta {
  const codice = `Bozza ${b.codice}`;
  const base = { id: b.id };
  if (b.stato === "salvata") return { ...base, messaggio: b.quote_id
    ? `${codice} è in Preventivi.\nhttps://app.ediliziaincloud.com/azienda/marketing/preventivi/${b.quote_id}/modifica`
    : `${codice} era stata trasferita in Preventivi. Verifica il registro dell’azienda.` };
  if (b.stato === "pronta" && b.anteprima) return { ...base, conferma: {
    ...b.anteprima, bozza_whatsapp_id: b.id, revisione_whatsapp: b.revisione, invia_pdf_qui: b.invia_pdf_qui,
  } };
  const elabora = () => elaboraBozza(ctx, b);
  if (b.stato === "in_elaborazione" && Date.now() - Date.parse(b.updated_at) < LEASE_MS) {
    return { ...base, messaggio: `${codice} in elaborazione. Puoi riaprirla tra poco.` };
  }
  if (b.stato === "in_elaborazione") return { ...base, messaggio: `${codice} ripresa. Sto completando la lettura.`, elabora };
  if (b.stato === "da_verificare") return { ...base, messaggio: `${codice}. ${b.da_verificare}\nPer riprovare scrivi «Riprova preventivo ${b.codice}».` };
  if ((b.pdf_path && !b.testo_pdf) || (b.cliente && b.iva !== null)) {
    return { ...base, messaggio: `${codice} salvata. Sto preparando le voci. Scrivi «Riprendi preventivo ${b.codice}» per rivederla.`, elabora };
  }
  const mancante = [!b.cliente && "cliente", b.iva === null && "IVA"].filter(Boolean).join(" e ");
  const esempio = [!b.cliente && "Cliente: Rossi", b.iva === null && "IVA 10%"].filter(Boolean).join(", ");
  return { ...base, messaggio: `${codice} salvata. Da indicare ${mancante}. Scrivi «${esempio}» con i dati corretti.` };
}

export async function preventivoInConversazione(ctx: ToolCtx, input: { testo: string; tipo: string; citazione: string | null; metadata: unknown }): Promise<Risposta | null> {
  if (!ctx.user_id || !["ufficio", "admin"].includes(ctx.kind) ||
    !ctx.role_grants.includes("preventivi.ai") || !idWhatsAppValido(ctx.requestId)) return null;
  const testo = input.testo.trim();
  const idBottone = input.tipo === "interactive" ? idRispostaInterattiva(input.metadata) : null;
  const selezione = idBottone?.startsWith("preventivo-riprendi:") ? idBottone.slice("preventivo-riprendi:".length) : null;
  const comando = testo.match(COMANDO_BOZZA);
  const sostituzione = sostituzionePdfPreventivo(testo);
  const completa = DATI_BOZZA.test(testo) && !["image", "document"].includes(input.tipo);
  if (selezione || comando || completa || sostituzione) {
    let nuovoPdf: string | null = null;
    if (sostituzione) {
      // Per la sostituzione serve il file di questo messaggio o quello citato.
      if (input.tipo === "document") {
        const path = ctx.mediaCorrente?.storagePath;
        if (percorsoDellaChat(ctx, path) && /\.pdf$/i.test(path)) nuovoPdf = path;
      } else if (input.citazione) {
        nuovoPdf = (await pdfDellaRichiesta({ ...ctx, mediaCorrente: null }, "da questo PDF", input.citazione)).path;
      }
      if (!nuovoPdf) return { messaggio: "Allega il nuovo PDF con «Sostituisci PDF» e il codice della bozza. Puoi anche rispondere direttamente al PDF con lo stesso comando." };
    }
    let elenco = bozze(ctx);
    const codice = sostituzione?.codice ?? comando?.[2]?.toUpperCase();
    if (selezione && idWhatsAppValido(selezione)) elenco = elenco.eq("id", selezione);
    else if (codice) elenco = elenco.eq("codice", codice);
    else if (!comando?.[3]) elenco = elenco.neq("stato", "salvata");
    if (completa) elenco = elenco.in("stato", ["da_completare", "da_verificare", "in_elaborazione"]);
    const { data, error } = await elenco.order("updated_at", { ascending: false }).limit(8);
    if (error) throw new Error("bozze_whatsapp_non_disponibili");
    const cerca = comando?.[3]?.replace(/^per\s+/i, "").trim().toLowerCase();
    const righe = (data ?? []).map(r => ({ ...r, codice: String(r.id).slice(0, 10).toUpperCase() })) as Bozza[];
    const candidati = cerca && comando?.[1].toLowerCase() === "riprendi" ? righe.filter(b => b.cliente?.toLowerCase() === cerca) : righe;
    if (candidati.length === 0) return completa ? null : { messaggio: "Non trovo questa bozza. Scrivi «Riprendi preventivo» per vedere le bozze aperte." };
    if (candidati.length > 1 && sostituzione) return {
      messaggio: ["Rispondi al nuovo PDF con «Sostituisci PDF» seguito dal codice della bozza.",
        ...candidati.map(b => `• ${b.codice}${b.cliente ? ` · ${b.cliente}` : ""}`)].join("\n"),
    };
    if (candidati.length > 1) return { menu: buildInteractivePayload("Quale bozza vuoi riprendere?", candidati.map(b => ({
      id: `preventivo-riprendi:${b.id}`, title: b.cliente || `Bozza ${b.codice}`, description: b.codice,
    })), "Apri una bozza", true) };
    const [b] = candidati;
    const modo = comando?.[1].toLowerCase();
    if (b.stato === "salvata" || (nuovoPdf && nuovoPdf === b.pdf_path) ||
      (!sostituzione && !completa && modo !== "aggiorna" && modo !== "riprova")) return apriBozza(ctx, b);
    if (modo === "riprova" && b.stato === "in_elaborazione" && Date.now() - Date.parse(b.updated_at) < LEASE_MS) return apriBozza(ctx, b);
    const campi = datiDichiarati(testo);
    const modifica = modo === "aggiorna" ? comando?.[3]?.trim() : null;
    if (completa && !Object.keys(campi).length) return { ...apriBozza(ctx, b), elabora: undefined };
    const nuovoTesto = modifica ? `${b.testo}\nAggiornamento richiesto: ${modifica}` : b.testo;
    if (nuovoTesto.length > MAX_TESTO) return { id: b.id, messaggio: "Il testo della bozza è troppo lungo. Indica una parte più breve." };
    const { data: nuova, error: aggiornamento } = await aggiorna(ctx, b, {
      ...campi, testo: nuovoTesto, revisione: b.revisione + 1, stato: "da_completare", anteprima: null, da_verificare: null,
      invia_pdf_qui: b.invia_pdf_qui || vuolePreventivoInChat(testo),
      ...(nuovoPdf ? { pdf_path: nuovoPdf, testo_pdf: null } : {}),
      updated_at: new Date().toISOString(),
    }).select(CAMPI).maybeSingle();
    if (aggiornamento || !nuova) return { id: b.id, messaggio: "La bozza è cambiata. Riprendila per vedere i dati aggiornati." };
    const esito = apriBozza(ctx, { ...nuova, codice: b.codice } as Bozza);
    return nuovoPdf ? { ...esito, messaggio: `PDF sostituito. ${esito.messaggio}` } : esito;
  }
  if (!nuovaRichiestaPreventivo(testo)) return null;
  if (!["audio", "document"].includes(input.tipo) && !input.citazione && !/\b(?:pdf|computo)\b/i.test(testo)) return null;
  const pdf = await pdfDellaRichiesta(ctx, testo, input.citazione);
  if (pdf.ambiguo) return { messaggio: "Rispondi al PDF del computo con la richiesta di preventivo, così apro la bozza dal file giusto." };
  const vocale = input.tipo === "audio" && percorsoDellaChat(ctx, ctx.mediaCorrente?.storagePath) ? ctx.mediaCorrente!.storagePath : null;
  if (!pdf.path && !vocale) return null;
  const { error } = await ctx.supabase.from("whatsapp_preventivi_bozze").upsert({
    id: ctx.requestId, company_id: ctx.company_id, created_by: ctx.user_id, wa_number_id: ctx.waNumberId, mittente: ctx.phone,
    testo: testo.slice(0, MAX_TESTO), pdf_path: pdf.path, vocale_path: vocale, invia_pdf_qui: vuolePreventivoInChat(testo),
    cliente: null, iva: null, testo_pdf: null, stato: "da_completare", revisione: 1, updated_at: new Date().toISOString(),
    ...datiDichiarati(testo),
  }, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new Error("bozza_whatsapp_non_salvata");
  const salvata = await bozze(ctx).eq("id", ctx.requestId).maybeSingle();
  if (salvata.error || !salvata.data) throw new Error("bozza_whatsapp_non_verificata");
  return apriBozza(ctx, { ...salvata.data, codice: ctx.requestId.slice(0, 10).toUpperCase() } as Bozza);
}
