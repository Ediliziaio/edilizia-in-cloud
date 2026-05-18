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
// v8.6.48 — DEFAULT_IMAGE punta a un file locale garantito esistente in
// public/og/og-default.png. Prima puntava a un URL R2 lovable.app che
// dipende da un bucket esterno (rischio link rot). Inoltre, le 52 pagine
// /funzionalita/* dichiarano ogImage specifico (es. /og/calendario-lavori-og.jpg)
// che NON esiste in public/og/ → 404 di massa su anteprime social.
// Con questo default, FunzionalitaPageTemplate fa fallback corretto.
const DEFAULT_IMAGE = "https://www.ediliziaincloud.com/og/og-default.png";
export const SITE_URL = "https://www.ediliziaincloud.com";

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
    title, description, canonical, ogImage = DEFAULT_IMAGE,
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
    set("property", "og:image",       ogImage);
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
    set("name", "twitter:image",       ogImage);
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
