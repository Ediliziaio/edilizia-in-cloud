const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export const QUOTE_FIELD_MODULES: Record<string, string> = {
  serramenti: "sr", fotovoltaico: "fv", bagni: "bgn", ristrutturazione: "rst", tetti: "tet",
  climatizzazione: "clm", termoidraulico: "idr", elettrico: "ele", pavimenti: "pav", piscine: "pis",
};
/** Header metadata of a saved project. Never alias a native product/quantity/price into custom fields. */
export function quoteFieldContext(pathname: string): { entityType: string; id: string } | null {
  const solar = pathname.match(new RegExp(`^/azienda/marketing/fotovoltaico/(${UUID})/modifica/?$`, "i"));
  if (solar) return { entityType: "quote_fv", id: solar[1] };
  const native = pathname.match(new RegExp(`^/azienda/([^/]+)/(${UUID})/modifica/?$`, "i"));
  if (native && QUOTE_FIELD_MODULES[native[1]]) return { entityType: `quote_${QUOTE_FIELD_MODULES[native[1]]}`, id: native[2] };
  const classic = pathname.match(new RegExp(`^/azienda/marketing/preventivi/(${UUID})/(?:modifica|edit)/?$`, "i"));
  return classic ? { entityType: "quote", id: classic[1] } : null;
}
