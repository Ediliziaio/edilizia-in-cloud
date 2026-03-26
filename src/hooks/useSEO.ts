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
const DEFAULT_DESC  = "Il software gestionale n°1 per imprese edili italiane. Gestisci cantieri, margini, HR, marketing e fatturazione in un'unica piattaforma. Prova gratuita 30 giorni.";
const DEFAULT_IMAGE = "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/7a5d2f3f-4a52-4b31-81c9-fc593d582ee7/id-preview-b70db1cf--c34c07f6-5aea-4505-b4c7-9b00cd75679c.lovable.app-1771279786357.png";
export const SITE_URL = "https://ediliziaincloud.com";

type MetaEntry = { attr: "name" | "property"; key: string; prev: string | null; created: boolean };

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

export function useSEO(options: SEOOptions) {
  const entriesRef = useRef<MetaEntry[]>([]);

  const {
    title, description, canonical, ogImage = DEFAULT_IMAGE,
    noindex = false, type = "website", publishedTime, modifiedTime,
    keywords, section, tags,
  } = options;

  useEffect(() => {
    const fullTitle = title.includes("Edilizia in Cloud")
      ? title
      : `${title} | Edilizia in Cloud`;
    document.title = fullTitle;

    const canonicalUrl = canonical
      ? (canonical.startsWith("http") ? canonical : `${SITE_URL}${canonical}`)
      : SITE_URL;

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
      set("property", "article:author", "https://ediliziaincloud.com/chi-siamo");
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
