const RENDER_LABELS: Record<string, string> = {
  "render-infissi": "Render Infissi AI",
  "render-bagni": "Render Bagni AI",
  "render-pavimenti": "Render Pavimenti AI",
  "render-piscine": "Render Piscine AI",
  "render-ristrutturazioni": "Render Ristrutturazioni AI",
  "render-stanza": "Render Stanza AI",
  "render-tetti": "Render Tetti AI",
};

function fallbackLabelFromSlug(slug: string) {
  const normalized = slug.replace(/^render-/, "render ");
  return normalized
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") + " AI";
}

export function getRenderLeadLabel(slug: string) {
  return RENDER_LABELS[slug] || fallbackLabelFromSlug(slug);
}

export function buildRenderDemoHref(slug: string) {
  const params = new URLSearchParams({
    render: slug,
    source: "render_landing",
  });
  return `/demo?${params.toString()}`;
}

export function getRenderLeadContext(slug: string | null) {
  if (!slug || !slug.startsWith("render-")) return null;

  const label = getRenderLeadLabel(slug);
  return {
    slug,
    label,
    pagePath: `/funzionalita/${slug}`,
    formIntro: `Ti ricontattiamo con una demo coerente con ${label}, non con una richiesta generica.`,
    messagePlaceholder: `Raccontaci che tipo di progetto vuoi vedere con ${label}...`,
    submitLabel: `Richiedi info su ${label} →`,
  };
}
