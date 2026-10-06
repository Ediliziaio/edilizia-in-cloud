/**
 * FotovoltaicoWizard — helpers
 * Estratto da FotovoltaicoWizard.tsx (MP-MKT-001).
 *
 * NOTA FISCALE: la logica capienza IRPEF / ISEE è semplice validazione
 * client-side per UX. I calcoli reali di detrazione 50% / capienza fiscale
 * sono in edge function (fvCalcoli.ts). Non duplicare logica fiscale qui.
 */
import type { FvArchetipo } from "@/lib/fotovoltaico/tipi";
import {
  ITALIA_LAT_MAX, ITALIA_LAT_MIN, ITALIA_LNG_MAX, ITALIA_LNG_MIN,
  LS_KEY_PREFIX, LS_KEY_NEW, DRAFT_TTL_MS, INITIAL, TOTAL_STEPS,
} from "./constants";
import type { PersistedDraft, WizardData } from "./types";

export function isCoordinataItalia(lat: number | null, lng: number | null): boolean {
  if (lat == null || lng == null) return false;
  return (
    lat >= ITALIA_LAT_MIN &&
    lat <= ITALIA_LAT_MAX &&
    lng >= ITALIA_LNG_MIN &&
    lng <= ITALIA_LNG_MAX
  );
}

/**
 * Valida che ISEE sia coerente con il reddito annuo dichiarato.
 * Una ISEE molto più alta del reddito è statisticamente impossibile (ISEE
 * include patrimonio e composizione famiglia, ma raramente è > 3× reddito).
 */
export function validaIseeReddito(
  isee: number | null,
  reddito: number | null,
): string | null {
  if (isee == null || reddito == null) return null;
  if (reddito > 0 && isee > reddito * 3) {
    return "ISEE incoerente: dichiarato > 3× del reddito annuo. Verifica i dati prima di proseguire.";
  }
  return null;
}

/**
 * Verifica che il reddito sia compatibile con la richiesta di detrazione 50%.
 * Sotto 8.500 € (No Tax Area) la detrazione non è recuperabile in IRPEF.
 */
export function calcolaCapienzaWarning(
  archetipo: FvArchetipo,
  reddito: number | null,
): string | null {
  if (archetipo !== "privato_prima" && archetipo !== "privato_seconda") return null;
  if (reddito != null && reddito < 8500) {
    return "Reddito sotto la No Tax Area (8.500 €). La detrazione 50% IRPEF non sarà recuperabile in 10 anni — valuta cessione del credito o sconto in fattura con il commercialista.";
  }
  return null;
}

// ─── Persistenza locale draft ──────────────────────────────────────────────

const NULLABLE_NUMBER_FIELDS: Array<keyof WizardData> = [
  "popolazione_comune",
  "latitudine",
  "longitudine",
  "superficie_immobile_mq",
  "consumo_annuo_kwh",
  "isee",
  "reddito_annuo_dichiarato",
  "ore_sole_annue",
  "superficie_tetto_disponibile_mq",
  "numero_pannelli_max",
  "potenza_max_kwp",
  "durata_mesi_scelta",
  "inclinazione_tetto",
  "kit_prezzo",
  "prezzo_vendita_manuale",
  "sconto_valore",
];

const NULLABLE_STRING_FIELDS: Array<keyof WizardData> = [
  "cliente_id",
  "qualita_dati_tetto",
  "imagery_date",
  "pannello_id",
  "inverter_id",
  "accumulo_id",
  "tariffa_installazione_id",
  "tabella_finanziamento_id",
  "azimut_tetto",
  "kit_bundle_id",
  "kit_nome",
];

const ALLOWED_VALUES: Partial<Record<keyof WizardData, readonly string[]>> = {
  archetipo: [
    "privato_prima",
    "privato_seconda",
    "privato_isee",
    "pmi",
    "condominio",
    "cer",
    "industriale_grande",
  ],
  tariffa_tipo: ["monoraria", "bioraria", "trioraria"],
  profilo_consumo: ["sera", "misto", "giorno", "sempre", "pmi_diurno", "pmi_h24"],
  fonte_dati_tetto: ["solar_api", "pvgis", "manuale"],
  finanziamento_modalita: ["cash", "rate", "zero", "noleggio"],
};

/**
 * Chiave del draft locale. Per i progetti già creati la chiave è per-id; per
 * il preventivo NUOVO (pre-creazione) la chiave è scoped per azienda (`scope`):
 * la vecchia chiave globale unica faceva riapparire la bozza di un'azienda
 * dentro un'altra (browser condiviso / multi-company).
 */
function draftKey(progettoId: string | null, scope?: string | null): string {
  if (progettoId) return `${LS_KEY_PREFIX}${progettoId}`;
  return scope ? `${LS_KEY_NEW}::${scope}` : LS_KEY_NEW;
}

function removeDraftKey(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* localStorage disabilitata o non accessibile: niente crash nel wizard */
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clampStep(value: unknown): number {
  if (!isFiniteNumber(value)) return 1;
  return Math.min(TOTAL_STEPS, Math.max(1, Math.round(value)));
}

function normalizeCompletedSteps(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  const steps: number[] = [];

  value.forEach((candidate) => {
    if (!isFiniteNumber(candidate)) return;
    const step = Math.round(candidate);
    if (step < 1 || step > TOTAL_STEPS || seen.has(step)) return;
    seen.add(step);
    steps.push(step);
  });

  return steps;
}

// Campi che non sono un numero o un testo: le righe di manodopera, servizi e prodotti extra, lo schema
// di pagamento, la geometria del tetto. Prima la rilettura li scartava tutti, e il resto del wizard
// (che per le righe preferisce la bozza, se non è vuota, al database) ritrovava quelle ultime
// righe della Fase 5 vuote, senza nessun avviso. Ogni funzione tiene quello che è valido e scarta il
// resto: `undefined` vuol dire «non usare niente», cioè restano i valori iniziali.
const testo = (v: unknown): string => (typeof v === "string" ? v : "");
const testoOnull = (v: unknown): string | null => (typeof v === "string" ? v : null);
const numeroOzero = (v: unknown): number => (isFiniteNumber(v) ? v : 0);
// Come quando le stesse righe si rileggono dal database: una quantità che non c'è è un pezzo.
const quantitaOuno = (v: unknown): number => (isFiniteNumber(v) && v > 0 ? v : 1);

function righeValide<T>(value: unknown, riga: (r: Record<string, unknown>) => T): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(isRecord).map(riga);
}

function sanitizzaProdottiExtra(value: unknown): WizardData["prodotti_extra"] | undefined {
  return righeValide(value, (r) => ({
    ...(typeof r.uid === "string" ? { uid: r.uid } : {}),
    listino_id: testoOnull(r.listino_id),
    descrizione: testo(r.descrizione),
    quantita: quantitaOuno(r.quantita),
    prezzo_vendita: numeroOzero(r.prezzo_vendita),
    prezzo_acquisto: isFiniteNumber(r.prezzo_acquisto) ? r.prezzo_acquisto : null,
  }));
}

function sanitizzaManodopera(value: unknown): WizardData["manodopera_righe"] | undefined {
  return righeValide(value, (r) => ({
    tariffa_id: testoOnull(r.tariffa_id),
    descrizione: testo(r.descrizione),
    ore: numeroOzero(r.ore),
    tariffa_oraria_netta: numeroOzero(r.tariffa_oraria_netta),
    tariffa_oraria_vendita: numeroOzero(r.tariffa_oraria_vendita),
  }));
}

function sanitizzaServizi(value: unknown): WizardData["servizi_righe"] | undefined {
  return righeValide(value, (r) => ({
    tipo: typeof r.tipo === "string" && r.tipo ? r.tipo : "altro",
    descrizione: testo(r.descrizione),
    quantita: quantitaOuno(r.quantita),
    prezzo_netto: numeroOzero(r.prezzo_netto),
    prezzo_vendita: numeroOzero(r.prezzo_vendita),
    note_operative: testoOnull(r.note_operative),
  }));
}

function sanitizzaModalitaPagamento(value: unknown): WizardData["modalita_pagamento"] | undefined {
  if (!isRecord(value)) return undefined;
  const tranche = righeValide(value.tranche, (t) => ({ label: testo(t.label), pct: numeroOzero(t.pct) }));
  if (!tranche || tranche.length === 0) return undefined;
  return {
    tranche,
    note: testoOnull(value.note),
    ...(isFiniteNumber(value.anticipo_pct) ? { anticipo_pct: value.anticipo_pct } : {}),
  };
}

function sanitizzaLayoutTetto(value: unknown): WizardData["layout_tetto"] | undefined {
  if (!Array.isArray(value)) return undefined;
  const pannelli: NonNullable<WizardData["layout_tetto"]> = [];
  for (const p of value) {
    if (!isRecord(p) || !isFiniteNumber(p.centro_lat) || !isFiniteNumber(p.centro_lng)) continue;
    pannelli.push({
      centro_lat: p.centro_lat,
      centro_lng: p.centro_lng,
      ...(p.orientamento === "LANDSCAPE" || p.orientamento === "PORTRAIT" ? { orientamento: p.orientamento } : {}),
      ...(isFiniteNumber(p.segment_index) ? { segment_index: p.segment_index } : {}),
    });
  }
  return pannelli.length > 0 ? pannelli : null;
}

function sanitizzaLayoutOverlay(value: unknown): WizardData["layout_overlay"] | undefined {
  if (!isRecord(value)) return undefined;
  const { x, y, rot, cols } = value;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(rot) || !isFiniteNumber(cols)) return undefined;
  return { x, y, rot, cols };
}

const CAMPI_STRUTTURATI: Partial<Record<keyof WizardData, (candidate: unknown) => unknown>> = {
  prodotti_extra: sanitizzaProdottiExtra,
  manodopera_righe: sanitizzaManodopera,
  servizi_righe: sanitizzaServizi,
  modalita_pagamento: sanitizzaModalitaPagamento,
  layout_tetto: (v) => (v === null ? null : sanitizzaLayoutTetto(v)),
  layout_overlay: (v) => (v === null ? null : sanitizzaLayoutOverlay(v)),
};

function normalizeWizardData(value: unknown): WizardData | null {
  if (!isRecord(value)) return null;

  const normalized = { ...INITIAL };
  const raw = value as Partial<Record<keyof WizardData, unknown>>;

  (Object.keys(INITIAL) as Array<keyof WizardData>).forEach((key) => {
    const candidate = raw[key];
    if (candidate === undefined) return;

    const strutturato = CAMPI_STRUTTURATI[key];
    if (strutturato) {
      const valore = strutturato(candidate);
      if (valore !== undefined) (normalized as Record<keyof WizardData, unknown>)[key] = valore;
      return;
    }

    const allowed = ALLOWED_VALUES[key];
    if (allowed) {
      if (typeof candidate === "string" && allowed.includes(candidate)) {
        (normalized as Record<keyof WizardData, unknown>)[key] = candidate;
      }
      return;
    }

    const initialValue = INITIAL[key];
    if (typeof initialValue === "string") {
      if (typeof candidate === "string") {
        (normalized as Record<keyof WizardData, unknown>)[key] = candidate;
      }
      return;
    }

    if (typeof initialValue === "number") {
      if (isFiniteNumber(candidate)) {
        (normalized as Record<keyof WizardData, unknown>)[key] = candidate;
      }
      return;
    }

    if (typeof initialValue === "boolean") {
      if (typeof candidate === "boolean") {
        (normalized as Record<keyof WizardData, unknown>)[key] = candidate;
      }
      return;
    }

    if (initialValue === null) {
      if (candidate === null) {
        (normalized as Record<keyof WizardData, unknown>)[key] = null;
      } else if (NULLABLE_NUMBER_FIELDS.includes(key) && isFiniteNumber(candidate)) {
        (normalized as Record<keyof WizardData, unknown>)[key] = candidate;
      } else if (NULLABLE_STRING_FIELDS.includes(key) && typeof candidate === "string") {
        (normalized as Record<keyof WizardData, unknown>)[key] = candidate;
      }
    }
  });

  return normalized;
}

export function validatePersistedDraft(value: unknown): PersistedDraft | null {
  if (!isRecord(value) || !isFiniteNumber(value.savedAt)) return null;

  const data = normalizeWizardData(value.data);
  if (!data) return null;

  return {
    step: clampStep(value.step),
    data,
    completedSteps: normalizeCompletedSteps(value.completedSteps),
    savedAt: value.savedAt,
  };
}

export function loadPersistedDraft(progettoId: string | null, scope?: string | null): PersistedDraft | null {
  if (typeof window === "undefined") return null;
  // Migrazione: la vecchia chiave globale non-scoped viene eliminata (non
  // adottata: potrebbe appartenere a un'altra azienda sullo stesso browser).
  if (!progettoId && scope) removeDraftKey(LS_KEY_NEW);
  const key = draftKey(progettoId, scope);
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = validatePersistedDraft(JSON.parse(raw));
    if (!parsed) {
      removeDraftKey(key);
      return null;
    }
    if (Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      removeDraftKey(key);
      return null;
    }
    return parsed;
  } catch {
    removeDraftKey(key);
    return null;
  }
}

export function savePersistedDraft(
  progettoId: string | null,
  draft: Omit<PersistedDraft, "savedAt">,
  scope?: string | null,
): void {
  if (typeof window === "undefined") return;
  try {
    const key = draftKey(progettoId, scope);
    window.localStorage.setItem(
      key,
      JSON.stringify({ ...draft, savedAt: Date.now() }),
    );
  } catch {
    /* localStorage piena/disabilitata: degrade silently */
  }
}

export function clearPersistedDraft(progettoId: string | null, scope?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(draftKey(progettoId, scope));
    // Rimuove anche l'eventuale residuo legacy non-scoped.
    if (!progettoId) window.localStorage.removeItem(LS_KEY_NEW);
  } catch {
    /* noop */
  }
}

// (WizardData importato dai chiamanti via "./types")
