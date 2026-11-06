/** Un codice scritto nel campo del nome deve indicare lo stesso colore del selettore. */
export function codiceColore(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) return `#${s.slice(1).split("").map((c) => c + c).join("")}`.toUpperCase();
  return null;
}

export function cambiaNomeColore<T extends object>(sezione: T, nome: string, hex: string, value: string): T {
  const codice = codiceColore(value);
  return { ...sezione, [nome]: value, ...(codice ? { [hex]: codice } : {}) };
}

export function cambiaCodiceColore<T extends object>(sezione: T, nome: string, hex: string, value: string): T {
  const precedente = sezione as Record<string, unknown>;
  const codice = codiceColore(value) ?? value;
  return { ...sezione, [hex]: codice, ...(codiceColore(precedente[hex]) !== codiceColore(codice) ? { [nome]: codiceColore(precedente[nome]) ? codice : undefined } : {}) };
}

/** Anche un vecchio client non può inviare due codici diversi alla stessa superficie. */
export function coloriContraddittori(config: unknown): string[] {
  if (!config || typeof config !== "object") return [];
  const out: string[] = [];
  for (const [nome, raw] of Object.entries(config)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const r = raw as Record<string, unknown>;
    if (r.attivo !== true) continue;
    for (const key of Object.keys(r).filter((k) => k.endsWith("_nome"))) {
      if (nome === "verniciatura" && ((key === "colore_accento_nome" && r.applica_a !== "parete_accento") || (key === "colore_nome" && r.applica_a === "parete_accento"))) continue;
      const nelNome = codiceColore(r[key]), nelSelettore = codiceColore(r[key.slice(0, -5) + "_hex"]);
      if (nelNome && nelSelettore && nelNome !== nelSelettore) { out.push(nome); break; }
    }
  }
  return out;
}

export function validaColoriStanza(config: unknown): void {
  if (coloriContraddittori(config).length) throw new Error("Il nome del colore e il selettore contengono due codici diversi: scegli un solo colore prima di generare il render.");
}
