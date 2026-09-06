import { useEffect, useRef } from "react";

export interface SEOOptions {
  title: string;
  description: string;
  canonical?: string;
  ogImage?: string;
  noindex?: boolean;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
  keywords?: string;
  section?: string;   // article section
  tags?: string[];    // article tags
}

const DEFAULT_TITLE = "Edilizia in Cloud — Software Gestionale per Imprese Edili";
const DEFAULT_DESC  = "Il software gestionale n°1 per imprese edili italiane. Gestisci cantieri, margini, HR, marketing e fatturazione in un'unica piattaforma. Prova gratuita 31 giorni.";
export const SITE_URL = "https://www.ediliziaincloud.com";

// Immagini di anteprima (og:image) per sezione del sito. Fino al 06/09/2026
// tutte le pagine tranne i post del blog condividevano og-default.png, che era
// la copia dell'anteprima della landing AI (titolo tagliato, logo mancante).
// Ora ogni sezione ha la sua; i file sono generati a 1200×630 e vivono in
// public/og/. Chi passa `ogImage` esplicito vince; il vecchio og-default.png
// viene trattato come "non specificato", così le ~30 pagine funzionalità che
// lo dichiaravano a mano ricevono l'immagine della loro sezione senza toccarle.
const OG = {
  default: `${SITE_URL}/og/eic-default.png`,
  funzionalita: `${SITE_URL}/og/eic-funzionalita.png`,
  render: `${SITE_URL}/og/eic-render.png`,
  prezzi: `${SITE_URL}/og/eic-prezzi.png`,
  perTipo: `${SITE_URL}/og/eic-per-tipo.png`,
  confronto: `${SITE_URL}/og/eic-confronto.png`,
  citta: `${SITE_URL}/og/eic-citta.png`,
  blog: `${SITE_URL}/og/eic-blog.png`,
  demo: `${SITE_URL}/og/eic-demo.png`,
  ai: `${SITE_URL}/og/landing-ai-imprenditore-edile.png`,
} as const;
const LEGACY_DEFAULT_IMAGE = `${SITE_URL}/og/og-default.png`;

/** L'anteprima social giusta per un percorso del sito (stessa mappa in functions/_middleware.js). */
export function ogImageForPath(pathname: string): string {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p.startsWith("/funzionalita/render-")) return OG.render;
  if (p === "/funzionalita" || p.startsWith("/funzionalita/")) return OG.funzionalita;
  if (p === "/prezzi") return OG.prezzi;
  if (p.startsWith("/per/")) return OG.perTipo;
  if (p === "/confronto" || p.startsWith("/confronto/")) return OG.confronto;
  if (/^\/software-gestionale-edilizia(-[a-z-]+)?$/.test(p)) return OG.citta;
  if (p === "/blog" || p.startsWith("/blog/")) return OG.blog;
  if (p === "/demo" || p === "/pianifica-migrazione") return OG.demo;
  if (p === "/ai-edilizia" || p.startsWith("/landing/ai-")) return OG.ai;
  return OG.default;
}

// Elemento Wikidata del prodotto "Edilizia in Cloud" (Q140698655).
// Va dichiarato come sameAs sui nodi SoftwareApplication/Product/Brand — NON
// su Organization, che rappresenta Domus Group S.r.l. e non il software.
// Serve ai motori generativi per riconciliare il brand come entità nota.
export const WIKIDATA_ENTITY = "https://www.wikidata.org/wiki/Q140698655";

type MetaEntry = { attr: "name" | "property"; key: string; prev: string | null; created: boolean };

function normalizeCanonicalUrl(value?: string) {
  const rawUrl = value
    ? (value.startsWith("http") ? value : `${SITE_URL}${value}`)
    : SITE_URL;

  try {
    const url = new URL(rawUrl);
    url.protocol = "https:";
    url.hostname = "www.ediliziaincloud.com";
    url.hash = "";
    url.search = "";

    const isRoot = url.pathname === "/";
    const isFile = /\.[a-z0-9]{2,8}$/i.test(url.pathname);
    if (!isRoot && !isFile && !url.pathname.endsWith("/")) {
      url.pathname = `${url.pathname}/`;
    }
    return url.toString();
  } catch {
    const path = rawUrl.replace(SITE_URL, "").replace(/\/$/, "");
    return `${SITE_URL}${path ? `${path}/` : "/"}`;
  }
}

function upsertMeta(attr: "name" | "property", key: string, value: string): MetaEntry {
  let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  const created = !el;
  const prev = el ? el.content : null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = value;
  return { attr, key, prev, created };
}

function upsertLink(rel: string, href: string) {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) { el = document.createElement("link"); el.rel = rel; document.head.appendChild(el); }
  el.href = href;
}

function setHreflangs(canonicalUrl: string) {
  // Idempotent: remove existing hreflang link tags before re-injecting
  document.querySelectorAll('link[rel="alternate"][hreflang]').forEach((el) => el.remove());
  const langs: Array<{ hreflang: string; href: string }> = [
    { hreflang: "it-IT", href: canonicalUrl },
    { hreflang: "x-default", href: canonicalUrl },
  ];
  langs.forEach(({ hreflang, href }) => {
    const link = document.createElement("link");
    link.rel = "alternate";
    link.hreflang = hreflang;
    link.href = href;
    document.head.appendChild(link);
  });
}

export function useSEO(options: SEOOptions) {
  const entriesRef = useRef<MetaEntry[]>([]);

  const {
    title, description, canonical, ogImage,
    noindex = false, type = "website", publishedTime, modifiedTime,
    keywords, section, tags,
  } = options;

  useEffect(() => {
    // Aggiunge il suffix "| Edilizia in Cloud" SOLO se:
    //   - title non lo contiene già
    //   - title è abbastanza corto da rimanere sotto 60 char dopo il suffix
    //     (Google tronca a ~60 char nei risultati di ricerca)
    const SUFFIX = " | Edilizia in Cloud";
    const fullTitle =
      title.includes("Edilizia in Cloud") || title.length + SUFFIX.length > 60
        ? title
        : `${title}${SUFFIX}`;
    document.title = fullTitle;

    const canonicalUrl = normalizeCanonicalUrl(canonical);
    const resolvedOgImage =
      ogImage && ogImage !== LEGACY_DEFAULT_IMAGE
        ? ogImage
        : ogImageForPath(new URL(canonicalUrl).pathname);

    const set = (attr: "name" | "property", key: string, value: string) => {
      entriesRef.current.push(upsertMeta(attr, key, value));
    };

    // Core
    set("name", "description", description);
    set("name", "robots", noindex
      ? "noindex,nofollow"
      : "index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1");
    if (keywords) set("name", "keywords", keywords);

    // Geo / Local SEO
    set("name", "geo.region",    "IT");
    set("name", "geo.placename", "Italia");
    set("name", "geo.position",  "45.4642;9.1900");
    set("name", "ICBM",          "45.4642, 9.1900");
    set("name", "language",         "Italian");
    set("name", "content-language", "it");

    // Open Graph
    set("property", "og:type",        type);
    set("property", "og:title",       fullTitle);
    set("property", "og:description", description);
    set("property", "og:url",         canonicalUrl);
    set("property", "og:image",       resolvedOgImage);
    set("property", "og:image:width",  "1200");
    set("property", "og:image:height", "630");
    set("property", "og:image:alt",    fullTitle);
    set("property", "og:site_name",   "Edilizia in Cloud");
    set("property", "og:locale",      "it_IT");

    // Article-specific OG
    if (type === "article") {
      if (publishedTime) set("property", "article:published_time", publishedTime);
      if (modifiedTime)  set("property", "article:modified_time",  modifiedTime);
      if (section)       set("property", "article:section",        section);
      if (tags)          tags.forEach(t => set("property", "article:tag", t));
      set("property", "article:author", `${SITE_URL}/chi-siamo`);
    }

    // Twitter / X
    set("name", "twitter:card",        "summary_large_image");
    set("name", "twitter:site",        "@EdiliziaInCloud");
    set("name", "twitter:creator",     "@EdiliziaInCloud");
    set("name", "twitter:title",       fullTitle);
    set("name", "twitter:description", description);
    set("name", "twitter:image",       resolvedOgImage);
    set("name", "twitter:image:alt",   fullTitle);

    // Canonical link
    upsertLink("canonical", canonicalUrl);

    // Hreflang alternates (it-IT + x-default)
    setHreflangs(canonicalUrl);

    // Marker per scripts/prerender.mjs: indica che useSEO ha applicato i metadati
    // della pagina corrente. Lo script Playwright lo controlla prima di catturare
    // l'HTML — senza questo, il prerender potrebbe salvare il guscio iniziale
    // della homepage prima che React monti la rotta giusta.
    document.documentElement.setAttribute("data-seo-applied", "true");

    return () => {
      // Restore or remove each meta we touched
      entriesRef.current.forEach(({ attr, key, prev, created }) => {
        const el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
        if (!el) return;
        if (created) el.remove();
        else if (prev !== null) el.content = prev;
      });
      entriesRef.current = [];
      document.title = DEFAULT_TITLE;
    };
  }, [
    title, description, canonical, ogImage, noindex,
    type, publishedTime, modifiedTime, keywords, section,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    tags?.join(","),
  ]);
}
