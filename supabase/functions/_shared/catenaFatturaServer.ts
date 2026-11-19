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
import { costruisciCatena, type CatenaFattura, type CommessaNota, type ContrattoNoto, type DdtNoto, type OrdineNoto } from "../../../shared/acquisti/catena.ts";
import { ddtNeiTesti, leggiRiferimentiFattura, ordiniNeiTesti } from "../../../shared/acquisti/riferimentiFattura.ts";

export interface FatturaPerCatenaServer {
  id: string;
  company_id: string;
  fornitore_id: string | null;
  data_fattura: string | null;
  xml_raw: string | null;
  indice_corpo?: number | null;
  note?: string | null;
}

export interface EsitoCatenaServer {
  catena: CatenaFattura | null;
  commessa: { order_id: string; motivo: string } | null;
  conflitto: string | null;
  /** Perché non si è lanciata la catena (niente XML, nessun riferimento). */
  saltata: string | null;
  proposta?: { order_id: string; motivo: string } | null;
}

// deno-lint-ignore no-explicit-any
type Db = any;

/** PostgREST taglia comunque a 1000 righe: oltre, le bolle più vecchie restano fuori (si dice nel documento). */
const LIMITE = 1000;

export async function catenaDellaFattura(db: Db, f: FatturaPerCatenaServer): Promise<EsitoCatenaServer> {
  const vuoto = (saltata: string): EsitoCatenaServer => ({ catena: null, commessa: null, conflitto: null, saltata });
  if (!f.xml_raw) return vuoto("fattura senza XML");
  const riferimenti = leggiRiferimentiFattura(f.xml_raw, f.indice_corpo ?? 0);
  const ddtNelTesto = ddtNeiTesti(riferimenti, f.note ?? "");
  const haDocumenti = riferimenti.ddt.length || ddtNelTesto.length || ordiniNeiTesti(riferimenti, f.note ?? "").length || riferimenti.ordini.some((o) => o.numero) || riferimenti.contratti.some((c) => c.numero);

  // Le commesse servono sempre (codice e indirizzo nel testo); bolle e ordini solo se la fattura li cita.
  // Contratti di subappalto solo se la fattura cita un contratto e il fornitore è un subappaltatore.
  const citaContratto = riferimenti.contratti.some((c) => c.numero) && !!f.fornitore_id;
  // Solo ordini emessi: una bozza non è un ordine che il fornitore può citare.
  const EMESSI = ["inviato", "confermato", "parziale", "ricevuto"];
  const COLONNE_ORDINE = "id, company_id, supplier_id, oda_number, supplier_reference, issue_date, order_id, delivery_warehouse_id";
  const [comm, bolle, contrattiRighe] = await Promise.all([
    db.from("orders").select("id, company_id, order_code, indirizzo_lavori, work_address, client_name, client_company").eq("company_id", f.company_id).is("deleted_at", null).limit(LIMITE),
    haDocumenti && f.fornitore_id
      ? db.from("ddt_ricezione").select("id, company_id, supplier_id, numero_ddt, data_ricezione, purchase_order_id, order_id, warehouse_id").eq("company_id", f.company_id).eq("supplier_id", f.fornitore_id).limit(LIMITE)
      : { data: [] },
    citaContratto
      ? db.from("contratti_subappalto").select("id, company_id, subappaltatore_id, numero_contratto, data_stipula, order_id, stato").eq("company_id", f.company_id).neq("stato", "bozza").not("numero_contratto", "is", null).limit(LIMITE)
      : { data: [] },
  ]);
  for (const r of [comm, bolle, contrattiRighe]) if (r.error) throw r.error;
  // I legami bolla ↔ ordine delle sole bolle di questo fornitore; gli ordini di questo fornitore più
  // quelli a cui portano le sue bolle. Un ordine di un altro fornitore citato per numero non cambierebbe
  // l'esito: il fornitore è una prova essenziale e lo esclude.
  const idsBolle = (bolle.data ?? []).map((d: { id: string }) => d.id);
  const legami = idsBolle.length
    ? await db.from("ddt_ordini_acquisto").select("ddt_id, purchase_order_id").eq("company_id", f.company_id).in("ddt_id", idsBolle).limit(LIMITE)
    : { data: [] };
  if (legami.error) throw legami.error;
  const idsOrdiniBolle = [...new Set([
    ...(bolle.data ?? []).map((d: { purchase_order_id: string | null }) => d.purchase_order_id),
    ...(legami.data ?? []).map((l: { purchase_order_id: string }) => l.purchase_order_id),
  ].filter(Boolean))] as string[];
  const [delFornitore, dalleBolle] = await Promise.all([
    !haDocumenti
      ? { data: [] }
      : f.fornitore_id
        ? db.from("purchase_orders").select(COLONNE_ORDINE).eq("company_id", f.company_id).eq("supplier_id", f.fornitore_id).in("status", EMESSI).limit(LIMITE)
        : db.from("purchase_orders").select(COLONNE_ORDINE).eq("company_id", f.company_id).in("status", EMESSI).limit(LIMITE),
    idsOrdiniBolle.length
      ? db.from("purchase_orders").select(COLONNE_ORDINE).eq("company_id", f.company_id).in("id", idsOrdiniBolle).in("status", EMESSI).limit(LIMITE)
      : { data: [] },
  ]);
  for (const r of [delFornitore, dalleBolle]) if (r.error) throw r.error;
  const ordini = { data: [...new Map([...(delFornitore.data ?? []), ...(dalleBolle.data ?? [])].map((o: { id: string }) => [o.id, o])).values()] };
  // Una lettura arrivata al limite può aver lasciato fuori proprio il documento che contraddice:
  // in quel caso niente commessa «certa» dalla catena (resta la proposta, decide una persona).
  const troncata = [comm, bolle, contrattiRighe, legami, delFornitore, dalleBolle].some((r) => (r.data ?? []).length >= LIMITE);
  // Il fornitore di un contratto è un subappaltatore: è «questo fornitore» solo se la sua scheda è collegata.
  let subDelFornitore: string | null = null;
  if ((contrattiRighe.data ?? []).length) {
    const { data: s, error } = await db.from("suppliers").select("subappaltatore_id").eq("id", f.fornitore_id).eq("company_id", f.company_id).maybeSingle();
    if (error) throw error;
    subDelFornitore = s?.subappaltatore_id ?? null;
  }
  const contratti: ContrattoNoto[] = (contrattiRighe.data ?? []).map((c: Record<string, string | null>) => ({
    id: c.id!,
    companyId: c.company_id!,
    // Un altro subappaltatore resta «un altro fornitore» (prova essenziale diversa: escluso).
    fornitoreId: subDelFornitore && c.subappaltatore_id === subDelFornitore ? f.fornitore_id : `subappaltatore:${c.subappaltatore_id}`,
    numero: c.numero_contratto ?? "",
    data: c.data_stipula,
    commessaId: c.order_id,
  }));

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
    clienteNome: c.client_name,
    clienteRagioneSociale: c.client_company,
  }));

  const catena = costruisciCatena(
    { id: f.id, companyId: f.company_id, fornitoreId: f.fornitore_id, data: f.data_fattura, riferimenti, ddtNelTesto, testo: f.note ?? "" },
    { ddt, ordini: ordiniNoti, contratti, commesse },
  );

  if (catena.esito === "conflitto") return { catena, commessa: null, conflitto: catena.motivo, saltata: null };
  if (catena.esito === "scelta") return { catena, commessa: null, conflitto: "Più commesse possibili dai riferimenti in fattura: conferma la destinazione.", saltata: null };
  const destinazioni = catena.allocazioni.filter((a) => a.destinazione.tipo !== "da_attribuire");
  const tutteCommessa = destinazioni.length > 0 && destinazioni.every((a) => a.destinazione.tipo === "commessa" && a.destinazione.id === destinazioni[0].destinazione.id);
  const daAttribuire = catena.allocazioni.some((a) => a.destinazione.tipo === "da_attribuire");
  if (catena.esito === "automatico" && tutteCommessa && !daAttribuire && troncata) {
    return { catena, commessa: null, conflitto: null, saltata: `troppi documenti (oltre ${LIMITE} letti): la commessa la conferma una persona` };
  }
  if (catena.esito === "automatico" && tutteCommessa && !daAttribuire) {
    const percorso = destinazioni.flatMap((a) => a.percorsi).map((p) => p.passi.join(" → "));
    return {
      catena,
      commessa: { order_id: destinazioni[0].destinazione.id!, motivo: `catena: ${[...new Set(percorso)].slice(0, 3).join(" · ")}`.slice(0, 300) },
      conflitto: null,
      saltata: null,
    };
  }
  const proposta = catena.esito === "proposta" && tutteCommessa && !daAttribuire && !troncata
    ? { order_id: destinazioni[0].destinazione.id!, motivo: `Da confermare: ${[...new Set(destinazioni.flatMap(a => a.percorsi).map(p => p.passi.join(" → ")))].join(" · ")}`.slice(0,300) }
    : null;
  return { catena, commessa: null, proposta, conflitto: null, saltata: null };
}
