const SEZIONI: Array<[string, string, Record<string, string>]> = [
  ["verniciatura", "Pittura pareti", { colore_nome: "Nome colore", colore_hex: "Codice", colore_accento_nome: "Nome accento", colore_accento_hex: "Codice accento", finitura: "Finitura", applica_a: "Pareti", pareti_specifiche: "Dettaglio pareti" }],
  ["carta_da_parati", "Carta da parati", { stile_pattern: "Motivo", colore_base: "Colore", applica_a: "Pareti", descrizione: "Descrizione" }],
  ["rivestimento_pareti", "Rivestimento pareti", { tipo: "Materiale", colore_hex: "Colore", applica_a: "Pareti" }],
  ["arredo", "Arredo", { stile: "Stile", materiale: "Materiale", colore_principale_hex: "Colore", intensita_cambio: "Intervento", mantieni_elettrodomestici: "Mantieni elettrodomestici" }],
  ["soffitto", "Soffitto", { tipo: "Tipo", colore_hex: "Colore", colore_travi: "Colore travi" }],
  ["illuminazione", "Illuminazione", { tipo: "Apparecchi", temperatura: "Temperatura", intensita_luce: "Intensità" }],
  ["tende", "Tende", { tipo: "Tipo", colore_nome: "Nome colore", colore_hex: "Codice" }],
  ["restyling_cucina", "Restyling cucina", { materiale_frontali: "Frontali", colore_frontali_hex: "Colore frontali", piano_lavoro_materiale: "Piano di lavoro", colore_piano_lavoro_hex: "Colore piano", maniglie: "Maniglie", cambia_piano_cottura: "Cambia piano cottura" }],
  ["spazi_dettagli", "Spazi e dettagli", { layout_strategy: "Disposizione", elementi_da_mantenere: "Da mantenere", elementi_da_aggiungere: "Da aggiungere", elementi_da_rimuovere: "Da rimuovere", note_tecniche: "Note" }],
];

/** Informazioni del cliente leggibili, senza serializzare la configurazione tecnica. */
export function descriviScelteFascicolo(config: Record<string, unknown>): string[] {
  const righe: string[] = [];
  const scrivi = (v: unknown) => typeof v === "boolean" ? v ? "sì" : "no" : String(v).replace(/_/g, " ");
  if (config.stile_target) righe.push(`Stile: ${scrivi(config.stile_target)}. Trasformazione: ${scrivi(config.intensita ?? "non indicata")}.`);
  for (const [chiave, nome, campi] of SEZIONI) {
    const s = config[chiave] as Record<string, unknown> | undefined;
    if (s?.attivo !== true) continue;
    const valori = Object.entries(campi).flatMap(([k, label]) => {
      if (chiave === "verniciatura" && ((k.startsWith("colore_accento") && s.applica_a !== "parete_accento") || (["colore_nome", "colore_hex"].includes(k) && s.applica_a === "parete_accento"))) return [];
      const v = s[k];
      return typeof v === "boolean" || typeof v === "number" || (typeof v === "string" && v.trim()) ? [`${label}: ${scrivi(v)}`] : [];
    });
    righe.push(`${nome}: ${valori.join("; ") || "intervento selezionato"}.`);
  }
  const p = config.pavimento as Record<string, unknown> | undefined;
  if (p?.attivo === true) {
    const extra = [p.colore_hex && `Codice colore: ${p.colore_hex}`, p.effetto_visivo && `effetto ${scrivi(p.effetto_visivo)}`, p.battiscopa_azione && `battiscopa: ${scrivi(p.battiscopa_azione)}`, p.battiscopa_azione === "sostituisci" && p.battiscopa_tipo && `tipo ${scrivi(p.battiscopa_tipo)}`, p.battiscopa_azione === "sostituisci" && p.battiscopa_altezza_cm && `h ${p.battiscopa_altezza_cm} cm`];
    if (["gres_porcellanato", "cotto", "marmo", "pietra_naturale", "mosaico", "terrazzo_veneziano"].includes(String(p.tipo))) extra.push(p.fuga_larghezza_mm !== undefined && `fuga ${p.fuga_larghezza_mm} mm`, p.fuga_colore && `colore fuga ${scrivi(p.fuga_colore)}`);
    if (extra.some(Boolean)) righe.push(`Dettagli pavimento: ${extra.filter(Boolean).join("; ")}.`);
  }
  return righe;
}
