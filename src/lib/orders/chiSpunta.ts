// src/lib/orders/chiSpunta.ts
/** Chi può spuntare le sottofasi dal cantiere (regola dell'azienda, applicata dal database). Modulo puro. */
export type ChiSpunta = "tutti" | "chi_la_fa" | "capi";

export const CHI_SPUNTA: ReadonlyArray<{ valore: ChiSpunta; etichetta: string; spiegazione: string }> = [
  { valore: "tutti", etichetta: "Chiunque lavori sulla commessa", spiegazione: "Come oggi: chi è assegnato al cantiere può spuntare le sottofasi dall'app." },
  { valore: "chi_la_fa", etichetta: "Chi fa quella fase, o il capocantiere", spiegazione: "Le spunta chi è assegnato a quella fase (la persona, la ditta o la squadra) e il capocantiere." },
  { valore: "capi", etichetta: "Solo il capocantiere", spiegazione: "Gli altri vedono le sottofasi ma non le spuntano. Se la commessa non ha un capocantiere, le spunta chiunque ci lavori." },
];

export function chiSpuntaValido(v: unknown): ChiSpunta {
  return v === "chi_la_fa" || v === "capi" ? v : "tutti";
}

/**
 * Stessa regola del database (sottofase_guardia): dice se dal cantiere si può spuntare.
 * Il capocantiere sempre; senza capocantiere sulla commessa, chiunque ci lavori;
 * con «chi_la_fa» anche chi è assegnato a quella fase.
 */
export function puoSpuntareInCantiere(
  regola: ChiSpunta,
  ruolo: { capocantiere?: boolean; esiste_capo?: boolean } | null | undefined,
  faseMia: boolean,
): boolean {
  if (regola === "tutti") return true;
  if (ruolo?.capocantiere || !ruolo?.esiste_capo) return true;
  return regola === "chi_la_fa" && faseMia;
}
