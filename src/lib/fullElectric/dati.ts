/**
 * I dati della Casa Full Electric salvati sul preventivo termoidraulico
 * (idr_progetti.full_electric): i pezzi del sistema, le bollette di oggi, le
 * stime di domani e gli incentivi. Tutto scritto a mano da chi vende.
 */
import type { ModalitaContributo } from "@/lib/contoTermico/regole";
import { COMPONENTI_FULL_ELECTRIC, type ComponenteFullElectric } from "./regole";
import type { FullElectricEconomia } from "./calcoli";

export interface PezzoFullElectric {
  tipo: ComponenteFullElectric;
  /** «Fotovoltaico 6 kWp». */
  titolo: string;
  /** «14 moduli da 430 W, inverter ibrido». */
  dettaglio: string;
}

export interface DatiFullElectric {
  componenti: PezzoFullElectric[];
  /** Cosa si lascia: «Caldaia a gas e piano cottura a gas». */
  impianto_attuale: string;
  spesa_gas: number;
  spesa_luce: number;
  gas_smc: number;
  luce_kwh: number;
  produzione_kwh: number;
  consumo_kwh: number;
  autoconsumo_pct: number;
  prezzo_luce: number;
  prezzo_immissione: number;
  quota_fissa: number;
  /** 50 o 36; null = nessuna detrazione. */
  detrazione_pct: number | null;
  /** La spesa detraibile (IVA inclusa); null = tutto il prezzo. */
  importo_detraibile: number | null;
  /** Conto Termico sulla pompa di calore, stimato; 0 = nessuno. */
  contributo_ct: number;
  modalita_ct: ModalitaContributo;
  aumento_energia_pct: number;
  anni: number;
  /** La scheda del sistema proposto: «Potenza fotovoltaico» → «6 kWp». */
  caratteristiche: { etichetta: string; valore: string }[];
}

export const DATI_FULL_ELECTRIC_INIZIALI: DatiFullElectric = {
  componenti: [
    { tipo: "fotovoltaico", titolo: "Impianto fotovoltaico", dettaglio: "" },
    { tipo: "accumulo", titolo: "Batteria di accumulo", dettaglio: "" },
    { tipo: "pompa_calore", titolo: "Pompa di calore aria-acqua", dettaglio: "Riscaldamento e acqua calda" },
    { tipo: "induzione", titolo: "Piano a induzione", dettaglio: "" },
  ],
  impianto_attuale: "Caldaia a gas e piano cottura a gas",
  spesa_gas: 0,
  spesa_luce: 0,
  gas_smc: 0,
  luce_kwh: 0,
  produzione_kwh: 0,
  consumo_kwh: 0,
  autoconsumo_pct: 60,
  prezzo_luce: 0.28,
  prezzo_immissione: 0.1,
  quota_fissa: 0,
  detrazione_pct: 50,
  importo_detraibile: null,
  contributo_ct: 0,
  modalita_ct: "sconto_in_fattura",
  aumento_energia_pct: 2,
  anni: 20,
  caratteristiche: [],
};

const numero = (v: unknown, riserva: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : riserva;
};
const testo = (v: unknown, riserva: string, max = 160) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : riserva);
const positivo = (v: unknown, riserva = 0) => Math.max(0, numero(v, riserva));

/** Dal jsonb salvato ai dati completi: ciò che manca prende il valore di partenza. */
export function leggiDatiFullElectric(raw: unknown): DatiFullElectric {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DATI_FULL_ELECTRIC_INIZIALI;
  const componenti = Array.isArray(r.componenti)
    ? r.componenti
        .map((x) => (x && typeof x === "object" ? x as Record<string, unknown> : {}))
        .filter((x) => typeof x.tipo === "string" && x.tipo in COMPONENTI_FULL_ELECTRIC)
        .map((x) => {
          const tipo = x.tipo as ComponenteFullElectric;
          return { tipo, titolo: testo(x.titolo, COMPONENTI_FULL_ELECTRIC[tipo]), dettaglio: testo(x.dettaglio, "", 200) };
        })
        // Un pezzo per tipo: il sistema ha un fotovoltaico, una batteria…
        .filter((x, i, tutti) => tutti.findIndex((y) => y.tipo === x.tipo) === i)
    : d.componenti;
  const caratteristiche = Array.isArray(r.caratteristiche)
    ? r.caratteristiche
        .map((x) => (x && typeof x === "object" ? x as Record<string, unknown> : {}))
        .map((x) => ({ etichetta: testo(x.etichetta, ""), valore: testo(x.valore, "") }))
        .filter((x) => x.etichetta && x.valore)
        .slice(0, 9)
    : [];
  const detrazione = r.detrazione_pct === null ? null : numero(r.detrazione_pct, d.detrazione_pct ?? 50);
  const detraibile = r.importo_detraibile == null || r.importo_detraibile === "" ? null : positivo(r.importo_detraibile);
  return {
    componenti,
    impianto_attuale: testo(r.impianto_attuale, d.impianto_attuale),
    spesa_gas: positivo(r.spesa_gas),
    spesa_luce: positivo(r.spesa_luce),
    gas_smc: positivo(r.gas_smc),
    luce_kwh: positivo(r.luce_kwh),
    produzione_kwh: positivo(r.produzione_kwh),
    consumo_kwh: positivo(r.consumo_kwh),
    autoconsumo_pct: Math.min(100, positivo(r.autoconsumo_pct, d.autoconsumo_pct)),
    prezzo_luce: Math.min(2, positivo(r.prezzo_luce, d.prezzo_luce)),
    prezzo_immissione: Math.min(2, positivo(r.prezzo_immissione, d.prezzo_immissione)),
    quota_fissa: positivo(r.quota_fissa),
    detrazione_pct: detrazione === null || detrazione <= 0 ? null : Math.min(100, detrazione),
    importo_detraibile: detraibile && detraibile > 0 ? detraibile : null,
    contributo_ct: positivo(r.contributo_ct),
    modalita_ct: r.modalita_ct === "rimborso" ? "rimborso" : "sconto_in_fattura",
    aumento_energia_pct: Math.min(10, positivo(r.aumento_energia_pct, d.aumento_energia_pct)),
    anni: Math.min(30, Math.max(5, Math.round(numero(r.anni, d.anni)))),
    caratteristiche,
  };
}

/** Dati del preventivo + prezzo finale (IVA inclusa) → i numeri per i conti. */
export function economiaFullElectric(dati: DatiFullElectric, prezzoIvaInclusa: number, ivaPct: number): FullElectricEconomia {
  return {
    prezzoIvaInclusa,
    ivaPct,
    oggi: { spesaGas: dati.spesa_gas, spesaLuce: dati.spesa_luce, gasSmc: dati.gas_smc, luceKwh: dati.luce_kwh },
    domani: {
      produzioneKwh: dati.produzione_kwh,
      consumoKwh: dati.consumo_kwh,
      autoconsumoPct: dati.autoconsumo_pct,
      prezzoLuce: dati.prezzo_luce,
      prezzoImmissione: dati.prezzo_immissione,
      quotaFissa: dati.quota_fissa,
    },
    incentivi: {
      detrazionePct: dati.detrazione_pct,
      importoDetraibile: dati.importo_detraibile,
      contributoCt: dati.contributo_ct,
      modalitaCt: dati.modalita_ct,
    },
    aumentoEnergiaPct: dati.aumento_energia_pct,
    anni: dati.anni,
  };
}
