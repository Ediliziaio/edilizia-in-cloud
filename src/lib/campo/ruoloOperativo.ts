/** Dati operativi restituiti dalla commessa; non sono nomine di sicurezza. */
export interface RuoloOperativoCampo {
  capocantiere: boolean;
  esiste_capo: boolean;
  caposquadra: boolean;
}

export function leggiRuoloOperativoCampo(value: unknown): RuoloOperativoCampo {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Ruolo del cantiere non disponibile");
  const r = value as Record<string, unknown>;
  if (
    typeof r.capocantiere !== "boolean" ||
    typeof r.esiste_capo !== "boolean" ||
    (r.caposquadra !== undefined && typeof r.caposquadra !== "boolean")
  )
    throw Error("Ruolo del cantiere incompleto");
  return {
    capocantiere: r.capocantiere,
    esiste_capo: r.esiste_capo,
    caposquadra: r.caposquadra === true,
  };
}
