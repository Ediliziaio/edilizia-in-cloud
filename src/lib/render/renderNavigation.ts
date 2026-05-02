const RENDER_TYPE_PATHS: Record<string, string> = {
  infissi: "/azienda/render/infissi",
  bagno: "/azienda/render/bagno",
  stanza: "/azienda/render/stanza",
  pavimento: "/azienda/render/pavimento",
  facciata: "/azienda/render/facciata",
  persiane: "/azienda/render/persiane",
  tetto: "/azienda/render/tetto",
  pergole: "/azienda/render/pergole",
  piscine: "/azienda/render/piscine",
  ristrutturazioni: "/azienda/render/ristrutturazioni",
  "pavimenti-esterni": "/azienda/render/pavimenti-esterni",
  giardini: "/azienda/render/giardini",
  "porte-blindate": "/azienda/render/porte-blindate",
  "porte-interne": "/azienda/render/porte-interne",
};

export function getRenderTypeBasePath(renderType: string | null | undefined) {
  if (!renderType) return "/azienda/render";
  return RENDER_TYPE_PATHS[renderType] ?? `/azienda/render/${renderType}`;
}

export function getRenderDetailPath(renderType: string | null | undefined, id: string) {
  return `${getRenderTypeBasePath(renderType)}/gallery/${id}`;
}
