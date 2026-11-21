const NUMERO = /(?:d\.?\s?d\.?\s?t\.?|documento\s+di\s+trasporto|bolla(?:\s+di\s+consegna)?|doc(?:umento)?\.?)\s*(?:di\s+vendita\s+)?(?:n(?:r|um(?:ero)?)?\s*[.°º:]*\s*|numero\s*:?\s*)([A-Za-z0-9][A-Za-z0-9/._-]{0,24})/i;
const PAGINA = /\bpag(?:ina|\.)?\s*(\d{1,3})\s*(?:di|\/|of)\s*(\d{1,3})\b/i;
const INTESTAZIONE_DDT = /\b(?:d\.?\s?d\.?\s?t\.?|documento\s+di\s+trasporto|bolla)(?:\s|[.:])/i;
const normalizzaNumero = (numero: string) => numero.replace(/[./_-]+$/, "").toUpperCase();

export function numeroBollaDaTesto(testo: string): string | null {
  const m = testo.replace(/\s+/g, " ").match(NUMERO);
  return m ? normalizzaNumero(m[1]) : null;
}

export function paginaDiTotale(testo: string): { pagina: number; totale: number } | null {
  const m = testo.match(PAGINA);
  if (!m) return null;
  const pagina = Number(m[1]);
  const totale = Number(m[2]);
  return pagina >= 1 && totale >= pagina ? { pagina, totale } : null;
}

/** Ogni pagina contribuisce una volta sola. Una parte incerta richiede la verifica del PDF intero. */
export function gruppiDdtVerificabili(testi: readonly string[]): number[][] | null {
  const gruppi: number[][] = [];
  const numeriVisti = new Set<string>();
  let corrente: { numero: string; indici: number[]; totale?: number } | undefined;
  for (const [i, testo] of testi.entries()) {
    const numeri = new Set([...testo.replace(/\s+/g, " ").matchAll(new RegExp(NUMERO, "gi"))].map(m => normalizzaNumero(m[1])));
    if (numeri.size > 1) return null;
    const numero = INTESTAZIONE_DDT.test(testo) ? [...numeri][0] : undefined;
    const info = paginaDiTotale(testo);
    if (numero && corrente?.numero !== numero) {
      if ((corrente?.totale && corrente.indici.length !== corrente.totale) ||
        numeriVisti.has(numero) || (info && info.pagina !== 1)) return null;
      numeriVisti.add(numero);
      corrente = { numero, indici: [], totale: info?.totale };
      gruppi.push(corrente.indici);
    } else if (numero && !info) {
      // Due intestazioni con lo stesso numero possono appartenere a fornitori diversi.
      return null;
    }
    if (!corrente || (!numero && (!info || info.totale !== corrente.totale)) ||
      (info && (info.pagina !== corrente.indici.length + 1 || (corrente.totale && corrente.totale !== info.totale)))) return null;
    if (info) corrente.totale = info.totale;
    corrente.indici.push(i);
    if (corrente.totale && corrente.indici.length > corrente.totale) return null;
  }
  return corrente?.totale && corrente.indici.length !== corrente.totale ? null : gruppi;
}
