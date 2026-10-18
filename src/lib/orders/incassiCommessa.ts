/**
 * Incassato e da incassare della commessa: UNA regola per tutti i riquadri
 * (intestazione, Panoramica, Conto economico, piano rate, cassa).
 *
 * Prima l'intestazione e il conto economico escludevano la rata del
 * finanziamento e toglievano il costo della finanziaria anche senza
 * finanziamento, mentre il piano rate li trattava al contrario: su una
 * commessa finanziata i numeri non coincidevano. La regola che vale è quella
 * del piano rate, perché è quella che il cliente e l'ufficio vedono rata per rata:
 *   · la rata del finanziamento è un incasso vero (la paga la finanziaria);
 *   · il costo della finanziaria si toglie solo se il pagamento è a finanziamento.
 * Importi IVA inclusa; `incassatoNetto` per i margini. Modulo puro.
 */
import { calculateCollectedGrossFromInstallments, grossToNetAmount, type VarianteDatata } from "@/lib/commissions";
import { importoConSegno, isDocumentoEmesso, isTipoVendita } from "@/lib/fatturazione/registroVendite";

type Rate = Parameters<typeof calculateCollectedGrossFromInstallments>[0]["installments"];

export interface IncassiCommessa {
  /** Quanto deve entrare in tutto, IVA inclusa, al netto del costo della finanziaria. */
  totaleLordo: number;
  incassatoLordo: number;
  daIncassareLordo: number;
  /** Incassato senza IVA, per i margini. */
  incassatoNetto: number;
  /** Costo della finanziaria considerato (0 se il pagamento non è a finanziamento). */
  costoFinanziaria: number;
}

export function incassiDellaCommessa(input: {
  installments: Rate;
  totalAmount: number;
  vatRate: number;
  paymentType: string | null | undefined;
  financingCost: number | null | undefined;
  /** Varianti approvate comprese in totalAmount, con la data: vedi calculateInstallmentCollections. */
  varianti?: ReadonlyArray<VarianteDatata>;
}): IncassiCommessa {
  const iva = Number.isFinite(input.vatRate) ? input.vatRate : 22;
  const costoFinanziaria = input.paymentType === "financing" ? Math.max(0, Number(input.financingCost) || 0) : 0;
  const totaleLordo = Math.max(0, Math.round((Number(input.totalAmount) || 0) * (1 + iva / 100) * 100) / 100 - costoFinanziaria);
  const incassatoLordo = calculateCollectedGrossFromInstallments({
    installments: input.installments,
    totalAmount: input.totalAmount,
    vatRate: iva,
    financingCost: costoFinanziaria,
    includeFinancing: true,
    varianti: input.varianti,
  });
  return {
    totaleLordo,
    incassatoLordo,
    daIncassareLordo: Math.max(0, totaleLordo - incassatoLordo),
    incassatoNetto: grossToNetAmount(incassatoLordo, iva),
    costoFinanziaria,
  };
}

export interface DocumentoFatturato {
  tipo: string | null;
  stato: string | null;
  /** Totale del documento, IVA inclusa. */
  totale_documento?: number | string | null;
  /** Quota della fattura assegnata a questa commessa (fattura_ordine), quando c'è. */
  importo_associato?: number | string | null;
}

/** Quanto di un documento spetta alla commessa: la quota assegnata, altrimenti il totale del documento. */
export function importoFatturatoCommessa(d: DocumentoFatturato): number {
  return Number(d.importo_associato ?? d.totale_documento ?? 0) || 0;
}

/**
 * Fatturato della commessa: solo documenti di vendita emessi (fatture di ogni tipo, parcelle,
 * note di debito; note di credito col segno meno), con le stesse regole del registro vendite.
 * Proforma, DDT e preventivi stanno nell'elenco dei documenti ma non sono fatturato.
 * L'importo è la quota assegnata alla commessa, se la fattura è divisa fra più commesse, oppure
 * il totale del documento: il «totale da pagare» è già al netto di ritenute e split payment.
 */
export function totaleFatturato(documenti: ReadonlyArray<DocumentoFatturato>): number {
  return documenti.reduce((somma, d) =>
    isTipoVendita(d.tipo) && isDocumentoEmesso(d.stato) ? somma + importoConSegno(d.tipo, importoFatturatoCommessa(d)) : somma, 0);
}
