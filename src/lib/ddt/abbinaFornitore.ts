// ============================================================================
// Chi ha mandato questa bolla: dal nome letto sulla carta al fornitore in rubrica
// ----------------------------------------------------------------------------
// L'AI legge il mittente con ragione sociale, partita IVA e codice fiscale. Se
// nessuno li confronta con l'anagrafica, chi carica la bolla deve ritrovare il
// fornitore a mano in una tendina di centinaia di nomi — e spesso non lo fa.
//
// L'ordine dei tentativi non è casuale: la partita IVA è l'unico dato che non
// si scrive in due modi. Il nome è l'ultima spiaggia, e solo quando è l'UNICO
// che somiglia: due «Edil Rossi» diversi non si tirano a sorte, si chiedono.
// ============================================================================

export interface FornitoreInRubrica {
  id: string;
  name: string | null;
  vat_number?: string | null;
  fiscal_code?: string | null;
}

export interface AbbinamentoFornitore {
  id: string;
  /** Su che cosa ha corrisposto: va detto a chi controlla, non nascosto. */
  motivo: "partita IVA" | "codice fiscale" | "ragione sociale";
}

/** Solo lettere e cifre, maiuscole, senza il prefisso di stato. */
export function normalizzaPiva(v: string | null | undefined): string | null {
  const s = String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!s) return null;
  const senzaPrefisso = /^[A-Z]{2}\d/.test(s) ? s.slice(2) : s;
  // Meno di 8 caratteri non è una partita IVA: è un pezzo di numero letto male,
  // e abbinare su quello accoppierebbe fornitori diversi.
  return senzaPrefisso.length >= 8 ? senzaPrefisso : null;
}

/** Il nome ridotto all'osso: niente forme sociali, punteggiatura, doppi spazi. */
export function normalizzaNome(v: string | null | undefined): string {
  return String(v ?? "")
    .toLowerCase()
    .replace(/[.,'"()]/g, " ")
    .replace(/\b(s\s*r\s*l|s\s*p\s*a|s\s*n\s*c|s\s*a\s*s|societa|soc|snc|sas|srls|spa|srl)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Il fornitore in rubrica che corrisponde al mittente letto sulla bolla, o NULL
 * quando non c'è certezza: meglio una tendina da riempire che un fornitore
 * sbagliato attaccato a una bolla.
 */
export function abbinaFornitore(
  letto: { fornitoreNome?: string | null; fornitorePiva?: string | null; fornitoreCodiceFiscale?: string | null },
  rubrica: FornitoreInRubrica[],
): AbbinamentoFornitore | null {
  const piva = normalizzaPiva(letto.fornitorePiva);
  if (piva) {
    const perPiva = rubrica.filter((f) => normalizzaPiva(f.vat_number) === piva);
    if (perPiva.length === 1) return { id: perPiva[0].id, motivo: "partita IVA" };
  }

  const cf = String(letto.fornitoreCodiceFiscale ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cf.length >= 11) {
    const perCf = rubrica.filter(
      (f) => String(f.fiscal_code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "") === cf,
    );
    if (perCf.length === 1) return { id: perCf[0].id, motivo: "codice fiscale" };
  }

  const nome = normalizzaNome(letto.fornitoreNome);
  if (nome.length >= 3) {
    const perNome = rubrica.filter((f) => normalizzaNome(f.name) === nome);
    if (perNome.length === 1) return { id: perNome[0].id, motivo: "ragione sociale" };
  }

  return null;
}
