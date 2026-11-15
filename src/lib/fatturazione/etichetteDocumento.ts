/**
 * Come si chiamano a schermo i tipi e gli stati di documenti_fiscali (15/11/2026).
 * Nella scheda cliente comparivano le chiavi interne («Fattura_pa», «Nota_credito»).
 * Un tipo o uno stato che qui non c'è si mostra lo stesso, leggibile: senza
 * trattini bassi e con la maiuscola.
 */

export const ETICHETTA_TIPO_DOCUMENTO: Record<string, string> = {
  fattura: "Fattura",
  fattura_pa: "Fattura PA",
  nota_credito: "Nota di credito",
  nota_debito: "Nota di debito",
  proforma: "Proforma",
  preventivo: "Preventivo",
  ddt: "DDT",
  parcella: "Parcella",
  fattura_accompagnatoria: "Fattura accompagnatoria",
  fattura_riepilogativa: "Fattura riepilogativa",
  fattura_differita_b: "Fattura differita",
  autofattura: "Autofattura",
  autofattura_splafonamento: "Autofattura per splafonamento",
  autoconsumo: "Autoconsumo",
  acconto_fattura: "Acconto su fattura",
  acconto_parcella: "Acconto su parcella",
  reverse_charge_interno: "Integrazione reverse charge",
  integrazione_servizi_estero: "Integrazione servizi dall'estero",
  integrazione_beni_ue: "Integrazione beni UE",
  integrazione_beni_extra_ue: "Integrazione beni extra UE",
};

export const ETICHETTA_STATO_DOCUMENTO: Record<string, string> = {
  bozza: "Bozza",
  emessa: "Emessa",
  in_invio: "Invio in corso",
  inviata_sdi: "Inviata allo SDI",
  consegnata: "Consegnata",
  accettata: "Accettata",
  rifiutata: "Rifiutata",
  scartata: "Scartata",
  pagata: "Pagata",
  parzialmente_pagata: "Pagata in parte",
  stornata: "Stornata",
  annullata: "Annullata",
  da_pagare: "Da pagare",
  scaduta: "Scaduta",
};

const leggibile = (v: string): string => {
  const t = v.replace(/_/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
};

export function etichettaTipoDocumento(tipo: string | null | undefined): string {
  const t = (tipo ?? "").trim();
  if (!t) return "Fattura";
  return ETICHETTA_TIPO_DOCUMENTO[t.toLowerCase()] ?? leggibile(t);
}

export function etichettaStatoDocumento(stato: string | null | undefined): string {
  const s = (stato ?? "").trim();
  if (!s) return "";
  return ETICHETTA_STATO_DOCUMENTO[s.toLowerCase()] ?? leggibile(s);
}
