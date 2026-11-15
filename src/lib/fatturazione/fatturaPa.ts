/**
 * Due regole della fattura alla Pubblica Amministrazione che valgono in ogni
 * punto in cui una fattura nasce (editor, «Crea fattura» dalla commessa).
 */
import type { ClienteSnapshot } from "@/types/fatturazione";
import type { ProfiloFattura } from "./clausoleFattura";

/**
 * Split payment proposto per una fattura PA nuova: sì, a meno che l'azienda
 * l'abbia spento nelle Impostazioni o il cliente sia un ente che non lo applica
 * (`split_payment: false` in anagrafica). È solo il valore di partenza: sulla
 * fattura si cambia, e l'XML segue la fattura (non «ogni PA»).
 */
export function splitPredefinito(
  azienda: { split_payment_pa?: boolean | null } | null | undefined,
  cliente: { split_payment?: boolean | null } | null | undefined,
): boolean {
  if (azienda?.split_payment_pa === false) return false;
  return cliente?.split_payment !== false;
}

/**
 * Il tipo cliente che va sulla fattura secondo il profilo scelto in «Crea
 * fattura». Fino al 15/11/2026 valeva solo l'anagrafica: chi sceglieva «Ente
 * pubblico» per un cliente segnato B2B otteneva una fattura FPR12 (tra privati),
 * che lo SDI non consegna all'ufficio dell'ente. La scelta fatta lì vale.
 */
export function tipoClienteDaProfilo(
  profilo: ProfiloFattura,
  daAnagrafica: ClienteSnapshot["tipo_cliente"] | string | null | undefined,
): ClienteSnapshot["tipo_cliente"] {
  if (profilo === "pa") return "PA";
  const tipo = (["B2B", "B2C", "PA", "Estero"].includes(String(daAnagrafica)) ? daAnagrafica : null) as ClienteSnapshot["tipo_cliente"] | null;
  // Profilo non PA per un ente in anagrafica: non è più una fattura PA.
  if (tipo === "PA") return profilo === "impresa" ? "B2B" : "B2C";
  return tipo ?? (profilo === "impresa" ? "B2B" : "B2C");
}

/** Il CIG ha 10 caratteri (lo schema ne ammette 15, ma un CIG così non esiste). */
export const LUNGHEZZA_CIG = 10;
