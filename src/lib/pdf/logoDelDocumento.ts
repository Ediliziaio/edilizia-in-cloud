/**
 * Quale logo finisce sul PDF.
 *
 * La catena era scritta tre volte — nel documento (`SerramentoPDF`),
 * nell'anteprima dell'editor e nel riquadro della copertina — e ogni copia
 * aveva il suo ordine. Il 29/10/2026 Renova Solution, che il logo ce l'ha
 * caricato in Impostazioni → Profilo aziendale, vedeva le anteprime **senza
 * logo**: il modello PDF non ne aveva uno suo e l'anteprima non ricadeva
 * sull'azienda. Qui la catena è una sola, e si prova.
 *
 * L'ordine, e il perché:
 *  1. il logo del MODELLO, se c'è: è una scelta esplicita per quel documento;
 *  2. altrimenti il logo dell'AZIENDA: l'ha già caricato una volta, non deve
 *     ricaricarlo dentro ogni modello;
 *  3. altrimenti niente — e il documento mostra il nome, non un buco con una
 *     icona rotta.
 */

export interface SorgentiLogo {
  /** Logo del modello PDF (`sr_template_pdf.logo_url` / `fv_template_pdf.logo_url`). */
  logoModello?: string | null;
  /** Logo dell'azienda (`companies.logo_url`). */
  logoAzienda?: string | null;
}

export interface SorgentiLogoCopertina extends SorgentiLogo {
  /** Logo scelto apposta per la copertina del modello. */
  logoCopertinaModello?: string | null;
  /** Versione chiara del logo, per la copertina su fondo scuro. */
  logoChiaroAzienda?: string | null;
}

const pulito = (v: string | null | undefined): string | null => {
  const s = String(v ?? "").trim();
  return s.length > 0 ? s : null;
};

/** Il logo per l'intestazione delle pagine. */
export function logoDelDocumento(s: SorgentiLogo): string | null {
  return pulito(s.logoModello) ?? pulito(s.logoAzienda);
}

/**
 * Il logo della copertina: prima quello scelto per la copertina, poi la
 * versione chiara dell'azienda (la copertina è su fondo scuro), poi la catena
 * normale.
 */
export function logoDellaCopertina(s: SorgentiLogoCopertina): string | null {
  return (
    pulito(s.logoCopertinaModello) ??
    pulito(s.logoChiaroAzienda) ??
    logoDelDocumento(s)
  );
}
