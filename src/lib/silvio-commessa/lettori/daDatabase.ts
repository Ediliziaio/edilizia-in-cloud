/**
 * Le letture dal database dei lettori a regole (31/10/2026, fase 1, lotto 1.1).
 *
 * Solo letture, e il meno possibile: qui si prendono le righe, il conto lo fanno le
 * funzioni pure accanto (preventivo.ts, computo.ts, commessa.ts), provate senza database.
 * Le policy RLS decidono cosa si vede: un utente che non vede i costi riceve il computo
 * senza costi, e il frammento lo dice.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Frammento } from "../../../../shared/silvio-commessa/piano.ts";
import { frammentoDalModello } from "../../../../shared/silvio-commessa/modelliLavoro.ts";
import { REGISTRO } from "../../../../shared/silvio-commessa/registro.ts";
import { leggiComputoCloud } from "@/lib/computo/cloudComputo";
import { codiciSenzaCosto, type CostoListino } from "@/lib/computo/costiDalListino";
import type { BozzaComputo } from "@/lib/computo/editorNativo";
import { frammentoDaPreventivo, modelloDelPreventivo, moduloDelPreventivo, MODULI_EDILI } from "./preventivo";
import { frammentoDaComputo } from "./computo";
import { frammentiPerCompletare, type DatiCommessaEsistente } from "./commessa";
import { COLONNE_CONTRATTO, frammentoDaContratto } from "./contratto";
import { attachmentStorage } from "@/components/orders/filePreviewUtils";
import { calendarioAzienda, type CalendarioCantiere } from "../../../../shared/silvio-commessa/calendario.ts";
import { leggiImpostazioniSilvio, type ImpostazioniSilvio } from "../autonomia";

// Tabelle che i tipi generati non conoscono tutte (i preventivatori, le sottofasi).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Riga = Record<string, unknown>;

async function una(tabella: string, colonne: string, id: string): Promise<Riga | null> {
  const { data, error } = await db.from(tabella).select(colonne).eq("id", id).maybeSingle();
  if (error) throw new Error(`Non riesco a leggere ${tabella}: ${error.message}`);
  return (data as Riga | null) ?? null;
}

/**
 * Il calendario dell'azienda per le date dei lettori (revisione 1/11, L10): chiusura estiva,
 * patrono, festività di Personale. Prima i lettori datavano con le sole feste nazionali e
 * mettevano fasi in agosto. Le impostazioni si leggono una volta per azienda; il patrono
 * dipende dalla città del cantiere. Se non si leggono, valgono le feste nazionali.
 */
const impostazioniLette = new Map<string, Promise<ImpostazioniSilvio>>();
async function calendarioPer(companyId: string | null | undefined, indirizzo: unknown): Promise<CalendarioCantiere | undefined> {
  if (!companyId) return undefined;
  let p = impostazioniLette.get(companyId);
  if (!p) { p = leggiImpostazioniSilvio(companyId); impostazioniLette.set(companyId, p); }
  const imp = await p;
  return calendarioAzienda(imp.calendario, typeof indirizzo === "string" ? indirizzo : null);
}

/** I costi del listino aziendale per i codici delle voci che non ne hanno. */
async function listinoPerBozza(companyId: string, bozza: BozzaComputo): Promise<CostoListino[]> {
  const codici = codiciSenzaCosto(bozza.voci);
  if (!codici.length) return [];
  const { data, error } = await db.from("tariffe_aziendali").select("codice, prezzo_costo, costo_interno")
    .eq("company_id", companyId).in("codice", codici.slice(0, 500));
  if (error) return [];
  return ((data ?? []) as Riga[]).map((t) => ({ codice: String(t.codice ?? ""), costo: Number(t.prezzo_costo) || Number(t.costo_interno) || 0 }));
}

/** Il computo nativo (`computo_preventivo_drafts`) come frammento, con i costi mancanti dal listino. */
export async function leggiFrammentoComputo(
  companyId: string, draftId: string, inizio?: string | null, calendario?: CalendarioCantiere,
): Promise<Frammento | null> {
  const computo = await leggiComputoCloud(companyId, draftId);
  if (!computo) return null;
  const [listino, cal] = await Promise.all([listinoPerBozza(companyId, computo.bozza), calendario ?? calendarioPer(companyId, null)]);
  return frammentoDaComputo({ bozza: computo.bozza, id: draftId, listino, inizio, calendario: cal });
}

/**
 * Il preventivo come frammenti: il preventivo stesso e, se è nato da un computo, il computo
 * (che dà capitoli, sottofasi e costi). Se nessuno dei due dice le fasi e il lavoro si
 * riconosce, si aggiunge il modello per tipo di lavoro, marcato come stima.
 */
export async function leggiFrammentiPreventivo(quoteId: string, inizio?: string | null): Promise<Frammento[]> {
  const quote = await una("quotes", "*", quoteId);
  if (!quote) throw new Error("Preventivo non trovato, o non hai il permesso di vederlo.");
  const { data: righe, error } = await db.from("quote_items").select("*").eq("quote_id", quoteId).order("sort_order", { ascending: true });
  if (error) throw new Error(`Non riesco a leggere le righe del preventivo: ${error.message}`);

  const calendario = await calendarioPer(quote.company_id as string | null, quote.indirizzo_lavori ?? null);
  const sorgente = moduloDelPreventivo(quote.source);
  const frammenti: Frammento[] = [];
  let modulo: Parameters<typeof frammentoDaPreventivo>[0]["modulo"] = null;
  let cronoprogrammaModello: unknown = null;

  if (sorgente?.chiave === "computo") {
    const computo = await leggiFrammentoComputo(String(quote.company_id), sorgente.progettoId, inizio, calendario);
    if (computo) frammenti.push(computo);
  } else if (sorgente && MODULI_EDILI[sorgente.chiave]) {
    const { prefisso } = MODULI_EDILI[sorgente.chiave];
    const progetto = await una(`${prefisso}_progetti`, "*", sorgente.progettoId);
    if (progetto) {
      const { data: voci } = await db.from(`${prefisso}_computo_voci`).select("*").eq("progetto_id", sorgente.progettoId);
      modulo = { chiave: sorgente.chiave, progetto, voci: (voci ?? []) as Riga[] };
      if (!progetto.cronoprogramma && progetto.template_id) {
        // Il modello può non avere la colonna: senza, le fasi vengono dalle voci o dal modello per tipo di lavoro.
        const { data: t } = await db.from(`${prefisso}_template_pdf`).select("cronoprogramma").eq("id", progetto.template_id).maybeSingle();
        cronoprogrammaModello = (t as Riga | null)?.cronoprogramma ?? null;
      }
    }
  }

  const preventivo = frammentoDaPreventivo({ quote, righe: (righe ?? []) as Riga[], modulo, cronoprogrammaModello, inizio, calendario });
  frammenti.unshift(preventivo);
  const conFasi = frammenti.some((f) => f.aree.fasi?.["fasi.order_work_phases"]);
  const tipo = modelloDelPreventivo({ quote, modulo });
  if (!conFasi && tipo) frammenti.push(frammentoDalModello(tipo, { inizio, calendario }));
  return frammenti;
}

/** Le tabelle collegate del registro che il lettore della commessa conta soltanto. */
const TABELLE_DA_CONTARE = [...new Set(REGISTRO.flatMap((v) => (v.controllo.tipo === "righe" ? v.controllo.tabelle : [])))]
  .filter((t) => !["order_work_phases", "order_installments", "order_items"].includes(t));

/** Le righe della commessa che servono al lettore, lette una volta. */
async function leggiDatiCommessa(orderId: string): Promise<DatiCommessaEsistente> {
  const order = await una("orders", "*", orderId);
  if (!order) throw new Error("Commessa non trovata, o non hai il permesso di vederla.");
  const [fasi, rate, righe] = await Promise.all([
    db.from("order_work_phases").select("id, name, start_date, end_date, position").eq("order_id", orderId),
    db.from("order_installments").select("label, type, amount, position, trigger_evento, trigger_numero").eq("order_id", orderId),
    db.from("order_items").select("*").eq("order_id", orderId),
  ]);
  for (const r of [fasi, rate, righe]) if (r.error) throw new Error(`Non riesco a leggere la commessa: ${r.error.message}`);
  const idFasi = ((fasi.data ?? []) as Riga[]).map((f) => String(f.id));
  const { data: sotto } = idFasi.length
    ? await db.from("order_work_subphases").select("phase_id, name, position").in("phase_id", idFasi)
    : { data: [] };
  const conteggi: Record<string, number> = {};
  await Promise.all(TABELLE_DA_CONTARE.map(async (t) => {
    // Una tabella che questo utente non può leggere conta zero: Silvio proporrà, la RPC deciderà.
    const { count } = await db.from(t).select("order_id", { count: "exact", head: true }).eq("order_id", orderId);
    conteggi[t] = count ?? 0;
  }));
  return {
    order,
    calendario: await calendarioPer(order.company_id as string | null, order.indirizzo_lavori ?? order.work_address ?? null),
    fasi: ((fasi.data ?? []) as Riga[]).map((f) => ({ ...f, sottofasi: ((sotto ?? []) as Riga[]).filter((s) => s.phase_id === f.id) })),
    rate: (rate.data ?? []) as Riga[],
    righe: (righe.data ?? []) as Riga[],
    conteggi,
  };
}

/** La commessa esistente come frammento di fonte `persona` (fase 2, «Completa con Silvio»). */
export async function leggiFrammentoCommessa(orderId: string): Promise<Frammento> {
  return frammentiPerCompletare(await leggiDatiCommessa(orderId))[0];
}

/** La commessa e, se non ha fasi e si capisce il lavoro, il modello per tipo di lavoro. */
export async function leggiFrammentiCommessa(orderId: string): Promise<Frammento[]> {
  return frammentiPerCompletare(await leggiDatiCommessa(orderId));
}

/** Un documento già allegato alla commessa (`order_attachments`). */
export interface AllegatoCommessa {
  id: string;
  nome: string;
  path: string;
  mime: string | null;
  dimensione: number | null;
}

/** I documenti della commessa, i più recenti per primi (al massimo 50). */
export async function elencaAllegatiCommessa(orderId: string): Promise<AllegatoCommessa[]> {
  const { data, error } = await db.from("order_attachments").select("id, file_name, file_url, file_type, file_size")
    .eq("order_id", orderId).order("created_at", { ascending: false }).limit(50);
  if (error) throw new Error(`Non riesco a leggere i documenti della commessa: ${error.message}`);
  return ((data ?? []) as Riga[]).map((a) => ({
    id: String(a.id), nome: String(a.file_name ?? "documento"), path: String(a.file_url ?? ""),
    mime: (a.file_type as string | null) ?? null, dimensione: (a.file_size as number | null) ?? null,
  }));
}

/** Scarica un documento della commessa come File, per farlo leggere a Silvio. */
export async function scaricaAllegatoCommessa(a: AllegatoCommessa): Promise<File> {
  const { bucket, path } = attachmentStorage(a.path);
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error("Documento non trovato tra quelli della commessa.");
  return new File([data], a.nome, { type: a.mime || data.type || "" });
}

/** Un contratto scritto nell'app (`contratti_documents`), come frammento a regole. */
export async function leggiFrammentoContratto(id: string): Promise<Frammento> {
  const riga = await una("contratti_documents", COLONNE_CONTRATTO, id);
  if (!riga) throw new Error("Contratto non trovato, o non hai il permesso di vederlo.");
  return frammentoDaContratto(riga);
}
