import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/**
 * Auto-linking interno negli articoli del blog.
 *
 * SEO: i 60+ articoli citano continuamente funzionalità del prodotto e temi
 * coperti da altre guide (DURC, SAL, preventivi, fatturazione…) senza mai
 * linkarli — zero internal linking dal corpo, che è il segnale più forte per
 * distribuire autorità verso le landing /funzionalita/* e tra le guide stesse.
 *
 * Regole:
 *  - si linka solo la PRIMA occorrenza per pagina di ogni destinazione;
 *  - mai link alla pagina corrente (self-link);
 *  - cap complessivo per articolo (default 8) per evitare over-linking;
 *  - le frasi sono verificate contro il vocabolario reale degli articoli.
 */

type InternalTarget = {
  /** Sorgente regex della frase (senza flag, non-capturing all'interno). */
  pattern: string;
  href: string;
  title: string;
};

// Ordine: frasi più lunghe/specifiche prima (l'alternation è greedy sull'ordine).
const INTERNAL_TARGETS: InternalTarget[] = [
  {
    pattern: "fatturazione elettronica",
    href: "/funzionalita/fatturazione-elettronica/",
    title: "Fatturazione elettronica SDI per imprese edili",
  },
  {
    pattern: "stato avanzamento lavori",
    href: "/funzionalita/gestione-cantieri/",
    title: "Gestione cantieri e SAL — Edilizia in Cloud",
  },
  {
    pattern: "giornale dei lavori",
    href: "/funzionalita/giornale-lavori/",
    title: "Giornale dei lavori digitale",
  },
  {
    pattern: "ritenut[ae] di garanzia",
    href: "/funzionalita/ritenute-garanzia/",
    title: "Gestione ritenute di garanzia",
  },
  {
    pattern: "timbratura digitale|rilevazione (?:delle )?presenze|presenze digital[ei]",
    href: "/funzionalita/timbrature-gps/",
    title: "Timbrature GPS da smartphone per il cantiere",
  },
  {
    pattern: "preventiv[oi] (?:edil[ei]|professional[ei]|digital[ei])",
    href: "/funzionalita/preventivi-edilizia/",
    title: "Preventivi edilizia professionali",
  },
  {
    pattern: "margin[ei] di commessa|margine (?:reale|di cantiere)",
    href: "/funzionalita/margini-cantiere/",
    title: "Margini di cantiere in tempo reale",
  },
  {
    pattern: "flussi di cassa|cash flow",
    href: "/funzionalita/tesoreria/",
    title: "Tesoreria e previsione di cassa",
  },
  {
    pattern: "gestione (?:dei )?subappaltatori",
    href: "/funzionalita/gestione-subappalti/",
    title: "Gestione subappalti e documenti",
  },
  {
    pattern: "prima nota",
    href: "/funzionalita/prima-nota/",
    title: "Prima nota di cantiere",
  },
  {
    pattern: "CRM",
    href: "/funzionalita/crm-edilizia/",
    title: "CRM per imprese edili",
  },
  {
    pattern: "DDT",
    href: "/funzionalita/ddt-digitali/",
    title: "DDT digitali collegati al cantiere",
  },
  {
    pattern: "gestionale (?:edile|di cantiere)|software gestionale per l'edilizia",
    href: "/funzionalita/gestione-cantieri/",
    title: "Il gestionale per il cantiere",
  },
  // ── Cross-link tra guide (hub tematici) ────────────────────────────────────
  {
    pattern: "DURC di congruit[àa]",
    href: "/blog/durc-congruita-manodopera-soglie/",
    title: "DURC di congruità: soglie di manodopera",
  },
  {
    pattern: "DURC",
    href: "/blog/durc-edilizia-guida-completa/",
    title: "Guida completa al DURC",
  },
  {
    pattern: "patente a crediti",
    href: "/blog/patente-a-crediti-edilizia-guida/",
    title: "Patente a crediti in edilizia: la guida",
  },
  {
    pattern: "(?:attestazione|certificazione) SOA",
    href: "/blog/attestazione-soa-imprese-edili/",
    title: "Attestazione SOA: guida per imprese edili",
  },
  {
    pattern: "CCNL Edilizia",
    href: "/blog/ccnl-edilizia-guida/",
    title: "CCNL Edilizia: livelli e costi reali",
  },
  {
    pattern: "Cassa Edile",
    href: "/blog/cassa-edile-come-funziona/",
    title: "Cassa Edile: come funziona",
  },
  {
    pattern: "computo metrico(?: estimativo)?",
    href: "/blog/computo-metrico-estimativo-guida/",
    title: "Computo metrico estimativo: la guida",
  },
  {
    pattern: "appalti pubblici",
    href: "/blog/appalti-pubblici-edilizia-guida/",
    title: "Appalti pubblici in edilizia: come partecipare",
  },
];

// Alternation unica con un solo gruppo di cattura esterno (pattern split()).
const INTERNAL_RE = new RegExp(
  `(\\b(?:${INTERNAL_TARGETS.map((t) => t.pattern).join("|")})\\b)`,
  "gi",
);

const MATCHERS = INTERNAL_TARGETS.map((t) => ({
  ...t,
  re: new RegExp(`^(?:${t.pattern})$`, "i"),
}));

export interface InternalLinkContext {
  /** Destinazioni già linkate in questa pagina (dedup per href). */
  seen: Set<string>;
  /** Path corrente (con trailing slash) per evitare self-link. */
  currentPath: string;
  /** Cap complessivo di link interni per articolo. */
  max?: number;
}

/**
 * Trasforma la prima occorrenza di ogni frase nota in un link interno.
 * Le parti di testo non linkate passano per `fallback` (es. linkifyNormative),
 * così i due meccanismi si compongono senza interferire.
 */
export function linkifyInternal(
  text: string | undefined,
  ctx: InternalLinkContext,
  fallback: (part: string) => ReactNode,
): ReactNode {
  if (!text) return text;
  INTERNAL_RE.lastIndex = 0;
  if (!INTERNAL_RE.test(text)) return fallback(text);
  const max = ctx.max ?? 8;
  const parts = text.split(INTERNAL_RE);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      const target = MATCHERS.find((m) => m.re.test(part));
      if (
        target &&
        !ctx.seen.has(target.href) &&
        target.href !== ctx.currentPath &&
        ctx.seen.size < max
      ) {
        ctx.seen.add(target.href);
        return (
          <Link
            key={i}
            to={target.href}
            title={target.title}
            className="text-[#F97415] font-medium underline decoration-[#F97415]/40 underline-offset-2 hover:decoration-[#F97415]"
          >
            {part}
          </Link>
        );
      }
      return fallback(part);
    }
    return fallback(part);
  });
}
