/**
 * I rapportini che l'ufficio scrive dalla commessa (31/10/2026): uno per giorno,
 * anche più giorni insieme. Modulo puro: dalla bozza della finestra a quello che
 * riceve ufficio_crea_rapportini. Le fasi lavorate hanno lo stesso formato del
 * rapportino del cantiere (fasiLavorateDelRapportino), così l'approvazione le
 * tratta allo stesso modo.
 */
import { fasiLavorateDelRapportino, type Sottofase } from "@/lib/orders/sottofasi";

export type StatoSottofaseGiorno = "lavorata" | "finita";

export interface GiornoUfficio {
  chiave: string;
  data: string;
  /** Vuoto = chi scrive (l'ufficio). */
  autore: string;
  descrizione: string;
  note: string;
  fasi: string[];
  sottofasi: Record<string, StatoSottofaseGiorno>;
}

const piuUno = (d: string) => {
  const [a, m, g] = d.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, g + 1)).toISOString().slice(0, 10);
};

export function giornoVuoto(oggi: string, chiave: string, dopo?: GiornoUfficio): GiornoUfficio {
  // Il giorno dopo il precedente (mai nel futuro), con la stessa persona e le stesse fasi.
  const data = dopo ? (piuUno(dopo.data) > oggi ? oggi : piuUno(dopo.data)) : oggi;
  return { chiave, data, autore: dopo?.autore ?? "", descrizione: "", note: "", fasi: dopo ? [...dopo.fasi] : [], sottofasi: {} };
}

/** Cosa manca prima di salvare; vuoto se si può. */
export function erroriGiorni(giorni: ReadonlyArray<GiornoUfficio>, oggi: string): string[] {
  const errori: string[] = [];
  const visti = new Set<string>();
  giorni.forEach((g, i) => {
    const n = giorni.length > 1 ? ` (giorno ${i + 1})` : "";
    if (!g.data) errori.push(`Manca la data${n}.`);
    else if (g.data > oggi) errori.push(`La data non può essere nel futuro${n}.`);
    if (!g.descrizione.trim()) errori.push(`Scrivi cosa si è fatto${n}.`);
    const chiave = `${g.data}|${g.autore}`;
    if (g.data && visti.has(chiave)) errori.push(`Due rapportini della stessa persona lo stesso giorno${n}.`);
    visti.add(chiave);
  });
  return errori;
}

/** Il carico per ufficio_crea_rapportini. */
export function caricoRapportini(
  giorni: ReadonlyArray<GiornoUfficio>,
  fasi: ReadonlyArray<{ id: string; percentuale: number }>,
  sottofasiDi: ReadonlyMap<string, ReadonlyArray<Pick<Sottofase, "id" | "peso" | "fatta">>>,
) {
  const percentuale = new Map(fasi.map((f) => [f.id, f.percentuale]));
  return giorni.map((g) => {
    const dichiarate = Object.fromEntries(g.fasi.map((id) => [id, percentuale.get(id) ?? 0]));
    const finite = Object.entries(g.sottofasi).filter(([, s]) => s === "finita").map(([id]) => id);
    const lavorate = Object.entries(g.sottofasi).filter(([, s]) => s === "lavorata").map(([id]) => id);
    return {
      data_lavoro: g.data,
      autore: g.autore || null,
      descrizione: g.descrizione.trim(),
      note: g.note.trim() || null,
      fasi_lavorate: fasiLavorateDelRapportino(dichiarate, sottofasiDi, finite, lavorate),
    };
  });
}
