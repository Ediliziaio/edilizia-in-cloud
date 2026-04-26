/**
 * Algoritmo selezione incentivi 2026 (§16-17).
 *
 * Logica:
 *   1. Genera candidati in base ad archetipo + ISEE + prima/seconda casa
 *   2. Applica regole di cumulabilità (§17.3)
 *   3. Sceglie l'opzione più conveniente (Reddito Energetico vs Detrazione 50%
 *      dipende da ISEE + capienza)
 *   4. Calcola importi specifici per ogni incentivo applicato
 */

import type {
  FvArchetipo,
  FvCodiceIncentivo,
  FvIncentivoApplicato,
  FvIncentivoCatalogo,
} from "./tipi";

// ─── Input dell'algoritmo ───────────────────────────────────────────────────

export interface InputSelezioneIncentivi {
  archetipo: FvArchetipo;
  prima_casa: boolean;
  isee: number | null;
  numero_figli: number;
  // dati impianto
  costo_totale: number;
  iva_aliquota_default: number; // es. 0.22 (per calcolare risparmio IVA 10)
  potenza_kwp: number;
  capacita_accumulo_kwh: number;
  // RID dati per stima ricavi
  energia_immessa_anno_kwh: number;
  prezzo_rid_kwh: number;
  durata_simulazione_anni: number; // default 25
  // CER
  popolazione_comune: number | null;
  // Transizione 5.0 (PMI)
  riduzione_consumi_pct?: number; // es. 0.10 per 10% riduzione
}

// ─── Funzione principale ────────────────────────────────────────────────────

/**
 * Dato un progetto e il catalogo incentivi caricato dal DB, ritorna gli
 * incentivi applicabili con relativi importi calcolati.
 */
export function selezionaIncentivi(
  input: InputSelezioneIncentivi,
  catalogo: FvIncentivoCatalogo[]
): FvIncentivoApplicato[] {
  const candidati: FvIncentivoApplicato[] = [];
  const get = (codice: string) => catalogo.find((c) => c.codice === codice);

  // ─── 1. PRIVATI (prima/seconda casa, ISEE basso) ──────────────────────────
  if (
    input.archetipo === "privato_prima" ||
    input.archetipo === "privato_seconda" ||
    input.archetipo === "privato_isee"
  ) {
    const accessoRE = haAccessoRedditoEnergetico(input);

    if (accessoRE) {
      const re = get("REDDITO_ENERGETICO");
      if (re) {
        const importo_re = calcolaRedditoEnergetico(
          input.potenza_kwp,
          input.capacita_accumulo_kwh,
          re.plafond_max_eur ?? 11000
        );
        candidati.push({
          codice: "REDDITO_ENERGETICO",
          nome: re.nome,
          tipo: "fondo_perduto",
          importo_eur: importo_re,
          durata_anni: 1,
        });
      }
    }

    // Detrazione 50/36 — alternativa al Reddito Energetico
    const detrazioneCodice: FvCodiceIncentivo = input.prima_casa
      ? "DETR_50_PRIMA"
      : "DETR_36_SECONDA";
    const det = get(detrazioneCodice);
    if (det) {
      const aliquota = det.aliquota ?? (input.prima_casa ? 0.5 : 0.36);
      const plafond = det.plafond_max_eur ?? 96000;
      const importo = Math.min(
        input.costo_totale * aliquota,
        plafond * aliquota
      );
      candidati.push({
        codice: detrazioneCodice,
        nome: det.nome,
        tipo: "detrazione_irpef",
        importo_eur: round2(importo),
        durata_anni: 10,
      });
    }
  }

  // ─── 2. PMI ───────────────────────────────────────────────────────────────
  if (input.archetipo === "pmi") {
    const amm = get("AMMORTAMENTO_PMI");
    if (amm) {
      // Ammortamento 4% annuo per 25 anni → recupero del 100% del costo
      // Vedi §16.7. Modello W1 semplificato: importo totale recuperato.
      candidati.push({
        codice: "AMMORTAMENTO_PMI",
        nome: amm.nome,
        tipo: "deducibilita_fiscale",
        importo_eur: round2(input.costo_totale * 0.04 * 25), // 4%/anno × 25 anni
        durata_anni: 25,
      });
    }

    // Transizione 5.0 (se idonea)
    if (
      input.riduzione_consumi_pct !== undefined &&
      input.riduzione_consumi_pct >= 0.05
    ) {
      const t50 = get("TRANSIZIONE_5_0");
      if (t50) {
        // Aliquota crescente 35-45% in base a riduzione consumi
        const aliquota =
          input.riduzione_consumi_pct >= 0.15
            ? 0.45
            : input.riduzione_consumi_pct >= 0.10
            ? 0.40
            : 0.35;
        candidati.push({
          codice: "TRANSIZIONE_5_0",
          nome: t50.nome,
          tipo: "deducibilita_fiscale",
          importo_eur: round2(input.costo_totale * aliquota),
          durata_anni: null,
        });
      }
    }
  }

  // ─── 3. Sempre applicabili ────────────────────────────────────────────────
  // IVA 10% (se uso abitativo)
  if (
    input.archetipo === "privato_prima" ||
    input.archetipo === "privato_seconda" ||
    input.archetipo === "privato_isee"
  ) {
    const iva = get("IVA_10");
    if (iva) {
      // Risparmio: differenza tra IVA standard (22%) e agevolata (10%) sul
      // prezzo netto. Importo = costo_netto × (0.22 - 0.10) → negativo quindi
      // il "risparmio" è positivo per il cliente.
      const costo_netto = input.costo_totale / (1 + input.iva_aliquota_default);
      const risparmio_iva = costo_netto * (0.22 - 0.10);
      candidati.push({
        codice: "IVA_10",
        nome: iva.nome,
        tipo: "sconto_iva",
        importo_eur: round2(risparmio_iva),
        durata_anni: null,
      });
    }
  }

  // RID — sempre applicabile a chi immette in rete
  const rid = get("RID");
  if (rid && input.energia_immessa_anno_kwh > 0) {
    // Ricavi 25 anni con inflazione 2%
    let ricavi_totali = 0;
    for (let n = 1; n <= input.durata_simulazione_anni; n++) {
      ricavi_totali +=
        input.energia_immessa_anno_kwh *
        input.prezzo_rid_kwh *
        Math.pow(1.02, n - 1);
    }
    candidati.push({
      codice: "RID",
      nome: rid.nome,
      tipo: "tariffa_incentivante",
      importo_eur: round2(ricavi_totali),
      durata_anni: input.durata_simulazione_anni,
    });
  }

  // CER segnalazione (W1 informativa)
  if (
    input.popolazione_comune !== null &&
    input.popolazione_comune < 50000
  ) {
    const cer = get("CER_INFO");
    if (cer) {
      candidati.push({
        codice: "CER_INFO",
        nome: cer.nome,
        tipo: "informativa",
        importo_eur: null,
        durata_anni: 20,
        info: "Bonus PNRR del 40% disponibile in questa zona — contatta il referente CER per attivarlo",
      });
    }
  }

  // ─── 4. Applica regole cumulabilità ───────────────────────────────────────
  return applicaRegoleCumulabilita(candidati, catalogo);
}

// ─── Helper: accesso Reddito Energetico (§16.3) ────────────────────────────

export function haAccessoRedditoEnergetico(input: {
  archetipo: FvArchetipo;
  prima_casa: boolean;
  isee: number | null;
  numero_figli: number;
}): boolean {
  // Solo prima casa
  if (!input.prima_casa) return false;
  // Solo persone fisiche
  if (input.archetipo === "pmi") return false;
  // Soglia ISEE: 15.000 base, 30.000 se 4+ figli
  const sogliaIsee = input.numero_figli >= 4 ? 30000 : 15000;
  return input.isee !== null && input.isee <= sogliaIsee;
}

// ─── Helper: calcolo Reddito Energetico (§16.3) ────────────────────────────

export function calcolaRedditoEnergetico(
  potenza_kwp: number,
  capacita_accumulo_kwh: number,
  plafond_max_eur: number
): number {
  // 2.000 €/kWp + 1.500 €/kWh accumulo, capped a plafond_max
  const importo = potenza_kwp * 2000 + capacita_accumulo_kwh * 1500;
  return round2(Math.min(importo, plafond_max_eur));
}

// ─── Helper: regole cumulabilità (§17.3) ───────────────────────────────────

function applicaRegoleCumulabilita(
  candidati: FvIncentivoApplicato[],
  catalogo: FvIncentivoCatalogo[]
): FvIncentivoApplicato[] {
  // Reddito Energetico esclude detrazione 50/36 — scegli il più conveniente
  const idxRE = candidati.findIndex((c) => c.codice === "REDDITO_ENERGETICO");
  const idxDET50 = candidati.findIndex((c) => c.codice === "DETR_50_PRIMA");
  const idxDET36 = candidati.findIndex((c) => c.codice === "DETR_36_SECONDA");
  const idxDETR = idxDET50 >= 0 ? idxDET50 : idxDET36;

  if (idxRE >= 0 && idxDETR >= 0) {
    const re = candidati[idxRE];
    const det = candidati[idxDETR];
    const valoreRE = re.importo_eur ?? 0;
    // Per la detrazione consideriamo l'importo recuperato in 10 anni a oggi
    // ma scontato del 4% NPV. Modello W1 semplificato: usiamo importo nominale.
    const valoreDET = det.importo_eur ?? 0;

    if (valoreRE > valoreDET) {
      // RE vince → rimuovo detrazione
      candidati.splice(idxDETR, 1);
    } else {
      // Detrazione vince → rimuovo RE
      candidati.splice(idxRE, 1);
    }
  }

  // Transizione 5.0 esclude DETR (già sopra) — applico stessa logica anche
  // per PMI con detrazione (caso raro ma possibile).
  return candidati;
}

// ─── Importo totale incentivi (per UI/PDF) ──────────────────────────────────

export function importoTotaleIncentivi(incentivi: FvIncentivoApplicato[]): number {
  return round2(
    incentivi.reduce((sum, i) => sum + (i.importo_eur ?? 0), 0)
  );
}

// ─── Helper round ──────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
