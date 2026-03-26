// src/hooks/useSEO.ts
import { useEffect } from "react";

interface SEOOptions {
  title: string;
  description: string;
  canonical?: string;
  ogImage?: string;
  noindex?: boolean;
  type?: "website" | "article";
  publishedTime?: string;
  keywords?: string;
}

const DEFAULT_TITLE = "Edilizia in Cloud — Software Gestionale per Imprese Edili";
const DEFAULT_DESC = "Il software gestionale n°1 per imprese edili italiane. Gestisci cantieri, margini, HR, marketing e fatturazione in un'unica piattaforma. Prova gratuita 30 giorni.";
const DEFAULT_IMAGE = "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/7a5d2f3f-4a52-4b31-81c9-fc593d582ee7/id-preview-b70db1cf--c34c07f6-5aea-4505-b4c7-9b00cd75679c.lovable.app-1771279786357.png";
const SITE_URL = "https://ediliziaincloud.com";

function setMeta(name: string, content: string, useProperty = false) {
  const attr = useProperty ? "property" : "name";
  let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.content = content;
}

function setLink(rel: string, href: string) {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

export function useSEO(options: SEOOptions) {
  useEffect(() => {
    const {
      title,
      description,
      canonical,
      ogImage = DEFAULT_IMAGE,
      noindex = false,
      type = "website",
      publishedTime,
      keywords,
    } = options;

    const fullTitle = title.includes("Edilizia in Cloud") ? title : `${title} | Edilizia in Cloud`;
    document.title = fullTitle;

    setMeta("description", description);
    if (keywords) setMeta("keywords", keywords);
    setMeta("robots", noindex ? "noindex,nofollow" : "index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1");

    // Geo / Local SEO
    setMeta("geo.region", "IT");
    setMeta("geo.placename", "Italia");
    setMeta("geo.position", "45.4642;9.1900");
    setMeta("ICBM", "45.4642, 9.1900");
    setMeta("language", "Italian");
    setMeta("content-language", "it");

    // Open Graph
    setMeta("og:type", type, true);
    setMeta("og:title", fullTitle, true);
    setMeta("og:description", description, true);
    setMeta("og:image", ogImage, true);
    setMeta("og:image:width", "1200", true);
    setMeta("og:image:height", "630", true);
    setMeta("og:site_name", "Edilizia in Cloud", true);
    setMeta("og:locale", "it_IT", true);
    if (canonical) setMeta("og:url", canonical.startsWith("http") ? canonical : `${SITE_URL}${canonical}`, true);
    if (publishedTime) setMeta("article:published_time", publishedTime, true);

    // Twitter
    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:site", "@EdiliziaInCloud");
    setMeta("twitter:title", fullTitle);
    setMeta("twitter:description", description);
    setMeta("twitter:image", ogImage);

    // Canonical
    if (canonical) {
      setLink("canonical", canonical.startsWith("http") ? canonical : `${SITE_URL}${canonical}`);
    }

    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [options.title, options.description, options.canonical]);
}
