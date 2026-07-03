/**
 * renderTemplateText — espansione dei token {variabile} nei testi dei template
 * PDF (cover eyebrow/titolo/sottotitolo), inseriti dall'editor via
 * PlaceholderChips.
 *
 * Estratto dal renderSubheroTemplate di SerramentoPDF (e dal porting già fatto
 * in Climatizzazione/Pavimenti/Piscine): PRIMA di questa lib cinque renderer
 * (ristrutturazione, tetti, bagni, elettrico, termoidraulico) NON espandevano
 * affatto i token → il cliente riceveva un PDF con "{cliente_nome}" letterale.
 *
 * Contratto:
 * - token = {chiave_minuscola_con_underscore}; matching case-insensitive;
 * - i token sconosciuti restano testuali ("{foo}" → "{foo}") per essere
 *   visibili in revisione invece di sparire in silenzio;
 * - i valori mancanti degradano a stringhe neutre ("cliente", "—", "") come
 *   negli originali, mai a "undefined".
 */

export function renderTemplateText(
  template: string,
  replacements: Record<string, string>,
): string {
  if (!template) return template;
  return template.replace(/\{([a-z_]+)\}/gi, (full, key) => {
    const k = String(key).toLowerCase();
    return replacements[k] !== undefined ? replacements[k] : full;
  });
}

/** Campi comuni ai progetti dei moduli edilizia (tutti nullable). */
export interface StandardTemplateFields {
  cliente_nome?: string | null;
  cliente_cognome?: string | null;
  cantiere_citta?: string | null;
  cantiere_provincia?: string | null;
  tipo_intervento?: string | null;
}

/**
 * Dizionario standard condiviso dagli 8 moduli edilizia (i chip base offerti
 * da ogni editor). `extra` aggiunge/sovrascrive i token specifici del modulo
 * (es. superficie_mq per Elettrico, tipo_piscina per Piscine).
 */
export function buildStandardReplacements(
  p: StandardTemplateFields,
  extra: Record<string, string> = {},
): Record<string, string> {
  const nomeCompleto = [p.cliente_nome, p.cliente_cognome].filter(Boolean).join(" ").trim();
  return {
    cliente_nome: p.cliente_nome ?? "",
    cliente_cognome: p.cliente_cognome ?? "",
    cliente_nome_completo: nomeCompleto || "cliente",
    cantiere_citta: p.cantiere_citta ?? "—",
    cantiere_provincia: p.cantiere_provincia ?? "",
    tipo_intervento: p.tipo_intervento ?? "intervento",
    anno: String(new Date().getFullYear()),
    ...extra,
  };
}
