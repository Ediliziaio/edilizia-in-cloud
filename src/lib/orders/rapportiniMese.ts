/**
 * La pagina Rapportini di Commesse: i rapportini di un mese, divisi per giorno,
 * cantiere e persona. Modulo puro, dalle righe lette ai numeri che si vedono.
 *
 * Una regola sola per le ore: orePersoneRapportino, la stessa della scheda della
 * commessa. I rifiutati e le bozze restano in elenco ma non
 * contano: non sono lavoro riconosciuto.
 */
import { orePersoneRapportino } from "@/lib/campo/orePersone";
import { statoRapportino, type StatoRapportino } from "@/lib/campo/rapportinoStato";

export interface PresenzaRiga { nome?: unknown; ore?: unknown; employee_id?: unknown; subappaltatore_id?: unknown }

export interface RapportinoRiga {
  id: string;
  order_id: string;
  data_lavoro: string;
  stato?: string | null;
  approvato?: boolean | null;
  ore_lavorate?: number | string | null;
  ore_straordinario?: number | string | null;
  presenze?: unknown;
  descrizione_lavori?: string | null;
  foto_urls?: string[] | null;
  costo_manodopera?: number | string | null;
  order?: { order_code?: string | null; client_name?: string | null; description?: string | null } | null;
  operaio?: { first_name?: string | null; last_name?: string | null } | null;
  dipendente?: { first_name?: string | null; last_name?: string | null } | null;
}

export type VistaRapportini = "elenco" | "giorni" | "cantieri" | "persone" | "mappa";
export interface FiltriRapportini { giorno?: string; cantiere?: string; persona?: string; stato?: string; testo?: string }

export interface PersonaDelRapportino {
  chiave: string;
  nome: string;
  ore: number;
  /** Una ditta è presente, ma le sue ore non sono ore di squadra. */
  ditta: boolean;
}

const tondo = (n: number) => Math.round(n * 10) / 10;
const NON_INDICATO = "Non indicato";
const CHIAVE_NON_INDICATO = `n:${NON_INDICATO.toLowerCase()}`;
const nomeDi = (p?: { first_name?: string | null; last_name?: string | null } | null) =>
  [p?.first_name, p?.last_name].map((v) => (v ?? "").trim()).filter(Boolean).join(" ");

export const statoDi = (r: RapportinoRiga): StatoRapportino => statoRapportino(r) ?? "inviato";
/** Conta nei numeri del mese: già inviato all'ufficio e non respinto. */
export const contaNeiNumeri = (r: RapportinoRiga) => {
  const stato = statoDi(r);
  return stato === "inviato" || stato === "approvato";
};
// Si arrotonda solo sui totali: così le divisioni tornano fra loro anche con 7,25 h.
export const oreDi = (r: RapportinoRiga) => orePersoneRapportino(r);

/** Il nome del cantiere: il cliente, poi il lavoro, poi il codice. */
export function nomeCantiere(r: Pick<RapportinoRiga, "order">): string {
  const o = r.order;
  return (o?.client_name ?? "").trim() || (o?.description ?? "").trim() || (o?.order_code ?? "").trim() || "Commessa non disponibile";
}

/** Chi ha lavorato: le presenze se ci sono, altrimenti chi ha compilato. */
export function personeDi(r: RapportinoRiga): PersonaDelRapportino[] {
  const presenze = Array.isArray(r.presenze) ? (r.presenze as PresenzaRiga[]).filter((p) => p && typeof p === "object") : [];
  if (presenze.length > 0) {
    return presenze.map((p) => {
      const ditta = !p.employee_id && !!p.subappaltatore_id;
      const nome = String(p.nome ?? "").trim() || NON_INDICATO;
      return {
        chiave: p.employee_id ? `e:${p.employee_id}` : p.subappaltatore_id ? `d:${p.subappaltatore_id}` : `n:${nome.toLowerCase()}`,
        nome,
        ore: p.employee_id ? Number(p.ore) || 0 : 0,
        ditta,
      };
    });
  }
  const nome = nomeDi(r.operaio) || nomeDi(r.dipendente) || NON_INDICATO;
  return [{ chiave: `n:${nome.toLowerCase()}`, nome, ore: oreDi(r), ditta: false }];
}

export function filtraRapportini(righe: readonly RapportinoRiga[], f: FiltriRapportini): RapportinoRiga[] {
  const testo = (f.testo ?? "").trim().toLowerCase();
  return righe.filter((r) => {
    if (f.giorno && r.data_lavoro !== f.giorno) return false;
    if (f.cantiere && r.order_id !== f.cantiere) return false;
    if (f.stato && statoDi(r) !== f.stato) return false;
    const persone = f.persona || testo ? personeDi(r) : [];
    if (f.persona && !persone.some((p) => p.chiave === f.persona)) return false;
    if (testo) {
      const dove = [r.descrizione_lavori, nomeCantiere(r), r.order?.order_code, r.order?.description, ...persone.map((p) => p.nome)]
        .map((v) => (v ?? "").toLowerCase()).join(" ");
      if (!dove.includes(testo)) return false;
    }
    return true;
  });
}

export interface TotaliRapportini {
  rapportini: number;
  ore: number;
  cantieri: number;
  persone: number;
  giorni: number;
  daApprovare: number;
  rifiutati: number;
  foto: number;
  costo: number;
  /** Quanti dei rapportini contati hanno già un costo: quelli approvati. */
  conCosto: number;
}

export function totaliRapportini(righe: readonly RapportinoRiga[]): TotaliRapportini {
  const buoni = righe.filter(contaNeiNumeri);
  const persone = new Set<string>();
  let ore = 0, foto = 0, costo = 0, conCosto = 0;
  for (const r of buoni) {
    ore += oreDi(r);
    foto += r.foto_urls?.length ?? 0;
    if (r.costo_manodopera != null) { costo += Number(r.costo_manodopera) || 0; conCosto += 1; }
    // «Non indicato» non è qualcuno: le ore restano, ma non fa numero fra le persone.
    for (const p of personeDi(r)) if (!p.ditta && p.chiave !== CHIAVE_NON_INDICATO) persone.add(p.chiave);
  }
  return {
    rapportini: buoni.length,
    ore: tondo(ore),
    cantieri: new Set(buoni.map((r) => r.order_id)).size,
    persone: persone.size,
    giorni: new Set(buoni.map((r) => r.data_lavoro)).size,
    daApprovare: righe.filter((r) => statoDi(r) === "inviato").length,
    rifiutati: righe.filter((r) => statoDi(r) === "rifiutato").length,
    foto,
    costo: Math.round(costo * 100) / 100,
    conCosto,
  };
}

export interface GiornoRapportini { data: string; righe: RapportinoRiga[]; ore: number; cantieri: number; contati: number }

/** Dal più recente: chi apre la pagina vuole l'ultimo giorno lavorato. */
export function perGiorno(righe: readonly RapportinoRiga[]): GiornoRapportini[] {
  const mappa = new Map<string, RapportinoRiga[]>();
  for (const r of righe) mappa.set(r.data_lavoro, [...(mappa.get(r.data_lavoro) ?? []), r]);
  return [...mappa.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([data, lista]) => {
    const buoni = lista.filter(contaNeiNumeri);
    return {
      data,
      righe: [...lista].sort((a, b) => nomeCantiere(a).localeCompare(nomeCantiere(b), "it")),
      ore: tondo(buoni.reduce((s, r) => s + oreDi(r), 0)),
      cantieri: new Set(buoni.map((r) => r.order_id)).size,
      contati: buoni.length,
    };
  });
}

export interface CantiereRapportini {
  orderId: string;
  nome: string;
  codice: string;
  rapportini: number;
  giorni: number;
  persone: number;
  ore: number;
  costo: number;
  daApprovare: number;
  ultimo: string | null;
}

export function perCantiere(righe: readonly RapportinoRiga[]): CantiereRapportini[] {
  const mappa = new Map<string, RapportinoRiga[]>();
  for (const r of righe) mappa.set(r.order_id, [...(mappa.get(r.order_id) ?? []), r]);
  return [...mappa.entries()].map(([orderId, lista]) => {
    const t = totaliRapportini(lista);
    const buoni = lista.filter(contaNeiNumeri);
    return {
      orderId,
      nome: nomeCantiere(lista[0]),
      codice: (lista[0].order?.order_code ?? "").trim(),
      rapportini: t.rapportini,
      giorni: t.giorni,
      persone: t.persone,
      ore: t.ore,
      costo: t.costo,
      daApprovare: t.daApprovare,
      ultimo: buoni.map((r) => r.data_lavoro).sort().at(-1) ?? null,
    };
  }).sort((a, b) => b.ore - a.ore || a.nome.localeCompare(b.nome, "it"));
}

export interface PersonaRapportini { chiave: string; nome: string; ditta: boolean; giorni: number; cantieri: number; ore: number; ultimo: string | null }

export function perPersona(righe: readonly RapportinoRiga[]): PersonaRapportini[] {
  const mappa = new Map<string, { nome: string; ditta: boolean; giorni: Set<string>; cantieri: Set<string>; ore: number }>();
  for (const r of righe.filter(contaNeiNumeri)) {
    for (const p of personeDi(r)) {
      const voce = mappa.get(p.chiave) ?? { nome: p.nome, ditta: p.ditta, giorni: new Set<string>(), cantieri: new Set<string>(), ore: 0 };
      voce.giorni.add(r.data_lavoro);
      voce.cantieri.add(r.order_id);
      voce.ore += p.ore;
      mappa.set(p.chiave, voce);
    }
  }
  return [...mappa.entries()].map(([chiave, v]) => ({
    chiave, nome: v.nome, ditta: v.ditta, giorni: v.giorni.size, cantieri: v.cantieri.size, ore: tondo(v.ore),
    ultimo: [...v.giorni].sort().at(-1) ?? null,
  })).sort((a, b) => b.ore - a.ore || a.nome.localeCompare(b.nome, "it"));
}

const ETICHETTA_STATO: Record<StatoRapportino, string> = { bozza: "Bozza", inviato: "Da approvare", approvato: "Approvato", rifiutato: "Rifiutato" };

export const COLONNE_CSV = [
  { key: "data", label: "Data" }, { key: "cantiere", label: "Cantiere" }, { key: "codice", label: "Commessa" },
  { key: "lavoro", label: "Lavoro svolto" }, { key: "persone", label: "Persone" }, { key: "ore", label: "Ore" },
  { key: "stato", label: "Stato" }, { key: "costo", label: "Costo manodopera" },
];

/** Una riga per rapportino, dal più vecchio; numeri alla italiana. Il costo solo a chi può vederlo. */
export function righeCsv(righe: readonly RapportinoRiga[], conCosti: boolean): Record<string, string>[] {
  const numero = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 2, useGrouping: false });
  return [...righe].sort((a, b) => a.data_lavoro.localeCompare(b.data_lavoro) || nomeCantiere(a).localeCompare(nomeCantiere(b), "it")).map((r) => {
    const [anno, mese, giorno] = r.data_lavoro.split("-");
    return {
      data: `${giorno}/${mese}/${anno}`,
      cantiere: nomeCantiere(r),
      codice: (r.order?.order_code ?? "").trim(),
      lavoro: (r.descrizione_lavori ?? "").trim(),
      persone: personeDi(r).map((p) => p.nome).join(", "),
      ore: numero(oreDi(r)),
      stato: ETICHETTA_STATO[statoDi(r)],
      ...(conCosti ? { costo: r.costo_manodopera == null ? "" : numero(Number(r.costo_manodopera) || 0) } : {}),
    };
  });
}

// ── Il mese ───────────────────────────────────────────────────────────────────

export const meseValido = (m: string | null | undefined): m is string =>
  !!m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

export function giorniDelMese(mese: string): string[] {
  const [a, m] = mese.split("-").map(Number);
  const quanti = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return Array.from({ length: quanti }, (_, i) => `${mese}-${String(i + 1).padStart(2, "0")}`);
}

export function spostaMese(mese: string, di: number): string {
  const [a, m] = mese.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + di, 1));
  return d.toISOString().slice(0, 7);
}

export const giornoFeriale = (giorno: string) => {
  const g = new Date(`${giorno}T12:00:00Z`).getUTCDay();
  return g !== 0 && g !== 6;
};

/** I giorni feriali del mese fino a oggi: il termine di paragone di «giorni con lavoro». */
export function feriali(mese: string, oggi: string): number {
  return giorniDelMese(mese).filter((g) => g <= oggi && giornoFeriale(g)).length;
}

export interface PuntoGiorno { data: string; giorno: number; ore: number; rapportini: number; feriale: boolean }

export function andamentoMese(righe: readonly RapportinoRiga[], mese: string): PuntoGiorno[] {
  const ore = new Map<string, { ore: number; n: number }>();
  for (const r of righe.filter(contaNeiNumeri)) {
    const v = ore.get(r.data_lavoro) ?? { ore: 0, n: 0 };
    v.ore += oreDi(r);
    v.n += 1;
    ore.set(r.data_lavoro, v);
  }
  return giorniDelMese(mese).map((data) => ({
    data,
    giorno: Number(data.slice(8)),
    ore: tondo(ore.get(data)?.ore ?? 0),
    rapportini: ore.get(data)?.n ?? 0,
    feriale: giornoFeriale(data),
  }));
}

export interface RigaMappa { orderId: string; nome: string; codice: string; ore: number; celle: Record<string, { ore: number; rapportini: number }> }

/** Cantieri per giorni: in che cantiere si è lavorato, e quando. */
export function mappaMese(righe: readonly RapportinoRiga[]): { righe: RigaMappa[]; massimo: number } {
  const mappa = new Map<string, RigaMappa>();
  for (const r of righe.filter(contaNeiNumeri)) {
    const riga = mappa.get(r.order_id) ?? { orderId: r.order_id, nome: nomeCantiere(r), codice: (r.order?.order_code ?? "").trim(), ore: 0, celle: {} };
    const cella = riga.celle[r.data_lavoro] ?? { ore: 0, rapportini: 0 };
    cella.ore += oreDi(r);
    cella.rapportini += 1;
    riga.celle[r.data_lavoro] = cella;
    riga.ore += oreDi(r);
    mappa.set(r.order_id, riga);
  }
  for (const riga of mappa.values()) {
    riga.ore = tondo(riga.ore);
    for (const cella of Object.values(riga.celle)) cella.ore = tondo(cella.ore);
  }
  const lista = [...mappa.values()].sort((a, b) => b.ore - a.ore || a.nome.localeCompare(b.nome, "it"));
  const massimo = Math.max(0, ...lista.flatMap((r) => Object.values(r.celle).map((c) => c.ore)));
  return { righe: lista, massimo };
}

/** 0–4: quanto è scura la cella, rispetto alla giornata più piena del mese. */
export function intensita(ore: number, massimo: number): 0 | 1 | 2 | 3 | 4 {
  if (ore <= 0 || massimo <= 0) return 0;
  const q = ore / massimo;
  return q > 0.75 ? 4 : q > 0.5 ? 3 : q > 0.25 ? 2 : 1;
}
