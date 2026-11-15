/**
 * La catena di una fattura ricevuta, lato server (docs/automazioni-acquisti.md, lotto 6).
 *
 * Carica dal database i documenti della STESSA azienda della fattura (bolle del fornitore, ordini
 * non annullati, commesse non cancellate, anche chiuse: una fattura può arrivare tardi), legge i riferimenti dell'XML e lancia `costruisciCatena` (shared/acquisti/catena.ts).
 * L'azienda la decide la fattura, mai chi chiama. Nessuna chiamata AI.
 *
 * Restituisce, oltre alla catena completa:
 *   - `commessa`: la commessa unica a cui i documenti portano con CERTEZZA (esito «automatico»:
 *     DDT → ordine → commessa, ordine, codice), col percorso come motivo. Un esito solo
 *     plausibile (l'indirizzo del cantiere, una bolla senza data che conferma) non basta: chi lo
 *     riceve lo tratterebbe come sicuro. null anche se è un magazzino o se va ripartita;
 *   - `conflitto`: il perché, se i documenti indicano due destinazioni diverse. In quel caso la
 *     commessa NON la sceglie nessuno, nemmeno l'AI: la decide una persona.
 */
import { costruisciCatena, type CatenaFattura, type CommessaNota, type DdtNoto, type OrdineNoto } from "../../../shared/acquisti/catena.ts";
import { ddtNelleDescrizioni, leggiRiferimentiFattura } from "../../../shared/acquisti/riferimentiFattura.ts";

export interface FatturaPerCatenaServer {
  id: string;
  company_id: string;
  fornitore_id: string | null;
  data_fattura: string | null;
  xml_raw: string | null;
  indice_corpo?: number | null;
}

export interface EsitoCatenaServer {
  catena: CatenaFattura | null;
  commessa: { order_id: string; motivo: string } | null;
  conflitto: string | null;
  /** Perché non si è lanciata la catena (niente XML, nessun riferimento). */
  saltata: string | null;
}

// deno-lint-ignore no-explicit-any
type Db = any;

/** PostgREST taglia comunque a 1000 righe: oltre, le bolle più vecchie restano fuori (si dice nel documento). */
const LIMITE = 1000;

export async function catenaDellaFattura(db: Db, f: FatturaPerCatenaServer): Promise<EsitoCatenaServer> {
  const vuoto = (saltata: string): EsitoCatenaServer => ({ catena: null, commessa: null, conflitto: null, saltata });
  if (!f.xml_raw) return vuoto("fattura senza XML");
  const riferimenti = leggiRiferimentiFattura(f.xml_raw, f.indice_corpo ?? 0);
  const ddtNelTesto = riferimenti.ddt.length ? [] : ddtNelleDescrizioni(riferimenti.righe);
  const haDocumenti = riferimenti.ddt.length || ddtNelTesto.length || riferimenti.ordini.some((o) => o.numero) || riferimenti.contratti.some((c) => c.numero);

  // Le commesse servono sempre (codice e indirizzo nel testo); bolle e ordini solo se la fattura li cita.
  const [comm, bolle, ordini, legami] = await Promise.all([
    db.from("orders").select("id, company_id, order_code, indirizzo_lavori, work_address").eq("company_id", f.company_id).is("deleted_at", null).limit(LIMITE),
    haDocumenti && f.fornitore_id
      ? db.from("ddt_ricezione").select("id, company_id, supplier_id, numero_ddt, data_ricezione, purchase_order_id, order_id, warehouse_id").eq("company_id", f.company_id).eq("supplier_id", f.fornitore_id).limit(LIMITE)
      : { data: [] },
    haDocumenti
      ? db.from("purchase_orders").select("id, company_id, supplier_id, oda_number, supplier_reference, issue_date, order_id, delivery_warehouse_id").eq("company_id", f.company_id).neq("status", "annullato").limit(LIMITE)
      : { data: [] },
    haDocumenti && f.fornitore_id ? db.from("ddt_ordini_acquisto").select("ddt_id, purchase_order_id").eq("company_id", f.company_id).limit(LIMITE) : { data: [] },
  ]);
  for (const r of [comm, bolle, ordini, legami]) if (r.error) throw r.error;

  const ordiniPerDdt = new Map<string, string[]>();
  for (const l of legami.data ?? []) ordiniPerDdt.set(l.ddt_id, [...(ordiniPerDdt.get(l.ddt_id) ?? []), l.purchase_order_id]);

  const ddt: DdtNoto[] = (bolle.data ?? []).map((d: Record<string, string | null>) => ({
    id: d.id!,
    companyId: d.company_id!,
    fornitoreId: d.supplier_id,
    numero: d.numero_ddt ?? "",
    data: d.data_ricezione,
    ordiniIds: [...new Set([...(d.purchase_order_id ? [d.purchase_order_id] : []), ...(ordiniPerDdt.get(d.id!) ?? [])])],
    commessaId: d.order_id,
    magazzinoId: d.order_id ? null : d.warehouse_id,
  }));
  const ordiniNoti: OrdineNoto[] = (ordini.data ?? []).map((o: Record<string, string | null>) => ({
    id: o.id!,
    companyId: o.company_id!,
    fornitoreId: o.supplier_id,
    numero: o.oda_number ?? "",
    riferimentoFornitore: o.supplier_reference,
    data: o.issue_date,
    commessaId: o.order_id,
    magazzinoId: o.order_id ? null : o.delivery_warehouse_id,
  }));
  const commesse: CommessaNota[] = (comm.data ?? []).map((c: Record<string, string | null>) => ({
    id: c.id!,
    companyId: c.company_id!,
    codice: c.order_code,
    indirizzoCantiere: c.indirizzo_lavori || c.work_address,
  }));

  const catena = costruisciCatena(
    { id: f.id, companyId: f.company_id, fornitoreId: f.fornitore_id, data: f.data_fattura, riferimenti, ddtNelTesto },
    { ddt, ordini: ordiniNoti, contratti: [], commesse },
  );

  if (catena.esito === "conflitto") return { catena, commessa: null, conflitto: catena.motivo, saltata: null };
  const destinazioni = catena.allocazioni.filter((a) => a.destinazione.tipo !== "da_attribuire");
  const tutteCommessa = destinazioni.length > 0 && destinazioni.every((a) => a.destinazione.tipo === "commessa" && a.destinazione.id === destinazioni[0].destinazione.id);
  const daAttribuire = catena.allocazioni.some((a) => a.destinazione.tipo === "da_attribuire");
  if (catena.esito === "automatico" && tutteCommessa && !daAttribuire) {
    const percorso = destinazioni.flatMap((a) => a.percorsi).map((p) => p.passi.join(" → "));
    return {
      catena,
      commessa: { order_id: destinazioni[0].destinazione.id!, motivo: `catena: ${[...new Set(percorso)].slice(0, 3).join(" · ")}`.slice(0, 300) },
      conflitto: null,
      saltata: null,
    };
  }
  return { catena, commessa: null, conflitto: null, saltata: null };
}
