import type { ReactNode } from "react";

/**
 * Auto-linking dei riferimenti normativi negli articoli del blog.
 *
 * E-E-A-T/AEO: gli articoli citano 80+ norme (D.Lgs 81/2008, Codice Contratti…)
 * senza mai linkare la fonte ufficiale — Google e i motori AI non possono
 * verificare la citazione. Questo modulo trasforma la PRIMA occorrenza di ogni
 * norma nota in un link a Normattiva (testo vigente, URN stabile).
 *
 * Regola di sicurezza: si linka SOLO ciò che è in tabella con estremi certi
 * (data GU per l'URN) — un link alla norma sbagliata è peggio di nessun link.
 */

type NormRef = { url: string; title: string };

const norm = (urn: string, title: string): NormRef => ({
  url: `https://www.normattiva.it/uri-res/N2Ls?${urn}!vig=`,
  title,
});

// Chiave: `${tipo}:${numero}/${anno}` (tipo ∈ dlgs | dl | dpr | legge)
const FONTI_NORMATIVE: Record<string, NormRef> = {
  "dlgs:81/2008": norm(
    "urn:nir:stato:decreto.legislativo:2008-04-09;81",
    "Testo Unico Sicurezza sul Lavoro — D.Lgs 81/2008 (Normattiva)",
  ),
  "dlgs:36/2023": norm(
    "urn:nir:stato:decreto.legislativo:2023-03-31;36",
    "Codice dei Contratti Pubblici — D.Lgs 36/2023 (Normattiva)",
  ),
  "dlgs:50/2016": norm(
    "urn:nir:stato:decreto.legislativo:2016-04-18;50",
    "Codice Appalti previgente — D.Lgs 50/2016 (Normattiva)",
  ),
  "dlgs:231/2002": norm(
    "urn:nir:stato:decreto.legislativo:2002-10-09;231",
    "Ritardi di pagamento nelle transazioni commerciali — D.Lgs 231/2002 (Normattiva)",
  ),
  "dlgs:231/2001": norm(
    "urn:nir:stato:decreto.legislativo:2001-06-08;231",
    "Responsabilità amministrativa degli enti — D.Lgs 231/2001 (Normattiva)",
  ),
  "dlgs:276/2003": norm(
    "urn:nir:stato:decreto.legislativo:2003-09-10;276",
    "Riforma del mercato del lavoro (Legge Biagi) — D.Lgs 276/2003 (Normattiva)",
  ),
  "dlgs:42/2004": norm(
    "urn:nir:stato:decreto.legislativo:2004-01-22;42",
    "Codice dei beni culturali e del paesaggio — D.Lgs 42/2004 (Normattiva)",
  ),
  "dlgs:82/2005": norm(
    "urn:nir:stato:decreto.legislativo:2005-03-07;82",
    "Codice dell'Amministrazione Digitale — D.Lgs 82/2005 (Normattiva)",
  ),
  "dl:19/2024": norm(
    "urn:nir:stato:decreto.legge:2024-03-02;19",
    "D.L. 19/2024 (PNRR) — patente a crediti nei cantieri (Normattiva)",
  ),
  "dpr:380/2001": norm(
    "urn:nir:stato:decreto.del.presidente.della.repubblica:2001-06-06;380",
    "Testo Unico dell'Edilizia — DPR 380/2001 (Normattiva)",
  ),
  "legge:136/2010": norm(
    "urn:nir:stato:legge:2010-08-13;136",
    "Tracciabilità dei flussi finanziari — Legge 136/2010 (Normattiva)",
  ),
};

// Un solo gruppo di cattura esterno: String.split() così restituisce anche i
// delimitatori. Copre le grafie reali usate negli articoli: "D.Lgs 81/2008",
// "D.Lgs. 36/2023", "D.L. 19/2024", "DPR 380/2001", "Legge 136/2010".
const NORM_RE =
  /(D\.\s?Lgs\.?\s?(?:n\.\s?)?\d+\/\d{4}|D\.L\.\s?(?:n\.\s?)?\d+\/\d{4}|D\.P\.R\.?\s?(?:n\.\s?)?\d+\/\d{4}|DPR\s?(?:n\.\s?)?\d+\/\d{4}|Legge\s(?:n\.\s?)?\d+\/\d{4})/;

function normKey(ref: string): string | null {
  const numMatch = ref.match(/(\d+)\/(\d{4})/);
  if (!numMatch) return null;
  const numYear = `${numMatch[1]}/${numMatch[2]}`;
  const lower = ref.toLowerCase().replace(/\s+/g, "");
  // Ordine: "d.lgs" prima di "d.l." (il secondo è prefisso del primo).
  if (lower.startsWith("d.lgs")) return `dlgs:${numYear}`;
  if (lower.startsWith("d.l.")) return `dl:${numYear}`;
  if (lower.startsWith("dpr") || lower.startsWith("d.p.r")) return `dpr:${numYear}`;
  if (lower.startsWith("legge")) return `legge:${numYear}`;
  return null;
}

/**
 * Sostituisce la prima occorrenza per pagina di ogni norma nota con un link
 * alla fonte ufficiale. `seen` va creato una volta per render della pagina
 * (dedup a livello articolo: la stessa legge citata 5 volte = 1 solo link).
 */
export function linkifyNormative(text: string | undefined, seen: Set<string>): ReactNode {
  if (!text || !NORM_RE.test(text)) return text;
  const parts = text.split(new RegExp(NORM_RE, "g"));
  return parts.map((part, i) => {
    // Gli indici dispari sono i delimitatori catturati (i riferimenti).
    if (i % 2 === 1) {
      const key = normKey(part);
      const fonte = key ? FONTI_NORMATIVE[key] : undefined;
      if (key && fonte && !seen.has(key)) {
        seen.add(key);
        return (
          <a
            key={i}
            href={fonte.url}
            target="_blank"
            rel="noopener noreferrer"
            title={fonte.title}
            className="text-[#F97415] font-medium underline decoration-[#F97415]/40 underline-offset-2 hover:decoration-[#F97415]"
          >
            {part}
          </a>
        );
      }
    }
    return part;
  });
}
