/**
 * I tipi di documento che valgono come nota di credito ricevuta: FatturaPA
 * TD04 (nota di credito) e TD08 (nota di credito semplificata), e le note
 * importate con il tipo interno «passive_credit_note». Un solo elenco, usato
 * da tutti i conti sui fornitori.
 */
export const NOTE_DI_CREDITO: ReadonlySet<string> = new Set(["TD04", "TD08", "passive_credit_note"]);

/** Vero se il tipo di documento è una nota di credito. */
export function eNotaDiCredito(tipo: string | null | undefined): boolean {
  return !!tipo && NOTE_DI_CREDITO.has(tipo.trim());
}

/**
 * Autofatture e integrazioni (reverse charge, acquisti dall'estero): le scrive l'azienda stessa per
 * il registro IVA, e l'IVA non va a nessun fornitore. Non si «pagano». Stesso elenco di
 * e_autofattura_ricevuta nel database.
 */
const AUTOFATTURE: ReadonlySet<string> = new Set(["TD16", "TD17", "TD18", "TD19", "TD20", "TD21", "TD27", "TD28", "self_invoice"]);

export function eAutofattura(tipo: string | null | undefined): boolean {
  return !!tipo && AUTOFATTURE.has(tipo.trim());
}

/** Un documento che non è un debito verso un fornitore: niente «da pagare», niente «pagata». */
export function nonSiPaga(tipo: string | null | undefined): boolean {
  return eNotaDiCredito(tipo) || eAutofattura(tipo);
}

/** Una fattura a rate con una parte già pagata, in parole. */
export function testoRatePagate(pagate: number, totali: number): string {
  return pagate === 1 ? `Pagata 1 rata su ${totali}` : `Pagate ${pagate} rate su ${totali}`;
}

/**
 * Quanto hanno fatturato i fornitori: le note di credito tolgono, qualunque segno abbia il file (lo
 * SDI ammette sia positivo sia negativo), e di un'autofattura conta l'imponibile, perché la sua IVA
 * si compensa da sola e nessuno la incassa.
 */
/**
 * Imponibile e IVA del totale che si legge sopra l'elenco, con gli stessi segni di
 * `importoFornitori`: una nota di credito toglie, un'autofattura non ha IVA da pagare al fornitore.
 */
export function imponibileIvaFornitori(
  fatture: ReadonlyArray<{ tipo_documento?: string | null; totale_documento?: number | null; imponibile_totale?: number | null; iva_totale?: number | null }>,
): { imponibile: number; iva: number } {
  const centesimi = (n: number) => Math.round(n * 100) / 100;
  let imponibile = 0;
  let iva = 0;
  for (const f of fatture) {
    const imp = f.imponibile_totale ?? 0;
    // Senza imponibile scritto (certe importate) l'IVA si ricava dal totale, non si inventa.
    const i = f.iva_totale ?? (f.imponibile_totale != null && f.totale_documento != null ? f.totale_documento - f.imponibile_totale : 0);
    if (eNotaDiCredito(f.tipo_documento)) {
      imponibile -= Math.abs(imp);
      iva -= Math.abs(i);
    } else if (eAutofattura(f.tipo_documento)) {
      // L'IVA dell'autofattura si versa con la liquidazione, non al fornitore.
      imponibile += imp;
    } else {
      imponibile += imp;
      iva += i;
    }
  }
  return { imponibile: centesimi(imponibile), iva: centesimi(iva) };
}

export function importoFornitori(
  fatture: ReadonlyArray<{ tipo_documento?: string | null; totale_documento?: number | null; imponibile_totale?: number | null }>,
): number {
  const somma = fatture.reduce((s, f) => {
    if (eNotaDiCredito(f.tipo_documento)) return s - Math.abs(f.totale_documento ?? 0);
    if (eAutofattura(f.tipo_documento)) return s + (f.imponibile_totale ?? f.totale_documento ?? 0);
    return s + (f.totale_documento ?? 0);
  }, 0);
  return Math.round(somma * 100) / 100;
}
