import {
  righeComponentiFv,
  type ListinoComponentiFv,
} from "./componentiConfigurazione";
import { anteprimaFotovoltaico } from "./anteprima";
import type { DiscountRule } from "@/hooks/useDiscountRules";
import type { WizardData } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/types";
import {
  renderFvPdfHtml,
  type FvPdfTemplateData,
} from "../../../supabase/functions/_shared/fvHtmlTemplate";
export function fvConversationPreview(
  data: WizardData,
  listino: ListinoComponentiFv,
  template: FvPdfTemplateData["template"],
  companyName: string,
  rules: DiscountRule[],
  numero = "Bozza locale",
  identity?: { createdAt?: string; azienda?: FvPdfTemplateData["azienda"] },
) {
  const preview = anteprimaFotovoltaico(data, {
    emittente: companyName,
    numero,
    listino,
    regoleSconto: rules,
    impiantoConfigurato: true,
    scenario: null,
    conImpresa: false,
  });
  const total = preview.totaleDocumento ?? 0;
  const sources = [
    ...listino.pannelli,
    ...listino.inverter,
    ...listino.accumuli,
  ];
  const payload: FvPdfTemplateData = {
    configurationOnly: true,
    azienda: identity?.azienda ?? { name: companyName },
    cliente: {
      nome: data.cliente_nome,
      cognome: data.cliente_cognome,
      cointestatario: [data.cointestatario_nome, data.cointestatario_cognome]
        .map(value => value?.trim()).filter(Boolean).join(" ") || null,
      cointestatario_cf: data.cointestatario_codice_fiscale || null,
      indirizzo: data.indirizzo,
      comune: data.comune,
      cap: data.cap,
      provincia: data.provincia,
      tipologia_immobile: data.tipologia_immobile,
    },
    progetto: {
      numero,
      titolo: "Configurazione fotovoltaico",
      creato_il: identity?.createdAt ?? new Date().toISOString(),
      valido_giorni:
        Number(template?.scadenza_validita_preventivo_giorni) || 30,
      potenza_kwp: data.potenza_kwp,
      numero_pannelli: data.numero_pannelli_scelti,
      has_accumulo: data.con_accumulo,
      capacita_accumulo_kwh: data.capacita_accumulo_kwh,
      consumo_annuo_kwh: data.consumo_annuo_kwh ?? 0,
      costo_kwh_attuale: data.costo_kwh_attuale ?? 0,
    },
    costi: {
      prezzo_vendita_iva_inclusa: total,
      iva_perc: data.iva_aliquota * 100,
      prezzo_a_corpo:
        !!data.kit_bundle_id || data.prezzo_vendita_manuale != null,
      sconto_applicato: (data.sconto_valore ?? 0) > 0,
      detrazione_eur: 0,
      detrazione_perc: 0,
      costo_netto_dopo_detrazione: total,
    },
    scenario: {
      risparmio_mensile_eur: 0,
      risparmio_anno1_eur: 0,
      risparmio_25_anni_eur: 0,
      payback_anni: null,
      npv_25_anni: 0,
      cassa_anno_per_anno: [],
    },
    flows: {
      produzione_kwh: 0,
      autoconsumo_kwh: 0,
      ceduto_rete_kwh: 0,
      prelievo_rete_kwh: 0,
      autoconsumo_pct: 0,
      autosufficienza_pct: 0,
      consumo_da_rete_pct: 0,
      consumo_da_fv_pct: 0,
    },
    componenti: righeComponentiFv(data, listino).map((row) => {
      const article = sources.find((a) => a.id === row.articolo_id);
      return {
        ...row,
        potenza_w: row.potenza_unitaria_w,
        image_url: article?.immagine_url as string | null,
        articolo_descrizione_estesa: article?.descrizione as string | null,
        scheda_tecnica_url: article?.scheda_tecnica_url as string | null,
      };
    }),
    servizi: [
      ...data.servizi_righe,
      ...data.manodopera_righe.map((r) => ({
        descrizione: r.descrizione,
        quantita: r.ore,
        prezzo_vendita: r.tariffa_oraria_vendita,
        note_operative: "Quantità espressa in ore",
      })),
    ],
    template,
  };
  return { html: renderFvPdfHtml(payload), total };
}
