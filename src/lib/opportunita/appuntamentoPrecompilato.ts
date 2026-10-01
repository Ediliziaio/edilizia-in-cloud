/**
 * Scheda «Prenota/aggiorna appuntamento» dell'opportunità: tutto quello che si
 * può sapere prima che l'utente scriva.
 *
 * Il modulo partiva vuoto — calendario, titolo, assegnatario, luogo da
 * scegliere ogni volta — anche se l'opportunità ha già un venditore e il
 * contatto un indirizzo. Qui la parte senza interfaccia: titolo suggerito,
 * scorciatoie di data, sovrapposizioni di orario, testo e link della conferma
 * al cliente.
 */

/** «Sopralluogo Preventivo · Anna Rossi». */
export function titoloSuggerito(tipo: string | null | undefined, nomeContatto: string | null | undefined): string {
  const t = (tipo ?? "").trim();
  const n = (nomeContatto ?? "").trim();
  if (t && n) return `${t} · ${n}`;
  return t || (n ? `Appuntamento con ${n}` : "Appuntamento");
}

export interface Scorciatoia {
  chiave: string;
  etichetta: string;
  data: Date;
}

/** Oggi, domani, dopodomani e fra una settimana, a mezzanotte locale. */
export function scorciatoieData(adesso: Date = new Date()): Scorciatoia[] {
  const base = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate());
  const piu = (g: number) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + g);
  return [
    { chiave: "oggi", etichetta: "Oggi", data: piu(0) },
    { chiave: "domani", etichetta: "Domani", data: piu(1) },
    { chiave: "dopodomani", etichetta: "Dopodomani", data: piu(2) },
    { chiave: "settimana", etichetta: "Fra una settimana", data: piu(7) },
  ];
}

export interface FasciaOraria {
  id?: string;
  /** HH:mm o HH:mm:ss */
  inizio: string | null;
  fine: string | null;
  titolo?: string | null;
}

const minuti = (hhmm: string | null | undefined): number | null => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

/**
 * Gli appuntamenti che si sovrappongono a quello che si sta fissando.
 * Un appuntamento senza ora di fine dura un'ora. Il bordo non conta:
 * 10:00–11:00 e 11:00–12:00 non si pestano i piedi.
 */
export function sovrapposizioni(inizio: string, fine: string, altri: FasciaOraria[]): FasciaOraria[] {
  const a = minuti(inizio);
  const b = minuti(fine);
  if (a == null || b == null || b <= a) return [];
  return altri.filter((x) => {
    const xi = minuti(x.inizio);
    if (xi == null) return false;
    const xf = minuti(x.fine) ?? xi + 60;
    return a < xf && b > xi;
  });
}

export interface DatiConferma {
  nome?: string | null;
  data: Date;
  ora: string;
  luogo?: string | null;
  tipo?: string | null;
}

/** Il messaggio da mandare al cliente per confermare. */
export function testoConferma(d: DatiConferma): string {
  const nome = (d.nome ?? "").trim().split(/\s+/)[0];
  const giorno = d.data.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  const luogo = (d.luogo ?? "").trim();
  const tipo = (d.tipo ?? "").trim().toLowerCase();
  return [
    `Buongiorno${nome ? ` ${nome}` : ""}, le confermo il nostro appuntamento${tipo ? ` (${tipo})` : ""} ${giorno} alle ${d.ora}${luogo ? `, in ${luogo}` : ""}.`,
    "Se ha bisogno di spostarlo mi scriva pure qui. A presto!",
  ].join("\n");
}

/** Link wa.me col testo già scritto; senza numero valido torna null. */
export function linkWhatsApp(telefono: string | null | undefined, testo: string): string | null {
  const cifre = (telefono ?? "").replace(/[^0-9]/g, "");
  if (cifre.length < 8) return null;
  const internazionale = cifre.startsWith("00") ? cifre.slice(2) : cifre.length <= 10 && cifre.startsWith("3") ? `39${cifre}` : cifre;
  return `https://wa.me/${internazionale}?text=${encodeURIComponent(testo)}`;
}

/** Distanza in linea d'aria in km (formula di Haversine), arrotondata a 0,1. */
export function distanzaLineaAria(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(a)) * 10) / 10;
}

/** «5,2 km» a partire da metri; sotto il chilometro in metri. */
export function testoKm(metri: number): string {
  if (!Number.isFinite(metri) || metri < 0) return "";
  if (metri < 1000) return `${Math.round(metri)} m`;
  return `${(metri / 1000).toFixed(1).replace(".", ",")} km`;
}
