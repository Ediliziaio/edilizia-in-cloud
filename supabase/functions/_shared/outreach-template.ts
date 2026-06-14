/**
 * outreach-template — motore di personalizzazione PURO (niente Deno/Supabase).
 * Condiviso tra dispatcher/enqueuer (Deno) e UI (Vite). Testato in vitest.
 *
 *  • Variabili:  {{first_name}}  {{first_name|amico}} (fallback se vuoto/assente)
 *  • Spintax:    {Ciao|Salve|Buongiorno}  → scelta deterministica per seed
 *
 * Lo spintax fa variare i messaggi tra destinatari: meno pattern ripetuti =
 * meno spam. Il seed (es. hash dell'email) rende la scelta stabile per contatto.
 */

export interface TemplateVars { [key: string]: string | null | undefined; }

/** Hash stabile di una stringa → intero non negativo (per seedare lo spintax per-contatto). */
export function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const VAR_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\|\s*([^}]*?))?\s*\}\}/g;
const SPINTAX_RE = /\{([^{}]*\|[^{}]*)\}/g;

/** Sostituisce variabili e spintax. Variabili PRIMA (usano `{{ }}`), poi spintax (`{ }`). */
export function renderTemplate(template: string, vars: TemplateVars = {}, opts: { seed?: number } = {}): string {
  if (!template) return "";

  let out = template.replace(VAR_RE, (_m, key: string, fallback?: string) => {
    const v = vars[key];
    const val = v == null ? "" : String(v).trim();
    return val || (fallback ?? "").trim();
  });

  let i = 0;
  out = out.replace(SPINTAX_RE, (_m, group: string) => {
    const options = group.split("|");
    const seed = opts.seed ?? 0;
    return options[(seed + i++) % options.length];
  });

  // ripulisce gli artefatti lasciati da variabili vuote
  return out.replace(/[ \t]{2,}/g, " ").replace(/ +([.,;:!?])/g, "$1").trim();
}

/** Elenco delle variabili presenti in un template (per la UI / validazione). */
export function extractVariables(template: string): string[] {
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(VAR_RE.source, "g");
  while ((m = re.exec(template || "")) !== null) found.add(m[1]);
  return [...found];
}

/** Variabili standard di un contatto marketing. */
export function contactToVars(c: {
  first_name?: string | null; last_name?: string | null;
  company_name?: string | null; email?: string | null; phone?: string | null;
}): TemplateVars {
  return {
    first_name: c.first_name ?? "",
    last_name: c.last_name ?? "",
    company_name: c.company_name ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
  };
}
