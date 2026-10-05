/**
 * I componenti del preventivo fotovoltaico, dalla configurazione del wizard.
 *
 * Sono le righe che la Fase 5 scrive in `fv_componenti_progetto` (e che il calcolo
 * finanziario somma per il prezzo): una voce sola col prezzo del kit chiavi in mano,
 * oppure pannello, inverter e accumulo dal listino più i prodotti extra.
 *
 * Funzione PURA, una sola: la usano il salvataggio della Fase 5 e l'anteprima a
 * destra, così le righe che vede chi prepara il preventivo sono quelle che finiscono
 * nel database e nel PDF.
 */
import type { FvCategoriaComponente } from "./tipi";

/** Una riga di `fv_componenti_progetto` (senza l'id del progetto, che lo aggiunge chi salva). */
export interface RigaComponenteFv {
  articolo_id: string | null;
  categoria: FvCategoriaComponente;
  descrizione: string;
  quantita: number;
  unita_misura: string;
  prezzo_unitario_netto: number;
  prezzo_unitario_vendita: number;
  margine_pct: number | null;
  potenza_unitaria_w: number | null;
  potenza_unitaria_kw: number | null;
  capacita_kwh: number | null;
  garanzia_anni: number | null;
  ordinamento: number;
}

/** Gli articoli del listino FV, come li restituisce `useArticoliFv`. */
export type ArticoloFv = Record<string, unknown>;

/** I campi del wizard che decidono i componenti (`WizardData` li ha tutti). */
export interface ConfigurazioneComponentiFv {
  kit_bundle_id: string | null;
  kit_nome: string | null;
  kit_prezzo: number | null;
  potenza_kwp: number;
  con_accumulo: boolean;
  capacita_accumulo_kwh: number;
  numero_pannelli_scelti: number;
  pannello_id: string | null;
  inverter_id: string | null;
  accumulo_id: string | null;
  prodotti_extra: Array<{
    descrizione: string;
    quantita: number;
    prezzo_vendita: number;
    prezzo_acquisto: number | null;
  }>;
}

export interface ListinoComponentiFv {
  pannelli: ArticoloFv[];
  inverter: ArticoloFv[];
  accumuli: ArticoloFv[];
}

/** Euro per kWh di un accumulo scelto solo per capacità, senza modello dal listino. */
export const EURO_PER_KWH_ACCUMULO_GENERICO = 800;

const trovaArticolo = (articoli: ArticoloFv[], id: string | null): ArticoloFv | undefined =>
  articoli.find((a) => (a as { id: string }).id === id);

const margine = (vendita: number, netto: number): number | null =>
  vendita > 0 && netto > 0 ? (vendita - netto) / vendita : null;

export function righeComponentiFv(data: ConfigurazioneComponentiFv, listino: ListinoComponentiFv): RigaComponenteFv[] {
  const comp: RigaComponenteFv[] = [];

  if (data.kit_bundle_id && data.kit_prezzo != null) {
    // Kit FV: un'unica voce col prezzo d'offerta del kit (chiavi in mano).
    // Il costo del kit non si conosce: 0 = «non disponibile». Prima si stimava
    // al 75% del prezzo e la Vista impresa mostrava un margine del 25% inventato.
    comp.push({
      articolo_id: null,
      categoria: "altro",
      descrizione: data.kit_nome ?? `Kit FV ${data.potenza_kwp} kWp`,
      quantita: 1,
      unita_misura: "kit",
      prezzo_unitario_netto: 0,
      prezzo_unitario_vendita: data.kit_prezzo,
      margine_pct: null,
      potenza_unitaria_w: null,
      potenza_unitaria_kw: data.potenza_kwp,
      capacita_kwh: data.con_accumulo ? data.capacita_accumulo_kwh : null,
      garanzia_anni: 25,
      ordinamento: 1,
    });
  } else {
    const pannello = trovaArticolo(listino.pannelli, data.pannello_id);
    if (pannello) {
      const p = pannello;
      const netto = Number(p.prezzo_acquisto) || 0; // senza costo d'acquisto: non disponibile
      const vendita = Number(p.prezzo_vendita) || 0;
      comp.push({
        articolo_id: data.pannello_id,
        categoria: "pannello",
        descrizione: (p.descrizione as string) ?? "Pannello FV",
        quantita: data.numero_pannelli_scelti,
        unita_misura: "pz",
        prezzo_unitario_netto: netto,
        prezzo_unitario_vendita: vendita,
        margine_pct: margine(vendita, netto),
        potenza_unitaria_w: (p.potenza_w as number) ?? 540,
        potenza_unitaria_kw: null,
        capacita_kwh: null,
        garanzia_anni: (p.garanzia_anni as number) ?? 25,
        ordinamento: 1,
      });
    }
    const inv = trovaArticolo(listino.inverter, data.inverter_id);
    if (inv) {
      const p = inv;
      const netto = Number(p.prezzo_acquisto) || 0; // senza costo d'acquisto: non disponibile
      const vendita = Number(p.prezzo_vendita) || 0;
      comp.push({
        articolo_id: data.inverter_id,
        categoria: "inverter",
        descrizione: (p.descrizione as string) ?? "Inverter",
        quantita: 1,
        unita_misura: "pz",
        prezzo_unitario_netto: netto,
        prezzo_unitario_vendita: vendita,
        margine_pct: margine(vendita, netto),
        potenza_unitaria_w: null,
        potenza_unitaria_kw: (p.potenza_kw as number) ?? data.potenza_kwp,
        capacita_kwh: null,
        garanzia_anni: (p.garanzia_anni as number) ?? 10,
        ordinamento: 2,
      });
    }
    if (data.con_accumulo) {
      const acc = trovaArticolo(listino.accumuli, data.accumulo_id);
      if (acc) {
        const p = acc;
        const netto = Number(p.prezzo_acquisto) || 0; // senza costo d'acquisto: non disponibile
        const vendita = Number(p.prezzo_vendita) || 0;
        comp.push({
          articolo_id: data.accumulo_id,
          categoria: "accumulo",
          descrizione: (p.descrizione as string) ?? "Accumulo",
          quantita: 1,
          unita_misura: "pz",
          prezzo_unitario_netto: netto,
          prezzo_unitario_vendita: vendita,
          margine_pct: margine(vendita, netto),
          potenza_unitaria_w: null,
          potenza_unitaria_kw: null,
          capacita_kwh: (p.capacita_kwh as number) ?? data.capacita_accumulo_kwh,
          garanzia_anni: (p.garanzia_anni as number) ?? 10,
          ordinamento: 3,
        });
      } else {
        comp.push({
          articolo_id: null,
          categoria: "accumulo",
          descrizione: `Accumulo ${data.capacita_accumulo_kwh} kWh`,
          quantita: 1,
          unita_misura: "pz",
          prezzo_unitario_netto: 0,
          prezzo_unitario_vendita: data.capacita_accumulo_kwh * EURO_PER_KWH_ACCUMULO_GENERICO,
          margine_pct: null,
          potenza_unitaria_w: null,
          potenza_unitaria_kw: null,
          capacita_kwh: data.capacita_accumulo_kwh,
          garanzia_anni: 10,
          ordinamento: 3,
        });
      }
    }
  }

  // Prodotti extra dal listino (caldaia, clima, colonnina, …): righe con
  // categoria='altro' nello STESSO elenco dei componenti principali, così
  // sopravvivono al flusso delete+insert e il calcolo finanziario le somma
  // insieme a tutti gli altri componenti.
  data.prodotti_extra.forEach((ex, i) => {
    if (!ex.descrizione.trim() || !(ex.quantita > 0)) return;
    const vendita = Number(ex.prezzo_vendita) || 0;
    const netto = ex.prezzo_acquisto != null && ex.prezzo_acquisto > 0 ? Number(ex.prezzo_acquisto) : 0;
    comp.push({
      articolo_id: null,
      categoria: "altro",
      descrizione: ex.descrizione.trim(),
      quantita: ex.quantita,
      unita_misura: "pz",
      prezzo_unitario_netto: netto,
      prezzo_unitario_vendita: vendita,
      margine_pct: margine(vendita, netto),
      potenza_unitaria_w: null,
      potenza_unitaria_kw: null,
      capacita_kwh: null,
      garanzia_anni: null,
      ordinamento: 10 + i,
    });
  });

  return comp;
}
