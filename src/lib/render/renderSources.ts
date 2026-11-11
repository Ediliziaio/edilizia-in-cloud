const STANDARD = {
  infissi: ["render_sessions", "render-originals"],
  stanza: ["render_stanza_sessions", "stanza-originals"],
  facciata: ["render_facciata_sessions", "facciata-originals"],
  pavimento: ["render_pavimento_sessions", "pavimento-originals"],
  persiane: ["render_persiane_sessions", "persiane-originals"],
  tetto: ["render_tetto_sessions", "tetto-originals"],
  pergole: ["render_pergole_sessions", "pergole-originals"],
  piscine: ["render_piscine_sessions", "piscine-originals"],
} as const;
const TECHNICAL = new Set([
  "ristrutturazioni",
  "pavimenti-esterni",
  "giardini",
  "porte-blindate",
  "porte-interne",
]);
export function renderSessionSource(module: string) {
  if (module === "bagno")
    return {
      table: "render_bagno_sessions",
      bucket: "bagno-originals",
      configColumn: "configurazione",
      originalColumn: "foto_originale_path",
      technical: false,
      bathroom: true,
    };
  if (TECHNICAL.has(module))
    return {
      table: "render_technical_sessions",
      bucket: "render-originals",
      configColumn: "config",
      originalColumn: "original_photo_url",
      technical: true,
      bathroom: false,
    };
  const source = STANDARD[module as keyof typeof STANDARD];
  if (!source) throw new Error("Modulo render non riconosciuto.");
  return {
    table: source[0],
    bucket: source[1],
    configColumn: "config",
    originalColumn: "original_photo_url",
    technical: false,
    bathroom: false,
  };
}
