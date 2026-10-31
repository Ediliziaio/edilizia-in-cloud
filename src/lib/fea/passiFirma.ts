/**
 * I passaggi della firma, per dirli a chi firma prima che li incontri (31/10/2026).
 *
 * Un cliente di Dimora ha inserito il codice e si è fermato: dopo il codice c'erano ancora
 * recesso, clausole e «Accetto e firmo», che la pagina non annunciava (diceva «due passaggi,
 * un minuto»), e dopo 15 minuti la sessione è scaduta senza che nessuno lo vedesse.
 */
import type { FEASessionePubblica, FEAClausolaVessatoria } from "@/types/fea";

export type PassoFirma = "codice" | "identificazione" | "recesso" | "clausole" | "firma";

export const ETICHETTA_PASSO: Record<PassoFirma, string> = {
  codice: "Codice",
  identificazione: "Identità",
  recesso: "Diritto di recesso",
  clausole: "Clausole",
  firma: "Accetto e firmo",
};

type SessioneMinima = Pick<FEASessionePubblica,
  "tipo_firmatario" | "identificazione_richiesta" | "dichiarazione_richiesta" | "dichiarazione_fea" | "clausole_1341" | "b2c_clausole">;

/** I passaggi che questa firma chiede, nell'ordine in cui arrivano. */
export function passiFirma(s: Partial<SessioneMinima> | null | undefined): PassoFirma[] {
  const passi: PassoFirma[] = ["codice"];
  if ((s?.identificazione_richiesta || s?.dichiarazione_richiesta) && s?.dichiarazione_fea) passi.push("identificazione");
  if (s?.tipo_firmatario === "b2c") passi.push("recesso");
  const clausole = (s?.clausole_1341 ?? s?.b2c_clausole ?? []) as FEAClausolaVessatoria[];
  if (clausole.length > 0) passi.push("clausole");
  passi.push("firma");
  return passi;
}

/** «codice, clausole e Accetto e firmo»: l'elenco in una frase. */
export function elencoPassi(passi: PassoFirma[]): string {
  const nomi = passi.map((p) => (p === "firma" ? "«Accetto e firmo»" : ETICHETTA_PASSO[p].toLowerCase()));
  return nomi.length <= 1 ? nomi.join("") : `${nomi.slice(0, -1).join(", ")} e ${nomi[nomi.length - 1]}`;
}
