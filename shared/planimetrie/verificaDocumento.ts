import type { Planimetria } from "./modello.ts";
import type { VerificaLettura } from "./letturaTipi.ts";
import { controllaPlanimetria } from "./controllo.ts";

export type UsoPlanimetria = "3d" | "render" | "computo" | "pdf";
export const NOMI_USO_PIANTA: Record<UsoPlanimetria, string> = { "3d": "Vista 3D", render: "Render AI", computo: "Computo", pdf: "PDF e fascicolo" };

const BASE: VerificaLettura[] = [
  { id: "confronto-muri", tipo: "geometria", descrizione: "Ho confrontato stanze, misure e rientri con il documento o con il rilievo." },
  { id: "confronto-aperture", tipo: "aperture", descrizione: "Ho controllato presenza, posizione e tipo di porte e finestre, anche quelle non riconosciute dall’AI." },
  { id: "confronto-elementi", tipo: "elementi", descrizione: "Ho controllato sanitari e arredi, distinguendo gli elementi esistenti dai lavori futuri." },
];

export function verificheDelDocumento(doc: Planimetria): VerificaLettura[] {
  if (!doc.letturaDocumento) return [];
  const scritte = doc.letturaDocumento.verifiche ?? [];
  const base = BASE.filter((b) => !scritte.some((s) => s.id === b.id));
  const precedenti: VerificaLettura[] = !scritte.length && doc.letturaDocumento.avvisiIniziali.length ? [{ id: "quote-lettura-precedente", tipo: "nota", descrizione: "Ho verificato tutte le quote e le incongruenze nelle osservazioni della lettura iniziale, correggendo il disegno dove necessario." }] : [];
  return [...scritte, ...precedenti, ...base];
}

/** Solo dati geometrici: cambiare titolo o materiali non annulla una verifica del rilievo. */
function geometria(doc: Planimetria, tipo: VerificaLettura["tipo"]): unknown {
  return doc.livelli.map((l) => ({ id: l.id, quota: l.quota, stati: [l.fatto, ...l.proposte].map((s) => ({
    muri: s.muri.map((m) => [m.id, m.p1, m.p2, m.spessore, m.altezza, m.stato]),
    locali: s.locali.map((c) => [c.id, c.contorno, c.altezza]),
    ...(tipo !== "geometria" ? { aperture: s.aperture.map((a) => [a.id, a.muroId, a.tipo, a.offset, a.larghezza, a.altezza, a.davanzale, a.ante, a.manovra, a.verso, a.stato]) } : {}),
    ...(tipo === "elementi" || tipo === "nota" ? { elementi: s.elementi.map((e) => [e.id, e.tipo, e.posizione, e.rotazione, e.larghezza, e.profondita, e.stato]) } : {}),
  })) }));
}

/** Firma di revisione, per rilevare modifiche accidentali; non è un controllo di autorizzazione. */
export function firmaVerifica(doc: Planimetria, v: VerificaLettura): string {
  const r = v.riferimento;
  const l = r ? doc.livelli.find((p) => p.id === r.livelloId) : undefined;
  const oggetto = r?.tipo === "locale" ? l?.fatto.locali.find((c) => c.id === r.oggettoId) : l?.fatto.aperture.find((a) => a.id === r?.oggettoId);
  const muro = l?.fatto.muri.find((m) => m.id === (oggetto && "muroId" in oggetto ? oggetto.muroId : ""));
  const dati = r && oggetto ? r.tipo === "locale"
    ? { id: oggetto.id, contorno: "contorno" in oggetto ? oggetto.contorno : undefined, altezza: oggetto.altezza }
    : { ...oggetto, origine: undefined, origineMisure: undefined, muro: muro ? [muro.id, muro.p1, muro.p2, muro.spessore, muro.altezza, muro.stato] : null }
    : geometria(doc, v.tipo);
  const s = JSON.stringify({ descrizione: v.descrizione, riferimento: r, valori: v.valoriLettiCm, dati });
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return `v1:${s.length}:${(h >>> 0).toString(16)}`;
}

export function valoreSulDisegno(doc: Planimetria, v: VerificaLettura): number | null {
  const r = v.riferimento;
  if (!r) return null;
  const l = doc.livelli.find((p) => p.id === r.livelloId);
  if (r.tipo === "apertura") {
    const a = l?.fatto.aperture.find((x) => x.id === r.oggettoId);
    return a && (r.campo === "larghezza" || r.campo === "altezza") ? a[r.campo] : null;
  }
  const c = l?.fatto.locali.find((x) => x.id === r.oggettoId);
  if (!c) return null;
  if (r.campo === "altezza") return c.altezza;
  if (!["larghezza", "profondita"].includes(r.campo)) return null;
  const valori = c.contorno.map((p) => r.campo === "larghezza" ? p.x : p.y);
  return Math.max(...valori) - Math.min(...valori);
}

export function verificaConfermata(doc: Planimetria, v: VerificaLettura): boolean {
  if (!v.conferma || v.conferma.firma !== firmaVerifica(doc, v)) return false;
  const attuale = valoreSulDisegno(doc, v);
  if (v.conferma.valoreCm !== undefined && (attuale === null || Math.abs(attuale - v.conferma.valoreCm) > 0.05)) return false;
  return true;
}

export function confermaVerifica(doc: Planimetria, id: string, dati: { nota?: string; valoreCm?: number }, quando = new Date().toISOString()): Planimetria {
  if (!doc.letturaDocumento) throw new Error("Questa pianta non ha una lettura del documento.");
  const verifiche = verificheDelDocumento(doc);
  const v = verifiche.find((x) => x.id === id);
  if (!v) throw new Error("Controllo non trovato.");
  if (v.riferimento?.tipo === "apertura" && v.riferimento.campo === "verso") {
    const a = doc.livelli.find((l) => l.id === v.riferimento!.livelloId)?.fatto.aperture.find((x) => x.id === v.riferimento!.oggettoId);
    if (a && !a.verso) throw new Error("Imposta il verso dell'apertura sul disegno dopo averlo verificato.");
  }
  if (dati.valoreCm !== undefined) {
    const attuale = valoreSulDisegno(doc, v);
    if (!Number.isFinite(dati.valoreCm) || dati.valoreCm <= 0 || attuale === null || Math.abs(attuale - dati.valoreCm) > 0.05) throw new Error("La quota confermata deve corrispondere al disegno: applicala prima di confermarla.");
  } else if (v.tipo === "quota" && valoreSulDisegno(doc, v) !== null) throw new Error("Indica la misura verificata prima di confermare la quota.");
  if ((v.tipo === "nota" || (v.tipo === "quota" && valoreSulDisegno(doc, v) === null)) && !dati.nota?.trim()) throw new Error("Descrivi cosa hai verificato o corretto sul disegno.");
  const aggiornate = verifiche.map((x) => x.id === id ? { ...x, conferma: { firma: firmaVerifica(doc, x), quando, ...(dati.nota?.trim() ? { nota: dati.nota.trim().slice(0, 1000) } : {}), ...(dati.valoreCm !== undefined ? { valoreCm: dati.valoreCm } : {}) } } : x);
  return { ...doc, letturaDocumento: { ...doc.letturaDocumento, verifiche: aggiornate } };
}

export function revocaVerifica(doc: Planimetria, id: string): Planimetria {
  if (!doc.letturaDocumento) return doc;
  return { ...doc, letturaDocumento: { ...doc.letturaDocumento, verifiche: verificheDelDocumento(doc).map((v) => v.id === id ? { ...v, conferma: undefined } : v) } };
}

export function controlloPrimaDellUso(doc: Planimetria, uso: UsoPlanimetria): { ok: boolean; uso: UsoPlanimetria; problemi: string[]; daVerificare: VerificaLettura[] } {
  const problemi = controllaPlanimetria(doc).filter((p) => p.gravita === "errore" || (doc.letturaDocumento && ["parete_staccata", "locale_non_chiuso"].includes(p.codice))).map((p) => p.messaggio);
  const daVerificare = verificheDelDocumento(doc).filter((v) => !verificaConfermata(doc, v));
  return { ok: !problemi.length && !daVerificare.length, uso, problemi, daVerificare };
}

export function esigiVerificaDocumento(doc: Planimetria, uso: UsoPlanimetria): void {
  const c = controlloPrimaDellUso(doc, uso);
  if (!c.ok) throw new Error(`Prima di ${NOMI_USO_PIANTA[uso]} verifica la pianta: ${[...c.problemi, ...c.daVerificare.map((v) => v.descrizione)].slice(0, 4).join(" ")}`);
}
