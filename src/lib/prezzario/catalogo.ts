import type { PrezzarioCapitolo, PrezzarioVoce } from "./tipi";
import type { UnitaFatturazione } from "@/lib/tariffe/prezziarioImport";
import {
  gruppoLavorazione,
  oggettoCampi,
} from "@/lib/tariffe/costoLavorazione";

/** Include i sottocapitoli, senza dipendere dall'ordine restituito dal server. */
export function capitoliDiscendenti(
  capitoli: PrezzarioCapitolo[],
  id: string,
): string[] {
  const ids = new Set([id]);
  let cambiato = true;
  while (cambiato) {
    cambiato = false;
    for (const c of capitoli)
      if (c.parent_id && ids.has(c.parent_id) && !ids.has(c.id)) {
        ids.add(c.id);
        cambiato = true;
      }
  }
  return [...ids];
}

export function percorsoCapitolo(
  capitoli: PrezzarioCapitolo[],
  id: string | null,
): string {
  const parti: string[] = [];
  const visti = new Set<string>();
  let corrente = id;
  while (corrente && !visti.has(corrente)) {
    visti.add(corrente);
    const c = capitoli.find((c) => c.id === corrente);
    if (!c) break;
    parti.unshift([c.codice, c.titolo].filter(Boolean).join(" · "));
    corrente = c.parent_id;
  }
  return parti.join(" / ") || "Senza capitolo";
}

export function erroreVoce(v: PrezzarioVoce): string | null {
  if (!v.descrizione.trim()) return "Descrizione mancante";
  if (!Number.isFinite(Number(v.prezzo)) || Number(v.prezzo) <= 0)
    return "Prezzo non valido";
  if (!v.unita_misura?.trim()) return "Unità di misura da indicare";
  return null;
}

/** Quante unità aziendali contiene UNA unità del prezzario. Il prezzo va diviso per questo numero. */
export function conversioneUnitaTariffa(
  raw: string | null,
): { unita: UnitaFatturazione; fattore: number } | null {
  const um = (raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const dirette: Record<string, UnitaFatturazione> = {
    cad: "pz",
    cadauno: "pz",
    pz: "pz",
    n: "pz",
    nr: "pz",
    "n.": "pz",
    mq: "mq",
    "m²": "mq",
    m2: "mq",
    ml: "ml",
    m: "ml",
    mt: "ml",
    mc: "mc",
    "m³": "mc",
    m3: "mc",
    kg: "kg",
    h: "h",
    ora: "h",
    ore: "h",
    gg: "gg",
    giorno: "gg",
    giorni: "gg",
    a_corpo: "a_corpo",
    "a corpo": "a_corpo",
    corpo: "a_corpo",
    fisso: "a_corpo",
    km: "km",
    piano: "piano",
  };
  if (dirette[um]) return { unita: dirette[um], fattore: 1 };
  const convertite: Record<
    string,
    { unita: UnitaFatturazione; fattore: number }
  > = {
    t: { unita: "kg", fattore: 1000 },
    ton: { unita: "kg", fattore: 1000 },
    q: { unita: "kg", fattore: 100 },
    l: { unita: "mc", fattore: 0.001 },
    ha: { unita: "mq", fattore: 10000 },
    cm: { unita: "ml", fattore: 0.01 },
    dm: { unita: "ml", fattore: 0.1 },
    "dm³": { unita: "mc", fattore: 0.001 },
    dmc: { unita: "mc", fattore: 0.001 },
    min: { unita: "h", fattore: 1 / 60 },
    paio: { unita: "pz", fattore: 2 },
  };
  if (convertite[um]) return convertite[um];
  const multipla = um.match(/^(\d+(?:[.,]\d+)?) (cad|pz|kg|mq|m²)$/);
  if (multipla && Number(multipla[1].replace(",", ".")) > 0) {
    return {
      unita: dirette[multipla[2]],
      fattore: Number(multipla[1].replace(",", ".")),
    };
  }
  // Unità composite e unità sconosciute non diventano mai «pz» per supposizione.
  return null;
}

export function prezziTariffaRegionale(v: PrezzarioVoce, ricarico = 0) {
  const conversione = conversioneUnitaTariffa(v.unita_misura);
  if (!conversione) return null;
  const base = Number(v.prezzo) / conversione.fattore;
  return {
    costo: Math.round(base * 1e4) / 1e4,
    vendita: Math.round(base * (1 + ricarico / 100) * 1e4) / 1e4,
  };
}

export function erroreVoceTariffa(
  v: PrezzarioVoce,
  ricarico = 0,
): string | null {
  const errore = erroreVoce(v);
  if (errore) return errore;
  const c = conversioneUnitaTariffa(v.unita_misura);
  if (!c) return "Unità non supportata dal listino servizi";
  if (!Number.isFinite(ricarico) || ricarico < 0) return "Ricarico non valido";
  const p = prezziTariffaRegionale(v, ricarico)!;
  if (p.costo <= 0 || p.vendita <= 0 || p.costo >= 1e8 || p.vendita >= 1e8)
    return "Prezzo convertito fuori dai limiti del listino";
  // Non perdere più di mezzo centesimo per UNA unità originale del prezzario.
  if (
    Math.abs(p.costo * c.fattore - Number(v.prezzo)) > 0.005001 ||
    Math.abs(p.vendita * c.fattore - Number(v.prezzo) * (1 + ricarico / 100)) >
      0.005001
  )
    return "La conversione perderebbe precisione: unità originale da gestire";
  return null;
}

export function categoriaPrezzarioTariffa(t: {
  custom_field_values?: unknown;
}): string | null {
  const p = oggettoCampi(oggettoCampi(t.custom_field_values)._prezzario);
  return typeof p.capitolo_nome === "string" ? p.capitolo_nome : null;
}

export function campiProvenienza(
  v: PrezzarioVoce,
  capitoli: PrezzarioCapitolo[],
) {
  const capitolo = percorsoCapitolo(capitoli, v.capitolo_id);
  return {
    _prezzario: {
      fonte_id: v.fonte_id,
      voce_id: v.id,
      capitolo_id: v.capitolo_id,
      capitolo_nome: capitolo,
      unita_originale:
        v.unita_misura_originale === undefined
          ? v.unita_misura
          : v.unita_misura_originale,
      unita_integrata: v.unita_misura_originale !== undefined,
      prezzo_originale: Number(v.prezzo),
    },
    _gruppo_lavorazione: gruppoLavorazione({
      nome: `${v.descrizione} ${capitolo}`,
      tipo: "altro",
    }),
  };
}

/** Identità stabile: un nuovo tentativo non duplica e non sovrascrive la voce già adottata. */
export async function idVoceAdottata(
  azienda: string,
  destinazione: string,
  voceId: string,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`prezzario:${destinazione}:${azienda}:${voceId}`),
  );
  const b = new Uint8Array(digest).slice(0, 16);
  b[6] = (b[6] & 15) | 128;
  b[8] = (b[8] & 63) | 128;
  const h = [...b].map((n) => n.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
