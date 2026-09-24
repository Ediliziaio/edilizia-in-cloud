/**
 * Le regole di stile che servono a una pagina già disegnata.
 *
 * Il foglio di build (/assets-cb3/index-*.css) è uno solo per sito e app:
 * ~500 KB, di cui una pagina del sito ne usa il 3-9%. Il prerender mette
 * queste regole dentro la pagina e il foglio intero arriva dopo, senza
 * bloccare il primo disegno (scripts/prerender.mjs, src/lib/paginaPreparata.ts).
 *
 * Il lavoro è diviso in due:
 * - il BROWSER decide quali regole servono: per ogni selettore, tolti gli stati
 *   (:hover, :focus…) e gli pseudo-elementi (::before…), guarda se trova
 *   almeno un elemento nella pagina vera;
 * - il TESTO delle regole si copia dal foglio originale. Chrome, se gli si
 *   chiede il CSS già letto, scarta ciò che non usa lui (-webkit-background-clip,
 *   ::-moz-focus-inner…): sugli iPhone meno recenti i testi sfumati sarebbero
 *   rimasti trasparenti.
 * Le @media restano, con dentro solo le regole che servono: la pagina è
 * fotografata a 1280 px, ma il telefono ritrova le sue. @keyframes, @font-face
 * e le altre regole speciali si tengono sempre. Nel dubbio (selettore che il
 * browser non sa valutare) la regola si tiene.
 */
import postcss from "postcss";

// Solo i due punti NON preceduti da "\": in Tailwind «hover\:bg-x» è un nome di classe.
const PSEUDO_ELEMENTI =
  /(?<!\\)::?(?:before|after|placeholder|selection|marker|backdrop|file-selector-button|first-line|first-letter|-(?:webkit|moz|ms)-[\w-]+)(?![\w-])/g;
const STATI =
  /(?<!\\):(?:hover|focus-visible|focus-within|focus|active|visited|checked|disabled|enabled|placeholder-shown|autofill|invalid|valid|user-invalid|user-valid|indeterminate|target|read-only|read-write|required|optional|default|open|popover-open)(?![\w-])/g;
/** At-rule che contengono regole normali: si filtrano dentro, e se restano vuote si tolgono. */
const CONTENITORI = new Set(["media", "supports", "layer", "container"]);

/** Il selettore da cercare nella pagina: senza stati né pseudo-elementi. Vuoto = vale per tutti. */
export function daCercare(parte) {
  return parte.replace(PSEUDO_ELEMENTI, "").replace(STATI, "").trim();
}

/** Le regole con un selettore vero: non quelle dentro @keyframes (0%, to…). */
function perOgniRegola(radice, fn) {
  radice.walkRules((regola) => {
    for (let p = regola.parent; p && p.type === "atrule"; p = p.parent) {
      if (!CONTENITORI.has(p.name)) return;
    }
    fn(regola);
  });
}

/**
 * Legge un foglio una volta sola per tutto il prerender.
 * @param {string} testo il CSS
 * @param {string} indirizzo dove sta il foglio (es. /assets-cb3/index-x.css): i
 *   percorsi relativi dentro url() valgono da lì, non dalla pagina.
 */
export function preparaFoglio(testo, indirizzo) {
  const radice = postcss.parse(testo);
  const cartella = indirizzo.replace(/[^/]*$/, "");
  radice.walkDecls((dichiarazione) => {
    if (!dichiarazione.value.includes("url(")) return;
    dichiarazione.value = dichiarazione.value.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (tutto, q, u) =>
      /^(?:data:|https?:|\/|#)/i.test(u) ? tutto : `url(${q}${new URL(u, `http://x${cartella}`).pathname}${q})`,
    );
  });
  const selettori = new Set();
  perOgniRegola(radice, (regola) => {
    for (const parte of regola.selectors) {
      const s = daCercare(parte);
      if (s) selettori.add(s);
    }
  });
  return { radice, selettori: [...selettori] };
}

/** Gira NEL BROWSER (page.evaluate): per ogni selettore, se trova almeno un elemento. */
export function valutaSelettori(lista) {
  return lista.map((s) => {
    try {
      return document.querySelector(s) !== null;
    } catch {
      return true;
    }
  });
}

/** Il foglio con le sole regole che servono. `servono`: i selettori trovati nella pagina. */
export function cssCritico(foglio, servono) {
  const copia = foglio.radice.clone();
  perOgniRegola(copia, (regola) => {
    const tenere = regola.selectors.some((parte) => {
      const s = daCercare(parte);
      return !s || servono.has(s);
    });
    if (!tenere) regola.remove();
  });
  for (let tolto = true; tolto; ) {
    tolto = false;
    copia.walkAtRules((at) => {
      if (CONTENITORI.has(at.name) && (!at.nodes || at.nodes.length === 0)) {
        at.remove();
        tolto = true;
      }
    });
  }
  return copia.toString();
}
