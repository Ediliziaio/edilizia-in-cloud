/** Preventivo cointestato: i campi del secondo intestatario sul progetto. */
export type CampoCointestatario =
  | "cointestatario_nome" | "cointestatario_cognome" | "cointestatario_codice_fiscale"
  | "cointestatario_email" | "cointestatario_telefono";

/** «Anna Bianchi», o null se il preventivo non è cointestato. */
export function nomeCointestatario(p: Partial<Record<CampoCointestatario, string | null>> | null | undefined): string | null {
  const nome = [p?.cointestatario_nome, p?.cointestatario_cognome].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
  return nome || null;
}
