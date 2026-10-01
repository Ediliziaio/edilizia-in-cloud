/**
 * Scheda «Preventivi» dell'opportunità: il colpo d'occhio.
 *
 * Una lista di righe con stato e totale non dice quanto vale la trattativa, né
 * se il cliente ha visto l'offerta o se sta per scadere. Qui il riepilogo,
 * l'ordine (prima quelli ancora aperti) e le scadenze in chiaro.
 */

export interface PreventivoRiga {
  id: string;
  status: string | null;
  total: number | string | null;
  created_at: string;
  sent_at?: string | null;
  viewed_at?: string | null;
  expires_at?: string | null;
}

type Gruppo = "aperti" | "accettati" | "chiusi";

const GRUPPO_DI_STATO: Record<string, Gruppo> = {
  bozza: "aperti", draft: "aperti", inviata: "aperti", sent: "aperti",
  accettata: "accettati", accepted: "accettati", convertita: "accettati",
  rifiutata: "chiusi", rejected: "chiusi", scaduta: "chiusi", expired: "chiusi",
};

export const gruppoPreventivo = (stato: string | null | undefined): Gruppo => GRUPPO_DI_STATO[(stato ?? "").toLowerCase()] ?? "aperti";

const numero = (v: number | string | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export interface Riepilogo {
  aperti: { n: number; valore: number };
  accettati: { n: number; valore: number };
  chiusi: { n: number; valore: number };
  totale: number;
}

export function riepilogoPreventivi(righe: PreventivoRiga[]): Riepilogo {
  const r: Riepilogo = {
    aperti: { n: 0, valore: 0 }, accettati: { n: 0, valore: 0 }, chiusi: { n: 0, valore: 0 }, totale: righe.length,
  };
  for (const q of righe) {
    const g = r[gruppoPreventivo(q.status)];
    g.n += 1;
    g.valore += numero(q.total);
  }
  return r;
}

/** Aperti per primi (i più recenti in alto), poi accettati, poi chiusi. */
export function ordinaPreventivi<T extends PreventivoRiga>(righe: T[]): T[] {
  const peso: Record<Gruppo, number> = { aperti: 0, accettati: 1, chiusi: 2 };
  return [...righe].sort((a, b) => {
    const d = peso[gruppoPreventivo(a.status)] - peso[gruppoPreventivo(b.status)];
    return d !== 0 ? d : new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export interface Scadenza {
  testo: string;
  /** Scade entro 3 giorni, o è già scaduto ma ancora aperto. */
  urgente: boolean;
}

/** «Scade tra 5 giorni», «Scade domani», «Scaduto da 2 giorni»; null se già chiuso o senza data. */
export function scadenzaPreventivo(q: PreventivoRiga, adesso: Date = new Date()): Scadenza | null {
  if (gruppoPreventivo(q.status) !== "aperti" || !q.expires_at) return null;
  const fine = new Date(q.expires_at);
  if (Number.isNaN(fine.getTime())) return null;
  // Giorni di calendario, non blocchi di 24 ore: «domani» è il giorno dopo, anche se mancano dieci ore.
  const giornoDi = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const giorni = Math.round((giornoDi(fine) - giornoDi(adesso)) / 86_400_000);
  if (giorni < 0) return { testo: `Scaduto da ${Math.abs(giorni)} ${Math.abs(giorni) === 1 ? "giorno" : "giorni"}`, urgente: true };
  if (giorni === 0) return { testo: "Scade oggi", urgente: true };
  if (giorni === 1) return { testo: "Scade domani", urgente: true };
  return { testo: `Scade tra ${giorni} giorni`, urgente: giorni <= 3 };
}

/** Il cliente ha visto l'offerta? Solo per quelli inviati. */
export function visioneCliente(q: PreventivoRiga): string | null {
  if (gruppoPreventivo(q.status) !== "aperti" || !q.sent_at) return null;
  if (!q.viewed_at) return "Inviato, non ancora aperto dal cliente";
  const d = new Date(q.viewed_at);
  if (Number.isNaN(d.getTime())) return null;
  return `Aperto dal cliente il ${d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}`;
}

/**
 * Il valore da proporre per l'opportunità: l'accettato più recente, altrimenti
 * il preventivo aperto più recente. Null se non c'è niente di utile.
 */
export function valoreProposto(righe: PreventivoRiga[]): { valore: number; da: "accettato" | "aperto" } | null {
  const ordinate = [...righe].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const acc = ordinate.find((q) => gruppoPreventivo(q.status) === "accettati" && numero(q.total) > 0);
  if (acc) return { valore: numero(acc.total), da: "accettato" };
  const ap = ordinate.find((q) => gruppoPreventivo(q.status) === "aperti" && numero(q.total) > 0);
  return ap ? { valore: numero(ap.total), da: "aperto" } : null;
}
