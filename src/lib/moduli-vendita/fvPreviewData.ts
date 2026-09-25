import { fotoDiSerieDalSito, type FvPdfTemplateData } from "../../../supabase/functions/_shared/fvHtmlTemplate";
import { isFvAccumulo, isFvLocalIntervention, fvInterventionLabel } from "../../../supabase/functions/_shared/fvIntervento";
function standardFvPreview(): FvPdfTemplateData {
  return {
    azienda: { name: "La tua azienda", tagline: "Fotovoltaico chiavi in mano", phone: "+39 02 000 000", email: "info@azienda.it", website: "https://azienda.it", vat_number: "IT00000000000" },
    cliente: { nome: "Mario", cognome: "Rossi", indirizzo: "Via Roma 1", comune: "Milano", cap: "20100", provincia: "MI", tipologia_immobile: "Villa singola" },
    // Fixture coerente: 4.200 kWh autoconsumati + 900 kWh dalla rete = 5.100 kWh
    // consumati. Prima il PDF dichiarava 4.200 kWh ma visualizzava flussi per
    // 5.100 kWh, creando un'incongruenza percepibile dal cliente.
    progetto: { numero: "FV-ANTEPRIMA", titolo: "Mario Rossi", creato_il: "2026-01-01T10:00:00Z", valido_giorni: 30, venditore: "Consulente", potenza_kwp: 6, numero_pannelli: 12, has_accumulo: true, capacita_accumulo_kwh: 10, consumo_annuo_kwh: 5100, costo_kwh_attuale: 0.32, profilo_consumo: "misto", ore_sole_annue: 1450, superficie_tetto_disponibile_mq: 55 },
    costi: { prezzo_vendita_iva_inclusa: 18000, iva_perc: 10, detrazione_eur: 9000, detrazione_perc: 50, costo_netto_dopo_detrazione: 9000 },
    finanziamento: { finanziaria: "Finanziaria", durata_mesi: 84, rata_mensile: 230, tan_perc: 4, taeg_perc: 5, importo_finanziato: 18000 },
    scenario: { risparmio_mensile_eur: 150, risparmio_anno1_eur: 1800, risparmio_25_anni_eur: 46000, payback_anni: 8, npv_25_anni: 24000, cassa_anno_per_anno: [{ anno: 0, cumulato: -18000 }, { anno: 8, cumulato: 0 }, { anno: 25, cumulato: 46000 }] },
    flows: { produzione_kwh: 7400, autoconsumo_kwh: 4200, ceduto_rete_kwh: 3200, prelievo_rete_kwh: 900, autoconsumo_pct: 4200 / 7400, autosufficienza_pct: 4200 / 5100, consumo_da_rete_pct: 900 / 5100, consumo_da_fv_pct: 4200 / 5100 },
    // Gli stessi dati senza batteria (profilo misto: 35% della produzione).
    flows_senza_accumulo: { produzione_kwh: 7400, autoconsumo_kwh: 2590, ceduto_rete_kwh: 4810, prelievo_rete_kwh: 2510, autoconsumo_pct: 2590 / 7400, autosufficienza_pct: 2590 / 5100, consumo_da_rete_pct: 2510 / 5100, consumo_da_fv_pct: 2590 / 5100 },
    // Le foto di serie del documento, dal sito stesso: come le vedrà il cliente.
    foto_di_serie: typeof window !== "undefined" ? fotoDiSerieDalSito(window.location.origin) : null,
    componenti: [
      { categoria: "pannello", descrizione: "Pannello 500 W", marca: "—", modello: "PV500", quantita: 12, potenza_w: 500, garanzia_anni: 25 },
      { categoria: "inverter", descrizione: "Inverter ibrido 6 kW", marca: "—", modello: "INV6", quantita: 1, garanzia_anni: 10 },
      { categoria: "accumulo", descrizione: "Batteria 10 kWh", marca: "—", modello: "BAT10", quantita: 1, capacita_kwh: 10, garanzia_anni: 10 },
    ],
  };
}

/** Shared by the live preview, full preview and offline QA. */
export function buildFvPreviewBase(template?: FvPdfTemplateData["template"]): FvPdfTemplateData {
  const base = standardFvPreview();
  if (!isFvLocalIntervention(template)) return base;
  if (!isFvAccumulo(template)) {
    const id = template?.pdf_blocchi?.modulo_intervento;
    const components: FvPdfTemplateData["componenti"] = id === "manutenzione" ? [] : id === "componenti"
      ? [{ categoria: "inverter", descrizione: "Inverter sostitutivo · esempio, compatibilità da verificare", marca: "Da confermare", modello: "Da confermare", quantita: 1 }]
      : [{ categoria: "pannello", descrizione: "Modulo fotovoltaico · esempio, modello da confermare", marca: "Da confermare", modello: "Da confermare", quantita: id === "nuovo" ? 12 : 4, potenza_w: 500 }, ...(id === "nuovo" ? [{ categoria: "inverter", descrizione: "Inverter · esempio da dimensionare", marca: "Da confermare", modello: "Da confermare", quantita: 1 }] : [])];
    const total = id === "nuovo" ? 11000 : id === "ampliamento" ? 3500 : id === "componenti" ? 1800 : 350;
    return { ...base, azienda: { name: "La tua azienda", tagline: "ANTEPRIMA DIMOSTRATIVA" },
      progetto: { ...base.progetto, numero: "FV-DEMO", titolo: `${fvInterventionLabel(template)} · esempio`, potenza_kwp: id === "nuovo" ? 6 : id === "ampliamento" ? 2 : 0, numero_pannelli: id === "nuovo" ? 12 : id === "ampliamento" ? 4 : 0, has_accumulo: false, capacita_accumulo_kwh: 0, consumo_annuo_kwh: 0, costo_kwh_attuale: 0 },
      costi: { prezzo_vendita_iva_inclusa: total, iva_perc: 22, detrazione_eur: 0, detrazione_perc: 0, costo_netto_dopo_detrazione: total }, finanziamento: null,
      scenario: { risparmio_mensile_eur: 0, risparmio_anno1_eur: 0, risparmio_25_anni_eur: 0, payback_anni: null, npv_25_anni: 0, cassa_anno_per_anno: [] },
      flows: { produzione_kwh: 0, autoconsumo_kwh: 0, ceduto_rete_kwh: 0, prelievo_rete_kwh: 0, autoconsumo_pct: 0, autosufficienza_pct: 0, consumo_da_rete_pct: 0, consumo_da_fv_pct: 0 }, flows_senza_accumulo: undefined, foto_di_serie: null,
      componenti: components, servizi: [{ descrizione: id === "manutenzione" ? "Controlli concordati e rapporto · attività dimostrative da definire" : "Lavorazioni previste · esempio da definire nel preventivo" }], template };
  }
  return {
    ...base,
    azienda: { name: "La tua azienda", tagline: "ANTEPRIMA DIMOSTRATIVA" },
    cliente: { ...base.cliente, nome: "Cliente", cognome: "dimostrativo" },
    progetto: { ...base.progetto, numero: "ACC-ANTEPRIMA", titolo: "Integrazione accumulo · esempio", potenza_kwp: 0, numero_pannelli: 0, capacita_accumulo_kwh: 10, consumo_annuo_kwh: 0, costo_kwh_attuale: 0 },
    costi: { prezzo_vendita_iva_inclusa: 4500, iva_perc: 22, detrazione_eur: 0, detrazione_perc: 0, costo_netto_dopo_detrazione: 4500 },
    finanziamento: null,
    scenario: { risparmio_mensile_eur: 0, risparmio_anno1_eur: 0, risparmio_25_anni_eur: 0, payback_anni: null, npv_25_anni: 0, cassa_anno_per_anno: [] },
    flows: { produzione_kwh: 0, autoconsumo_kwh: 0, ceduto_rete_kwh: 0, prelievo_rete_kwh: 0, autoconsumo_pct: 0, autosufficienza_pct: 0, consumo_da_rete_pct: 0, consumo_da_fv_pct: 0 },
    flows_senza_accumulo: undefined, foto_di_serie: null,
    componenti: [{ categoria: "accumulo", descrizione: "Sistema di accumulo · esempio dimostrativo", marca: "Da confermare", modello: "Da confermare", quantita: 1, capacita_kwh: 10 }],
    servizi: [{ descrizione: "Verifica compatibilità, installazione e configurazione · voci dimostrative da definire" }],
    template,
  };
}
