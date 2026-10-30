/**
 * I rapportini che l'ufficio scrive dalla commessa (31/10/2026): uno per giorno,
 * anche più giorni insieme, completi come quelli del cantiere: fasi con
 * l'avanzamento, chi ha lavorato e le ore di ognuno, foto, materiali, mezzi
 * usati, meteo, note. Modulo puro: dalla bozza della finestra a quello che
 * riceve ufficio_crea_rapportini. Le fasi lavorate hanno lo stesso formato del
 * rapportino del cantiere (fasiLavorateDelRapportino), così l'approvazione le
 * tratta allo stesso modo.
 */
import { fasiLavorateDelRapportino, type Sottofase } from "@/lib/orders/sottofasi";

export type StatoSottofaseGiorno = "lavorata" | "finita";

/** I cinque valori del cantiere (campo_rapportini_meteo_check). */
export const METEO = [
  { value: "soleggiato", label: "Sole" }, { value: "nuvoloso", label: "Nuvoloso" }, { value: "pioggia", label: "Pioggia" },
  { value: "neve", label: "Neve" }, { value: "vento", label: "Vento" },
] as const;

/** Chi può comparire nelle presenze: un dipendente (ore e costo) o una ditta (solo presenza). */
export interface PersonaPresenza { chiave: string; nome: string; employee_id?: string; subappaltatore_id?: string }

export interface GiornoUfficio {
  chiave: string;
  data: string;
  /** Vuoto = chi scrive (l'ufficio). */
  autore: string;
  descrizione: string;
  note: string;
  fasi: string[];
  sottofasi: Record<string, StatoSottofaseGiorno>;
  /** Avanzamento dichiarato per fase, 0-100: se manca resta quello di adesso. */
  percentuali?: Record<string, number>;
  /** Chiave della persona → ore scritte («7,5»). */
  presenze?: Record<string, string>;
  /** Mezzo → ore d'uso scritte (vuoto = usato, ore non dette). */
  mezzi?: Record<string, string>;
  /** Articolo della commessa → quantità scritta. */
  materiali?: Record<string, string>;
  foto?: string[];
  meteo?: string;
}

/** «7,5» → 7.5; vuoto o non numero → null. */
export function oreLette(v: string | undefined): number | null {
  if (v == null || !v.trim()) return null;
  const n = Number(v.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const piuUno = (d: string) => {
  const [a, m, g] = d.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, g + 1)).toISOString().slice(0, 10);
};

export function giornoVuoto(oggi: string, chiave: string, dopo?: GiornoUfficio): GiornoUfficio {
  // Il giorno dopo il precedente (mai nel futuro), con la stessa persona e le stesse fasi.
  const data = dopo ? (piuUno(dopo.data) > oggi ? oggi : piuUno(dopo.data)) : oggi;
  // Chi c'era e i mezzi si ripetono spesso giorno per giorno: si copiano, le foto no.
  return {
    chiave, data, autore: dopo?.autore ?? "", descrizione: "", note: "", fasi: dopo ? [...dopo.fasi] : [], sottofasi: {},
    presenze: dopo?.presenze ? { ...dopo.presenze } : {}, mezzi: dopo?.mezzi ? { ...dopo.mezzi } : {},
    materiali: {}, foto: [], meteo: dopo?.meteo ?? "", percentuali: {},
  };
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
    for (const [, ore] of Object.entries(g.presenze ?? {})) {
      const n2 = oreLette(ore);
      if (n2 == null || n2 < 0 || n2 > 24) { errori.push(`Ore da 0 a 24 per ognuno${n}.`); break; }
    }
    for (const [, ore] of Object.entries(g.mezzi ?? {})) {
      const n2 = oreLette(ore);
      if (ore.trim() && (n2 == null || n2 < 0 || n2 > 24)) { errori.push(`Ore dei mezzi da 0 a 24${n}.`); break; }
    }
    for (const [, q] of Object.entries(g.materiali ?? {})) {
      const n2 = oreLette(q);
      if (n2 == null || n2 <= 0) { errori.push(`Quantità dei materiali maggiore di zero${n}.`); break; }
    }
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
  cataloghi: {
    persone?: ReadonlyArray<PersonaPresenza>;
    mezzi?: ReadonlyArray<{ id: string; nome: string }>;
    materiali?: ReadonlyArray<{ id: string; nome: string; unita: string | null }>;
  } = {},
) {
  const percentuale = new Map(fasi.map((f) => [f.id, f.percentuale]));
  return giorni.map((g) => {
    const dichiarate = Object.fromEntries(g.fasi.map((id) => [id, g.percentuali?.[id] ?? percentuale.get(id) ?? 0]));
    const finite = Object.entries(g.sottofasi).filter(([, s]) => s === "finita").map(([id]) => id);
    const lavorate = Object.entries(g.sottofasi).filter(([, s]) => s === "lavorata").map(([id]) => id);
    return {
      data_lavoro: g.data,
      autore: g.autore || null,
      descrizione: g.descrizione.trim(),
      note: g.note.trim() || null,
      fasi_lavorate: fasiLavorateDelRapportino(dichiarate, sottofasiDi, finite, lavorate),
      presenze: Object.entries(g.presenze ?? {}).flatMap(([chiave, ore]) => {
        const p = cataloghi.persone?.find((x) => x.chiave === chiave);
        return p ? [{
          ...(p.employee_id ? { employee_id: p.employee_id } : {}),
          ...(p.subappaltatore_id ? { subappaltatore_id: p.subappaltatore_id } : {}),
          nome: p.nome, ore: oreLette(ore) ?? 0,
        }] : [];
      }),
      mezzi_usati: Object.entries(g.mezzi ?? {}).map(([id, ore]) => ({
        mezzo_id: id, nome: cataloghi.mezzi?.find((m) => m.id === id)?.nome ?? "", ...(oreLette(ore) != null ? { ore: oreLette(ore) } : {}),
      })),
      materiali_usati: Object.entries(g.materiali ?? {}).flatMap(([id, q]) => {
        const m = cataloghi.materiali?.find((x) => x.id === id);
        return m ? [{ nome: m.nome, quantita: oreLette(q) ?? 0, ...(m.unita ? { unita: m.unita } : {}), order_item_id: id }] : [];
      }),
      foto_urls: g.foto ?? [],
      meteo: g.meteo || null,
    };
  });
}
