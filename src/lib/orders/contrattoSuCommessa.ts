/**
 * Il contratto letto con l'AI applicato a una commessa che c'è già (14/11/2026, fase 6 del piano anomalie).
 *
 * Alla creazione il contratto riempie il modulo (CreateOrder, CreateLavoroAppaltatore). A commessa creata non c'è
 * un modulo vuoto: ci sono importo, voci e rate, e alcune rate possono essere già fatturate o incassate. Qui, in
 * funzioni pure, cosa cambia e cosa no:
 *
 *  - importo (imponibile) e IVA dal contratto;
 *  - le voci del contratto si AGGIUNGONO a quelle della commessa (mai tolte);
 *  - le rate fatturate, collegate a una fattura o incassate restano come sono; il piano del contratto copre il
 *    resto: le prime rate del contratto si considerano già coperte da quelle tenute, nell'ordine, e una rata
 *    coperta a metà scende della parte già coperta;
 *  - le date dei lavori solo se la commessa non le ha;
 *  - per il committente, tetto e riferimento del contratto se il documento li dà.
 */
import type { Installment } from "@/lib/orderUtils";
import {
  contractImponibile, contractNeedsAllocation, contractToInstallments, deriveIvaPct, type ContractExtract,
} from "@/lib/orders/contractExtract";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface RataEsistente extends Installment {
  id: string;
  documento_fiscale_id?: string | null;
  invoice_id?: string | null;
}

export interface CommessaPerContratto {
  total_amount: number | null;
  vat_rate: number | null;
  work_start_date: string | null;
  work_end_date: string | null;
  order_type: string | null;
  tetto_importo?: number | null;
  riferimento_committente?: string | null;
}

export interface VoceDaContratto {
  name: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  vat_rate: number;
}

export interface PianoContrattoSuCommessa {
  /** Campi per `commessa_salva` (solo quelli che il contratto cambia). */
  campi: Record<string, string | number | null>;
  imponibile: number | null;
  iva: number | null;
  voci: VoceDaContratto[];
  /** null = il contratto non ha un piano dei pagamenti: lo scadenzario non si tocca. */
  rateNuove: Installment[] | null;
  rateTenute: RataEsistente[];
  /** Rate che oggi ci sono e che il piano del contratto sostituisce. */
  rateSostituite: RataEsistente[];
  avvisi: string[];
}

/** Una rata che non si tocca: fatturata, collegata a una fattura, o incassata. */
export function rataBloccata(r: Pick<RataEsistente, "documento_fiscale_id" | "invoice_id" | "is_paid">): boolean {
  return !!r.documento_fiscale_id || !!r.invoice_id || !!r.is_paid;
}

/**
 * Il piano del contratto al netto delle rate tenute: queste coprono, nell'ordine, le prime rate del contratto.
 * Restituisce le rate che restano e quanto delle tenute non trova posto nel contratto.
 */
export function pianoAlNettoDelleTenute(piano: readonly Installment[], tenute: readonly Pick<Installment, "amount">[]): { rate: Installment[]; eccedenza: number } {
  let coperto = round2(tenute.reduce((s, r) => s + (Number(r.amount) || 0), 0));
  const rate: Installment[] = [];
  for (const r of piano) {
    if (coperto >= r.amount - 0.01) { coperto = round2(coperto - r.amount); continue; }
    if (coperto > 0.01) { rate.push({ ...r, amount: round2(r.amount - coperto) }); coperto = 0; continue; }
    coperto = 0;
    rate.push({ ...r });
  }
  return { rate, eccedenza: coperto > 0.01 ? coperto : 0 };
}

const euroIT = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });

export function pianoContrattoSuCommessa(
  ex: ContractExtract,
  commessa: CommessaPerContratto,
  rateEsistenti: readonly RataEsistente[],
): PianoContrattoSuCommessa {
  const avvisi: string[] = [];
  const campi: Record<string, string | number | null> = {};
  const ripartire = contractNeedsAllocation(ex);
  if (ripartire) avvisi.push("Il contratto è di un raggruppamento: la quota dell'azienda va decisa a mano. Importo, voci e rate non si applicano.");

  const imponibile = ripartire ? null : contractImponibile(ex);
  const iva = deriveIvaPct(ex);
  if (imponibile != null && imponibile > 0) campi.total_amount = round2(imponibile);
  if (iva != null && !ripartire) campi.vat_rate = iva;
  if (ex.valuta && ex.valuta !== "EUR") avvisi.push(`Il documento è in ${ex.valuta}: controlla gli importi prima di applicarli.`);

  if (!commessa.work_start_date && ex.data_inizio_lavori) campi.work_start_date = ex.data_inizio_lavori;
  if (!commessa.work_end_date && ex.data_fine_lavori) campi.work_end_date = ex.data_fine_lavori;
  if (commessa.order_type === "appaltatore_lavoro" && ex.dati_appalto) {
    if (ex.dati_appalto.tetto_eur != null && ex.dati_appalto.tetto_eur > 0) campi.tetto_importo = round2(ex.dati_appalto.tetto_eur);
    if ((ex.dati_appalto.riferimento ?? "").trim() && !(commessa.riferimento_committente ?? "").trim()) {
      campi.riferimento_committente = ex.dati_appalto.riferimento!.trim();
    }
  }

  const ivaVoci = iva ?? commessa.vat_rate ?? 22;
  const voci: VoceDaContratto[] = ripartire ? [] : [
    ...ex.voci
      .filter((v) => (v.descrizione ?? "").trim() && !/^\s*(sub)?total[ei]?\b/i.test(v.descrizione ?? ""))
      .map((v) => ({
        name: v.descrizione.trim(),
        quantity: v.quantita > 0 ? v.quantita : 1,
        unit_price: round2(v.prezzo_unitario_eur || 0),
        discount_percent: ex.sconto_globale_pct ?? 0,
        vat_rate: ivaVoci,
      })),
    ...ex.altri_costi.filter((a) => (a.descrizione ?? "").trim()).map((a) => ({
      name: a.descrizione.trim(), quantity: 1, unit_price: round2(a.importo_eur || 0), discount_percent: 0, vat_rate: ivaVoci,
    })),
  ];

  const rateTenute = rateEsistenti.filter(rataBloccata);
  const rateLibere = rateEsistenti.filter((r) => !rataBloccata(r));
  const piano = ripartire ? [] : contractToInstallments(ex, imponibile ?? 0);
  let rateNuove: Installment[] | null = null;
  if (piano.length === 0) {
    if (!ripartire) avvisi.push("Il contratto non ha un piano dei pagamenti leggibile: le rate della commessa restano com'erano.");
  } else {
    const { rate, eccedenza } = pianoAlNettoDelleTenute(piano, rateTenute);
    const dopo = rateTenute.reduce((m, r) => Math.max(m, Number(r.position) || 0), -1) + 1;
    rateNuove = rate.map((r, i): Installment => {
      const { id: _id, amount_from_contract: _contratto, ...resto } = r;
      return { ...resto, position: dopo + i };
    });
    if (rateTenute.length > 0) {
      avvisi.push(`${rateTenute.length === 1 ? "Una rata è già fatturata o incassata e resta" : `${rateTenute.length} rate sono già fatturate o incassate e restano`} com'è: il contratto copre il resto.`);
    }
    if (eccedenza > 0) avvisi.push(`Le rate già fatturate o incassate superano il piano del contratto di ${euroIT(eccedenza)}: controlla prima di applicare.`);
  }

  return {
    campi, imponibile, iva, voci, rateNuove, rateTenute,
    rateSostituite: rateNuove ? rateLibere : [],
    avvisi,
  };
}

/** La voce in commessa è un acquisto, senza prezzo di vendita: quello del contratto resta nella descrizione. */
export function descrizioneVoceContratto(v: Pick<VoceDaContratto, "quantity" | "unit_price" | "discount_percent">): string | null {
  if (!(v.unit_price > 0)) return null;
  const euro = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sconto = v.discount_percent > 0 ? `, sconto ${String(v.discount_percent).replace(".", ",")}%` : "";
  return `Dal contratto: ${String(v.quantity).replace(".", ",")} × ${euro(v.unit_price)} €${sconto}`;
}

/** Le rate per `commessa_salva`: le tenute con il loro id e i loro dati, poi le nuove. */
export function rateDaSalvare(piano: Pick<PianoContrattoSuCommessa, "rateNuove" | "rateTenute">): Record<string, unknown>[] | null {
  if (!piano.rateNuove) return null;
  const tenute = piano.rateTenute.map((r) => ({
    id: r.id, position: r.position, label: r.label, type: r.type, amount: r.amount,
    is_paid: r.is_paid, paid_date: r.paid_date ?? null, expected_date: r.expected_date ?? null,
    trigger_evento: r.trigger_evento || "data_fissa", trigger_status_id: r.trigger_status_id ?? null,
    trigger_numero: r.trigger_numero ?? null, giorni_preavviso: r.giorni_preavviso ?? 7,
    importo_da_misurare: r.importo_da_misurare ?? false, trigger_soglia: r.trigger_soglia ?? null,
    trigger_fase: r.trigger_fase ?? null, termine_giorni: r.termine_giorni ?? 0, termine_fine_mese: r.termine_fine_mese ?? false,
    ...(r.invoice_id ? { invoice_id: r.invoice_id } : {}),
  }));
  const nuove = piano.rateNuove.map((r) => ({
    position: r.position, label: r.label, type: r.type, amount: r.amount, is_paid: false,
    paid_date: null as string | null, expected_date: r.expected_date ?? null, trigger_evento: "data_fissa", giorni_preavviso: 7,
  }));
  return [...tenute, ...nuove];
}
