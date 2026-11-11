/**
 * Certificato di pagamento di un SAL: dal cumulativo dei lavori al netto da fatturare.
 * Tutti gli importi sono cumulativi, tranne il netto. Facoltativo: senza certificato
 * si fattura la differenza dei cumulativi (salNetto.ts).
 */
export interface SalCertificato {
  sal_id?: string;
  lavori_contrattuali: number;
  varianti: number;
  ritenuta_pct: number;
  ritenuta: number;
  recupero_anticipazione: number;
  altre_detrazioni: number;
  altre_detrazioni_nota?: string | null;
  acconti_precedenti: number;
  /**
   * Rinviato al certificato dopo (arrotondamento del netto, dal 10/11/2026). Non è una detrazione:
   * il certificato dopo lo restituisce, perché i suoi acconti sono quanto certificato davvero.
   */
  rinviato?: number;
  netto: number;
}

const arrotonda = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const numero = (n: unknown): number => {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
};

/** PostgREST rende un legame uno a uno come oggetto, ma un elenco vuoto non è un certificato. */
export function certificatoDelSal(valore: unknown): SalCertificato | null {
  const riga = Array.isArray(valore) ? valore[0] : valore;
  return riga && typeof riga === "object" ? (riga as SalCertificato) : null;
}

export const lordoCertificato = (c: Pick<SalCertificato, "lavori_contrattuali" | "varianti">): number =>
  arrotonda(numero(c.lavori_contrattuali) + numero(c.varianti));

/** Quanto resta del lordo dopo le trattenute: gli acconti del certificato dopo sono questo numero. */
export function restanoCertificato(c: Pick<SalCertificato, "lavori_contrattuali" | "varianti" | "ritenuta" | "recupero_anticipazione" | "altre_detrazioni">): number {
  return arrotonda(lordoCertificato(c) - numero(c.ritenuta) - numero(c.recupero_anticipazione) - numero(c.altre_detrazioni));
}

export function nettoCertificato(c: Pick<SalCertificato, "lavori_contrattuali" | "varianti" | "ritenuta" | "recupero_anticipazione" | "altre_detrazioni" | "acconti_precedenti" | "rinviato">): number {
  return arrotonda(restanoCertificato(c) - numero(c.acconti_precedenti) - numero(c.rinviato));
}

/** Quanto un certificato ha certificato davvero, a tutto oggi: gli acconti del certificato dopo. */
export function certificatoATuttoOggi(c: Pick<SalCertificato, "lavori_contrattuali" | "varianti" | "ritenuta" | "recupero_anticipazione" | "altre_detrazioni" | "rinviato">): number {
  return arrotonda(restanoCertificato(c) - numero(c.rinviato));
}

/**
 * Il certificato nuovo parte da quello prima: stessa ritenuta, acconti pari a ciò che era già maturato.
 * Senza un certificato prima, gli acconti sono il cumulativo dei SAL già emessi (giaMaturato):
 * con zero si riproporrebbe in fattura tutto il già fatturato.
 * Con SAL senza certificato fra quello prima e questo (06/11/2026): quei SAL hanno fatturato la differenza
 * dei cumulativi, quindi agli acconti si aggiunge quanto è maturato dopo il certificato (giaMaturato − il suo
 * lordo). Prima si ripartiva dal certificato e quei SAL si fatturavano due volte.
 */
export function certificatoProposto(cumulativo: number, precedente: SalCertificato | null, giaMaturato = 0): SalCertificato {
  const lavori = arrotonda(numero(cumulativo) - numero(precedente?.varianti));
  const pct = precedente ? numero(precedente.ritenuta_pct) : 10;
  const bozza = {
    lavori_contrattuali: lavori,
    varianti: numero(precedente?.varianti),
    ritenuta_pct: pct,
    ritenuta: arrotonda(numero(cumulativo) * pct / 100),
    recupero_anticipazione: numero(precedente?.recupero_anticipazione),
    altre_detrazioni: numero(precedente?.altre_detrazioni),
    altre_detrazioni_nota: precedente?.altre_detrazioni_nota ?? null,
    // Il rinviato del certificato prima torna qui: gli acconti sono quanto certificato davvero.
    acconti_precedenti: precedente
      ? arrotonda(certificatoATuttoOggi(precedente) + Math.max(0, numero(giaMaturato) - lordoCertificato(precedente)))
      : numero(giaMaturato),
    rinviato: 0,
  };
  return { ...bozza, netto: nettoCertificato(bozza) };
}

/** Importo scritto da una persona: «1.234,56», «1234,56», «1.234» (migliaia) e «1234.56». */
export function leggiImportoItaliano(testo: string): number {
  const t = testo.trim();
  if (!t) return NaN;
  if (t.includes(",")) return /^\d{1,3}(\.\d{3})*,\d*$|^\d+,\d*$/.test(t) ? Number(t.replace(/\./g, "").replace(",", ".")) : NaN;
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ""));
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

/**
 * Perché un certificato non si cambia più (06/11/2026): la sua rata è già fatturata o incassata, oppure un
 * certificato dopo parte dai suoi numeri. Cambiarlo vorrebbe dire una fattura che non torna più col certificato.
 */
export function certificatoBloccato(
  sal: { numero_sal: number; installment_id?: string | null },
  tutti: ReadonlyArray<{ numero_sal: number; stato: string; sal_certificati?: unknown }>,
  rate: ReadonlyArray<{ id?: string | null; documento_fiscale_id?: string | null; is_paid?: boolean | null }> = [],
): string | null {
  const rata = sal.installment_id ? rate.find((r) => r.id === sal.installment_id) : undefined;
  if (rata?.documento_fiscale_id) return "La rata di questo SAL è già fatturata: il certificato resta com'è.";
  if (rata?.is_paid) return "La rata di questo SAL è già incassata: il certificato resta com'è.";
  const dopo = tutti.find((s) => s.numero_sal > sal.numero_sal && s.stato !== "bozza" && certificatoDelSal(s.sal_certificati));
  if (dopo) return `Il certificato del SAL n. ${dopo.numero_sal} parte da questo: per cambiarlo, cambia prima quello.`;
  return null;
}

/** Il certificato da cui parte quello nuovo: l'ultimo di un SAL emesso prima di questo. */
export function certificatoPrecedente(
  sal: { numero_sal: number },
  tutti: ReadonlyArray<{ numero_sal: number; stato: string; sal_certificati?: unknown }>,
): SalCertificato | null {
  const prima = tutti
    .filter((s) => s.numero_sal < sal.numero_sal && s.stato !== "bozza" && certificatoDelSal(s.sal_certificati))
    .sort((x, y) => y.numero_sal - x.numero_sal)[0];
  return prima ? certificatoDelSal(prima.sal_certificati) : null;
}
