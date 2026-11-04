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
