/**
 * Controparte di un movimento quando la banca non la comunica (18/11/2026).
 *
 * Su Impresa Vulcano il flusso bancario arriva senza nome né IBAN di chi paga o di chi riceve:
 * la colonna «Controparte» era sempre «—». Il nome c'è, ma dentro la causale, in pochi formati
 * ricorrenti delle banche italiane:
 *   «BONIFICO o/c: TORNO SUBITO S.R.L. ABI-CAB: …»            → ordinante di un bonifico in entrata
 *   «DISPOSIZIONE a favore di F.LLI LAZZARO SRL EUR 11.000,00» → beneficiario di un bonifico in uscita
 *   «Bonifico a vs favore *COLOMBO DAVIDE PAGAMENTO FT …»      → ordinante dopo l'asterisco
 *   «Bonifico tramite Internet Banking *IMBERTI LEGNAMI SRL SALDO …»
 *   «ADDEBITO B2B Radius Business Solution N: …»               → creditore di un addebito diretto
 * Solo per mostrarla: il motore della tesoreria legge la causale per conto suo.
 */
export interface MovimentoConCausale {
  description?: string | null;
  transaction_type?: string | null;
  creditor_name?: string | null;
  debtor_name?: string | null;
}

// Dove finisce il nome: la prima parola che apre il resto della causale.
const FINE_NOME =
  /\s+(?:ABI-CAB|EUR\b|FAT-\d|SALDO\b|ACCONTO\b|PAGAMENTO\b|PAG\.|PAGAM\b|FT\b|FT\.|FATT\b|FATT\.|FATTURA\b|FATTURE\b|RIF\b|RIF\.|N\.|N:|NUM\.|ID\.BON|ID:|RST\b|ART\.|CAUSALE\b|DEL\s+\d)|\d{6,}|ID\.BON/i;

function pulisci(nome: string): string | null {
  // …poi via i numeri rimasti in coda («CAVE ROSSETTI SPA 287 FT 1/154»: 287 è un protocollo).
  const n = nome.replace(FINE_NOME, "\u0000").split("\u0000")[0].replace(/(\s+\d+)+\s*$/, "").replace(/[\s,.;:*-]+$/, "").trim();
  if (n.length < 3 || !/[a-zà-ú]{2}/i.test(n)) return null;
  if (/^(INSTANT|IMPRESA VULCANO)/i.test(n)) return null;
  return n;
}

export function controparteDaCausale(causale: string | null | undefined): string | null {
  const c = (causale ?? "").replace(/\s+/g, " ").trim();
  if (!c) return null;
  const regole: RegExp[] = [
    /\bo\/c:\s*(.+?)\s+ABI-CAB/i,
    /\ba favore di\s+(.+?)(?:\s+EUR\b|$)/i,
    /\*(?:INST\s+\d{1,2}:\d{2}\s+)?([^*].*)$/i,
    /^ADDEBITO\s+(?:B2B|SDD|CORE)\s+(.+?)\s+N:/i,
  ];
  for (const r of regole) {
    const m = c.match(r);
    if (m?.[1]) {
      const n = pulisci(m[1]);
      if (n) return n;
    }
  }
  return null;
}

/** Il nome comunicato dalla banca; se manca, quello ricavato dalla causale (con `dedotta`). */
export function controparteMovimento(m: MovimentoConCausale): { nome: string | null; dedotta: boolean } {
  const banca = (m.transaction_type === "credit" ? m.debtor_name : m.creditor_name)?.trim();
  if (banca) return { nome: banca, dedotta: false };
  const nome = controparteDaCausale(m.description);
  return { nome, dedotta: nome != null };
}
