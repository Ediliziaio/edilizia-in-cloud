/**
 * Parametri del costo del personale per tipo di dipendente — gemello di
 * `costo_personale_preset()` e `profilo_costo_dipendente()` nel database.
 *
 * costo orario = lordo mensile × mensilità × (100 + oneri %) / (ore del mese × 12 × ore produttive %)
 * oneri % = INPS (della persona, se scritta, altrimenti del tipo) + INAIL + Cassa Edile + TFR + altro
 *
 * I valori di partenza sono quelli dell'edilizia (CCNL industria) e sono indicativi:
 * l'INAIL dipende dalla voce di tariffa dell'azienda, il consulente del lavoro sa quella giusta.
 */

export type ProfiloCosto = "operaio" | "apprendista" | "impiegato";
export const PROFILI_COSTO: ProfiloCosto[] = ["operaio", "apprendista", "impiegato"];

export interface ParametriCosto {
  mensilita: number;
  inps: number;
  inail: number;
  cassa_edile: number;
  tfr: number;
  altri: number;
  ore_produttive: number;
}

/** Valori dell'azienda per tipo; un tipo assente usa quelli edili. */
export type ParametriCostoAzienda = Partial<Record<ProfiloCosto, ParametriCosto>>;

export const PRESET_EDILIZIA: Record<ProfiloCosto, ParametriCosto> = {
  operaio: { mensilita: 12, inps: 29.6, inail: 8, cassa_edile: 22, tfr: 7.41, altri: 0, ore_produttive: 90 },
  apprendista: { mensilita: 12, inps: 11.61, inail: 8, cassa_edile: 22, tfr: 7.41, altri: 0, ore_produttive: 85 },
  impiegato: { mensilita: 14, inps: 29.6, inail: 0.5, cassa_edile: 0, tfr: 7.41, altri: 0, ore_produttive: 84 },
};

export const ETICHETTA_PROFILO: Record<ProfiloCosto, string> = {
  operaio: "Operaio",
  apprendista: "Apprendista",
  impiegato: "Impiegato",
};

export interface DatiProfilo {
  profilo_costo?: string | null;
  role_type?: string | null;
  qualifica?: string | null;
  area?: string | null;
}

/** Tipo scelto sulla scheda, oppure ricavato da ruolo e qualifica (come nel database). */
export function profiloCostoDipendente(e: DatiProfilo): ProfiloCosto {
  const scelto = e.profilo_costo;
  if (scelto === "operaio" || scelto === "apprendista" || scelto === "impiegato") return scelto;
  const ruolo = (e.role_type ?? "").toLowerCase();
  if ((e.qualifica ?? "").toLowerCase().includes("apprendist") || ruolo.includes("apprendist")) return "apprendista";
  if (["impiegato", "staff_interno", "impiegata", "amministrazione"].includes(ruolo)
    || (e.area ?? "").toLowerCase() === "amministrazione") return "impiegato";
  return "operaio";
}

export function parametriDelProfilo(profilo: ProfiloCosto, azienda?: ParametriCostoAzienda | null): ParametriCosto {
  return azienda?.[profilo] ?? PRESET_EDILIZIA[profilo];
}

/** Oneri in percentuale sul lordo, con l'INPS della persona quando è scritta. */
export function oneriPercento(p: ParametriCosto, inpsPersona?: number | null): number {
  const inps = inpsPersona != null && Number.isFinite(inpsPersona) ? inpsPersona : p.inps;
  return Math.round((inps + p.inail + p.cassa_edile + p.tfr + p.altri) * 100) / 100;
}

/** Costo vero di un mese medio: lordo × mensilità / 12 × (1 + oneri). Per i costi di struttura. */
export function costoMensileVero(
  e: DatiProfilo & { gross_salary?: number | string | null; inps_rate?: number | string | null },
  azienda?: ParametriCostoAzienda | null,
): number {
  const lordo = Number(e.gross_salary);
  if (!Number.isFinite(lordo) || lordo <= 0) return 0;
  const p = parametriDelProfilo(profiloCostoDipendente(e), azienda);
  const inps = e.inps_rate == null || e.inps_rate === "" ? null : Number(e.inps_rate);
  // In centesimi; toFixed toglie l'errore binario prima di arrotondare (240642,5 non diventa 240642,4999…).
  return Math.round(Number((lordo * p.mensilita * (100 + oneriPercento(p, inps)) / 12).toFixed(6))) / 100;
}

const CAMPI: (keyof ParametriCosto)[] = ["mensilita", "inps", "inail", "cassa_edile", "tfr", "altri", "ore_produttive"];

/** Righe di costo_personale_parametri → mappa per tipo. Righe incomplete vengono ignorate. */
export function parametriDaRighe(righe: ReadonlyArray<Record<string, unknown>> | null | undefined): ParametriCostoAzienda {
  const out: ParametriCostoAzienda = {};
  for (const r of righe ?? []) {
    const profilo = r.profilo as ProfiloCosto;
    if (!PROFILI_COSTO.includes(profilo)) continue;
    const valori = {} as ParametriCosto;
    let ok = true;
    for (const c of CAMPI) {
      const n = Number(r[c]);
      if (r[c] == null || !Number.isFinite(n)) { ok = false; break; }
      valori[c] = n;
    }
    if (ok) out[profilo] = valori;
  }
  return out;
}
