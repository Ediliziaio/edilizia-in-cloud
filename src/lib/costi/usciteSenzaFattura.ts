/** Un'uscita senza fattura (bollo, tassa, F24 di cantiere): cosa si salva e quanto vale, senza farne una fattura. */
export interface FormUscita {
  descrizione: string; imponibile: string; aliquota: string; data: string; mese: string; riferimento: string;
  fornitoreId: string; commessaId: string; mezzoId: string; pagata: boolean;
}

const numero = (t: string) => {
  const n = Number(t.trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

/** Dice cosa manca, in parole. Null = si può salvare. */
export function erroreUscita(f: FormUscita): string | null {
  if (!f.descrizione.trim()) return "Scrivi di cosa si tratta.";
  const n = numero(f.imponibile);
  if (!f.imponibile.trim() || Number.isNaN(n) || n <= 0) return "Scrivi un importo maggiore di zero.";
  const a = numero(f.aliquota || "0");
  if (Number.isNaN(a) || a < 0 || a > 100) return "L'aliquota va da 0 a 100.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.data)) return "Indica la data.";
  return null;
}

export function rigaUscita(f: FormUscita, companyId: string) {
  return {
    company_id: companyId,
    name: f.descrizione.trim().slice(0, 200),
    amount: numero(f.imponibile),
    vat_rate: numero(f.aliquota || "0"),
    cost_type: "variable",
    recurrence: "once",
    category: "altro",
    senza_fattura: true,
    due_date: f.data,
    documento_data: f.data,
    documento_riferimento: f.riferimento.trim() || null,
    // Il mese di competenza è il primo del mese; se non è scelto, quello della data.
    mese_competenza: `${(f.mese || f.data).slice(0, 7)}-01`,
    supplier_id: f.fornitoreId || null,
    order_id: f.commessaId || null,
    mezzo_id: f.mezzoId || null,
    is_paid: f.pagata,
    paid_date: f.pagata ? f.data : null,
  };
}
