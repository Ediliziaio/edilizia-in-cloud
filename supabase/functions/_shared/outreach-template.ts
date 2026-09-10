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

/**
 * htmlToPlainText — deriva una versione text/plain LEGGIBILE da un corpo HTML,
 * pensata per il part `text/plain` del multipart cold (deliverability).
 *
 * A differenza di un semplice strip-tag, QUI i link vengono mantenuti come URL:
 *   <a href="https://x/y">Disiscriviti</a>  →  "Disiscriviti (https://x/y)"
 * Se il testo dell'anchor È già l'URL (o l'anchor è vuoto) si tiene il solo URL,
 * senza duplicare. Questo è importante per il cold: una text-part senza i link
 * (es. disiscrizione, pixel a parte) sembra spam/troncata ai filtri.
 *
 * Pura e deterministica (niente DOM): regex best-effort, output "decent enough",
 * non RFC-perfect. <br>/</p> → newline, entità comuni decodificate, whitespace
 * collassato. Robusta su input vuoto/non-stringa.
 */
export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return "";
  let out = String(html)
    // blocchi non testuali: via del tutto (incl. contenuto)
    .replace(/<(script|style|head|title)[\s\S]*?<\/\1>/gi, "")
    // commenti HTML
    .replace(/<!--[\s\S]*?-->/g, "");

  // anchor → "testo (url)" mantenendo l'URL. Se il testo coincide con l'URL
  // (o è vuoto) si tiene solo l'URL per non duplicare.
  out = out.replace(
    /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi,
    (_m, dq, sq, uq, inner) => {
      const url = (dq ?? sq ?? uq ?? "").trim();
      const label = String(inner).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (!url) return label;
      // ignora ancore/azioni non navigabili nel plain (mailto/tel restano utili)
      if (/^(#|javascript:)/i.test(url)) return label;
      if (!label || label === url) return url;
      return `${label} (${url})`;
    },
  );

  return out
    // a-capo strutturali
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    // strippa i tag rimanenti
    .replace(/<[^>]+>/g, "")
    // decodifica entità comuni (numeriche + nominali)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;|&#x0*27;/gi, "'")
    .replace(/&#0*160;/gi, " ")
    // pulizia spazi
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Variabili standard di un contatto marketing. */
/** Parole che smascherano una ragione sociale travestita da nome di persona. */
const FORME_SOCIETARIE =
  /(\bs\.?\s?r\.?\s?l\b|\bs\.?\s?p\.?\s?a\b|\bs\.?\s?n\.?\s?c\b|\bs\.?\s?a\.?\s?s\b|\bsocieta|\bsocietà|\bimpresa\b|\bditta\b|\bcostruzion|\bedil|\bserrament|\binfiss|\bfalegnam|\bofficin|\bgroup\b|\b& ?c\b)/i;

/** Caselle di posta usate come nome: «Buongiorno Info» brucia il contatto. */
const NOMI_DI_CASELLA =
  /^(info|amministrazione|commerciale|ufficio|contatti|contatto|direzione|segreteria|preventivi|acquisti|vendite|staff|mail|posta|admin|sales|office|noreply|no-reply)$/i;

/**
 * Il nome da usare nel saluto — vuoto quando NON è il nome di una persona.
 *
 * Nelle liste comprate il campo `first_name` contiene quasi sempre la ragione
 * sociale: su 7.821 contatti dell'outreach ThermoDMR, 7.268 avevano nome uguale
 * alla ragione sociale. Con `{{first_name}}` nel saluto sarebbe partito
 * «Buongiorno OFFICINE TABARELLI S.R.L.,» al 93% della lista — e un saluto così
 * dice al destinatario, in tre parole, che è un invio automatico.
 *
 * Chi resta senza nome riceve «Buongiorno,»: il motore toglie da solo la virgola
 * orfana e lo spazio doppio (vedi la ripulitura in renderTemplate).
 */
export function nomeSaluto(c: { first_name?: string | null; company_name?: string | null }): string {
  const n = (c.first_name ?? "").trim();
  if (n.length < 2 || n.length > 20) return "";
  if (/[0-9@._\-\/&]/.test(n)) return "";                       // codici, email, sigle
  if (NOMI_DI_CASELLA.test(n)) return "";
  if (FORME_SOCIETARIE.test(n)) return "";
  if (n === n.toUpperCase() && n.length > 3) return "";          // TUTTO MAIUSCOLO = insegna
  const azienda = (c.company_name ?? "").trim().toLowerCase();
  if (azienda && n.toLowerCase() === azienda) return "";
  if (n.split(/\s+/).length > 2) return "";                      // «Marangoni Scale Di Sergio»
  return n;
}

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
    // Da usare nei saluti al posto di first_name: vedi nomeSaluto().
    nome: nomeSaluto(c),
  };
}
