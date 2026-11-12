/**
 * La merce della bolla entra in magazzino quando la bolla si salva (12/11/2026).
 *
 * Prima registrare la bolla non caricava niente: la giacenza cresceva solo con
 * «Conferma consegne» nella pagina della bolla, e delle 238 bolle con destinazione
 * magazzino nessuna l'aveva mai fatto. Ora, se la persona può muovere il magazzino,
 * al salvataggio c'è la spunta «Carica in magazzino», già messa: dopo il salvataggio
 * si chiama la stessa `ddt_conferma_consegna` della pagina della bolla, con le righe
 * che possono entrare senza domande. Le altre restano da confermare lì, e si dice
 * quali e perché.
 *
 * La funzione del database è tutto o niente: una riga che non va fa fallire l'intera
 * chiamata. Per questo qui si scartano prima le righe che fallirebbero di sicuro
 * (senza quantità, senza unità, da abbinare all'ordine, unità diversa dall'articolo).
 * Se fallisce lo stesso, la bolla resta salvata e si dice di confermare a mano.
 */
import { toast } from "sonner";
import { documentiDb } from "@/lib/ddt/documentiPersistenti";
import { articoloCerto, type ArticoloMagazzino } from "@/lib/ddt/importBolle";
import { loadCatalogPages } from "@/lib/listino/loadCatalogPages";

/** Lo stesso confronto di `public.ddt_unita`: «nr» e «pz» sono la stessa unità. */
export function unitaDdt(v: string | null | undefined): string {
  const t = (v ?? "").trim().toLowerCase();
  const sinonimi: Record<string, string> = {
    "m²": "mq", m2: "mq", "m³": "mc", m3: "mc", m: "ml",
    n: "pz", nr: "pz", "n.": "pz", pcs: "pz", pezzi: "pz",
  };
  return sinonimi[t] ?? t;
}

/** La spunta si vede solo se la merce va in magazzino e chi salva può muoverlo. */
export function mostraSpuntaCarico(p: {
  destinazione: "magazzino" | "cantiere";
  puoMagazzino: boolean;
  nessunMagazzino?: boolean;
}): boolean {
  return p.destinazione === "magazzino" && p.puoMagazzino && !p.nessunMagazzino;
}

export interface RigaSalvata {
  id: string;
  descrizione: string;
  codice_articolo: string | null;
  quantita: number | null;
  unita_misura: string | null;
  purchase_order_item_id?: string | null;
  abbinamento?: "auto" | "manuale" | null;
  arrivo_registrato_il?: string | null;
  movimento_id?: string | null;
}

export interface ArticoloStock extends ArticoloMagazzino {
  unita_misura: string | null;
  tracking_mode?: string | null;
}

export interface RigaOrdine {
  id: string;
  unit_of_measure: string | null;
  quantity: number | null;
  quantity_received: number | null;
}

export interface RigaCarico {
  riga_id: string;
  quantita: number;
  destinazione: "magazzino";
  warehouse_id: string;
  tipo: "ingresso";
  crea_articolo: boolean;
  stock_item_id: string | null;
  conferma_unita: boolean;
  accetta_eccedenza: false;
}

export interface RigaEsclusa {
  riga_id: string;
  descrizione: string;
  motivo: string;
}

/** Quali righe entrano subito, e quali restano da confermare dalla pagina della bolla. */
export function preparaCarico(p: {
  righe: ReadonlyArray<RigaSalvata>;
  warehouseId: string;
  /** La bolla è legata a un ordine d'acquisto: le righe vanno abbinate prima. */
  odaSullaBolla: boolean;
  giaConsegnate: ReadonlySet<string>;
  articoli: ReadonlyArray<ArticoloStock>;
  righeOrdine?: ReadonlyMap<string, RigaOrdine>;
}): { invio: RigaCarico[]; escluse: RigaEsclusa[] } {
  const invio: RigaCarico[] = [];
  const escluse: RigaEsclusa[] = [];
  const escludi = (r: RigaSalvata, motivo: string) =>
    escluse.push({ riga_id: r.id, descrizione: r.descrizione, motivo });
  for (const r of p.righe) {
    // Già entrata (dall'arrivo dell'ordine o da una conferma): niente da dire.
    if (r.arrivo_registrato_il || r.movimento_id || p.giaConsegnate.has(r.id)) continue;
    const q = Number(r.quantita);
    if (r.quantita == null || !Number.isFinite(q) || q <= 0) { escludi(r, "manca la quantità"); continue; }
    const unita = unitaDdt(r.unita_misura);
    if (!unita) { escludi(r, "manca l'unità di misura"); continue; }
    if (r.purchase_order_item_id) {
      const po = p.righeOrdine?.get(r.purchase_order_item_id);
      if (po && po.unit_of_measure && unitaDdt(po.unit_of_measure) !== unita) {
        escludi(r, "unità diversa dall'ordine"); continue;
      }
      if (po && po.quantity != null && Number(po.quantity_received ?? 0) + q > Number(po.quantity)) {
        escludi(r, "supera la quantità ordinata"); continue;
      }
    } else if (p.odaSullaBolla && r.abbinamento !== "manuale") {
      escludi(r, "da abbinare all'ordine"); continue;
    }
    const articolo = articoloCerto(r, p.articoli) as ArticoloStock | null;
    if (articolo?.tracking_mode === "serialized") { escludi(r, "articolo con numeri di serie"); continue; }
    if (articolo && articolo.unita_misura && unitaDdt(articolo.unita_misura) !== unita) {
      escludi(r, `unità diversa dall'articolo «${articolo.name}» in magazzino`); continue;
    }
    invio.push({
      riga_id: r.id,
      quantita: q,
      destinazione: "magazzino",
      warehouse_id: p.warehouseId,
      tipo: "ingresso",
      // Come «Conferma consegne»: se non c'è l'articolo lo crea la funzione.
      crea_articolo: !articolo,
      stock_item_id: articolo?.id ?? null,
      conferma_unita: !!articolo && !articolo.unita_misura,
      accetta_eccedenza: false,
    });
  }
  return { invio, escluse };
}

export interface EsitoCarico {
  /** «sospeso»: la merce va in magazzino ma l'azienda non ne ha ancora uno. */
  stato: "caricato" | "niente" | "errore" | "sospeso";
  righe: number;
  escluse: RigaEsclusa[];
  errore?: string;
}

const testo = (e: unknown) =>
  e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string"
    ? (e as { message: string }).message
    : "errore sconosciuto";

type Db = Pick<typeof documentiDb, "from" | "rpc">;

/**
 * Carica in magazzino le righe della bolla appena salvata. Non lancia mai: la bolla
 * è già salvata, e un carico non riuscito non deve farla sembrare persa.
 */
export async function caricaAlSalvataggio(ddtId: string, db: Db = documentiDb): Promise<EsitoCarico> {
  try {
    const { data: ddt, error } = await db
      .from("ddt_ricezione")
      .select("id, company_id, warehouse_id, destinazione, purchase_order_id")
      .eq("id", ddtId)
      .single();
    if (error || !ddt) throw error ?? new Error("Bolla non trovata");
    if (ddt.destinazione !== "magazzino") return { stato: "niente", righe: 0, escluse: [] };
    if (!ddt.warehouse_id) return { stato: "sospeso", righe: 0, escluse: [] };
    const [righe, consegne] = await Promise.all([
      db.from("ddt_righe")
        .select("id, descrizione, codice_articolo, quantita, unita_misura, purchase_order_item_id, abbinamento, arrivo_registrato_il, movimento_id")
        .eq("ddt_ricezione_id", ddtId)
        .order("posizione"),
      db.from("ddt_consegne").select("riga_id").eq("ddt_id", ddtId),
    ]);
    if (righe.error) throw righe.error;
    if (consegne.error) throw consegne.error;
    const elenco = (righe.data ?? []) as RigaSalvata[];
    if (!elenco.length) return { stato: "niente", righe: 0, escluse: [] };
    const idsOrdine = [...new Set(elenco.map((r) => r.purchase_order_item_id).filter(Boolean))] as string[];
    const [articoli, ordine] = await Promise.all([
      loadCatalogPages<ArticoloStock>((da, a) =>
        db.from("warehouse_stock")
          .select("id, name, internal_code, barcode, unita_misura, tracking_mode")
          .eq("company_id", ddt.company_id)
          .eq("warehouse_id", ddt.warehouse_id)
          .order("id")
          .range(da, a),
      ),
      idsOrdine.length
        ? db.from("purchase_order_items").select("id, unit_of_measure, quantity, quantity_received").in("id", idsOrdine)
        : Promise.resolve({ data: [] as RigaOrdine[], error: null }),
    ]);
    if (ordine.error) throw ordine.error;
    const { invio, escluse } = preparaCarico({
      righe: elenco,
      warehouseId: ddt.warehouse_id,
      odaSullaBolla: !!ddt.purchase_order_id,
      giaConsegnate: new Set(((consegne.data ?? []) as { riga_id: string }[]).map((c) => c.riga_id)),
      articoli,
      righeOrdine: new Map(((ordine.data ?? []) as RigaOrdine[]).map((o) => [o.id, o])),
    });
    if (!invio.length) return { stato: "niente", righe: 0, escluse };
    const { error: errCarico } = await db.rpc("ddt_conferma_consegna", {
      p_id: crypto.randomUUID(),
      p_ddt: ddtId,
      p_righe: invio,
    });
    if (errCarico) throw errCarico;
    return { stato: "caricato", righe: invio.length, escluse };
  } catch (e) {
    return { stato: "errore", righe: 0, escluse: [], errore: testo(e) };
  }
}

export const AVVISO_CARICO_NON_RIUSCITO =
  "Bolla salvata, carico non riuscito: confermalo dalla pagina della bolla";

/** Cosa dire a chi ha salvato. Null quando non c'è niente da dire. */
export function messaggioCarico(esito: EsitoCarico, numero?: string): {
  tipo: "successo" | "avviso";
  titolo: string;
  descrizione?: string;
} | null {
  const di = numero ? ` (bolla ${numero})` : "";
  const elencoEscluse = esito.escluse
    .slice(0, 4)
    .map((r) => `${r.descrizione || "riga senza descrizione"}: ${r.motivo}`)
    .join(" · ") + (esito.escluse.length > 4 ? ` · e altre ${esito.escluse.length - 4}` : "");
  if (esito.stato === "sospeso")
    return {
      tipo: "avviso",
      titolo: `Bolla salvata${di}: il carico in magazzino resta in sospeso`,
      descrizione: "Non c'è ancora un magazzino di arrivo. Quando l'amministratore lo crea, conferma il carico dalla pagina della bolla.",
    };
  if (esito.stato === "errore") return { tipo: "avviso", titolo: AVVISO_CARICO_NON_RIUSCITO + di, descrizione: esito.errore };
  if (esito.stato === "niente")
    return esito.escluse.length
      ? { tipo: "avviso", titolo: `Bolla salvata, nessuna riga caricata in magazzino${di}: confermale dalla pagina della bolla`, descrizione: elencoEscluse }
      : null;
  const caricate = `${esito.righe} ${esito.righe === 1 ? "riga caricata" : "righe caricate"} in magazzino${di}`;
  return esito.escluse.length
    ? { tipo: "avviso", titolo: `${caricate}; ${esito.escluse.length} da confermare dalla pagina della bolla`, descrizione: elencoEscluse }
    : { tipo: "successo", titolo: caricate };
}

/** Il messaggio a schermo, uguale in tutte le finestre che salvano bolle. */
export function avvisaEsitoCarico(esito: EsitoCarico, numero?: string): void {
  const m = messaggioCarico(esito, numero);
  if (!m) return;
  const opzioni = m.descrizione ? { description: m.descrizione, duration: 12000 } : undefined;
  if (m.tipo === "successo") toast.success(m.titolo, opzioni);
  else toast.warning(m.titolo, opzioni);
}
