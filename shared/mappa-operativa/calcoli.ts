export type Coordinate = { lat: number; lng: number };
export type Tratta = { metri: number; secondi: number };
export type ProblemaPercorso = "fuori_copertura" | "nessun_percorso";
export type PercorsoStradale = {
  tratte: (Tratta | null)[];
  geometria: Coordinate[];
  geometrieTratte?: Coordinate[][];
  problema?: ProblemaPercorso;
  puntiFuoriCopertura?: number[];
};
export type Tappa = { id: string; titolo: string; punto: Coordinate | null; inizio: number | null; fine: number | null };
export type Candidato = {
  id: string; nome: string; origine: Coordinate | null; fonte: string;
  aggiornato?: string | null; partenza: number; prossimo?: Coordinate | null;
  prossimoInizio?: number | null;
};

export function coordinate(lat: unknown, lng: unknown): Coordinate | null {
  return typeof lat === "number" && typeof lng === "number" &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0)
    ? { lat, lng } : null;
}

export function metriInLinea(a: Coordinate, b: Coordinate) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function minuti(ora?: string | null) {
  if (!ora || !/^\d{2}:\d{2}/.test(ora)) return null;
  return Number(ora.slice(0, 2)) * 60 + Number(ora.slice(3, 5));
}

export function partiNelFuso(iso: Date | string, fuso = "Europe/Rome") {
  const parti = new Intl.DateTimeFormat("en-GB", {
    timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const valore = (tipo: Intl.DateTimeFormatPartTypes) => parti.find(p => p.type === tipo)?.value ?? "";
  const [anno, mese, giorno, hh, mm] = (["year", "month", "day", "hour", "minute"] as const).map(valore);
  return { giorno: `${anno}-${mese}-${giorno}`, ora: `${hh}:${mm}` };
}

export function dataAdiacente(giorno: string, delta: number) {
  const data = new Date(`${giorno}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() + delta);
  return data.toISOString().slice(0, 10);
}

export const normalizzaIndirizzo = (valore: string) =>
  valore.normalize("NFKC").trim().replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").toLocaleLowerCase("it");

export function ordineTappe<T extends Tappa>(tappe: T[]) {
  return [...tappe].sort((a, b) => (a.inizio ?? Infinity) - (b.inizio ?? Infinity) ||
    a.titolo.localeCompare(b.titolo, "it") || a.id.localeCompare(b.id));
}

export function segmentiPercorso(tappe: Tappa[]) {
  return tappe.slice(1).map((a, indice) => ({ da: tappe[indice], a }));
}

export function riepilogoPercorso(tappe: Tappa[], valori: (Tratta | null)[]) {
  return segmentiPercorso(tappe).map(({ da, a }, i) => {
    const tratta = valori[i] ?? null;
    const intervallo = da.fine == null || a.inizio == null ? null : a.inizio - da.fine;
    return {
      da, a, tratta,
      ritardoMinuti: tratta && intervallo != null ? Math.max(0, Math.ceil(tratta.secondi / 60 - intervallo)) : null,
      conflitto: intervallo == null ? null : intervallo < 0 ? "Sovrapposizione" :
        tratta && tratta.secondi > intervallo * 60 ? "Trasferimento incompatibile" : null,
    };
  });
}

/** Mantiene la durata di ogni visita. Le pause tra visite assorbono i ritardi quando bastano. */
export function stimaRientro(impegni: Tappa[], tratte: (Tratta | null)[], conPartenza: boolean) {
  const previste = impegni.length + Number(conPartenza);
  const rientro = tratte.at(-1);
  if (!impegni.length || tratte.length !== previste || !rientro || tratte.some(t => !t)) return null;
  let fineEffettiva = 0;
  for (const [i, visita] of impegni.entries()) {
    if (visita.inizio == null || visita.fine == null || visita.fine < visita.inizio) return null;
    const inizio = visita.inizio * 60;
    const durata = (visita.fine - visita.inizio) * 60;
    const trasferimento = i > 0 ? tratte[i - 1 + Number(conPartenza)]!.secondi : 0;
    const arrivo = i > 0 ? fineEffettiva + trasferimento : inizio;
    fineEffettiva = Math.max(inizio, arrivo) + durata;
  }
  const ultimaFine = impegni.at(-1)!.fine! * 60;
  return {
    arrivoMinuti: Math.ceil((fineEffettiva + rientro.secondi) / 60),
    ritardoMinuti: Math.ceil((fineEffettiva - ultimaFine) / 60),
  };
}

type ConOrigine = Candidato & { origine: Coordinate; linea: number };
type MotivoPercorso = "ritardo" | "rientro" | "da_verificare" | "irraggiungibile";
export type ValutazioneVicino = {
  candidato: ConOrigine;
  tratta: Tratta | null;
  margineArrivo: number | null;
  margineRientro: number | null;
  motivo?: MotivoPercorso;
};

export async function cercaVicini(
  candidati: Candidato[], meta: Coordinate, inizio: number, fine: number,
  stima: (rosa: ConOrigine[]) => Promise<{ andata: (Tratta | null)[]; dopo: (Tratta | null)[] }>,
  limite = 10,
) {
  const ordinati = candidati.flatMap((c) => c.origine
    ? [{ ...c, origine: c.origine, linea: metriInLinea(c.origine, meta) }] : [])
    .sort((a, b) => a.linea - b.linea || a.id.localeCompare(b.id));
  const senzaOrigine = candidati.filter(c => !c.origine).map(c => c.nome);
  const valutabili = ordinati.slice(0, limite);
  let valutati = 0;
  const esiti: (ValutazioneVicino & { tratta: Tratta })[] = [];
  const esclusi: ValutazioneVicino[] = [];
  try {
    for (let i = 0; i < valutabili.length; i += 5) {
      const rosa = valutabili.slice(i, i + 5);
      const { andata, dopo } = await stima(rosa);
      valutati += rosa.length;
      rosa.forEach((candidato, j) => {
        const tratta = andata[j] ?? null;
        const successiva = dopo[j];
        const margineArrivo = tratta ? inizio - candidato.partenza - tratta.secondi / 60 : null;
        const margineRientro = candidato.prossimoInizio != null && successiva
          ? candidato.prossimoInizio - fine - successiva.secondi / 60 : null;
        const dati = { candidato, tratta, margineArrivo, margineRientro };
        if (!tratta) esclusi.push({ ...dati, motivo: "irraggiungibile" });
        else if (margineArrivo != null && margineArrivo < 0) esclusi.push({ ...dati, motivo: "ritardo" });
        else if (candidato.prossimoInizio != null && margineRientro == null) esclusi.push({ ...dati, motivo: "da_verificare" });
        else if (margineRientro != null && margineRientro < 0) esclusi.push({ ...dati, motivo: "rientro" });
        else esiti.push({ ...dati, tratta });
      });
      if (esiti.length >= 3) break;
    }
  } catch {
    if (esiti.length === 0) {
      const giaEsclusi = new Set(esclusi.map(r => r.candidato.id));
      return {
        metodo: "linea" as const, senzaOrigine, valutati: ordinati.length, totale: candidati.length,
        risultati: ordinati.filter(c => !giaEsclusi.has(c.id)).slice(0, 3).map((candidato): ValutazioneVicino => ({
          candidato, tratta: null, margineArrivo: null, margineRientro: null,
        })),
        esclusi: esclusi.slice(0, 3),
      };
    }
  }
  return {
    metodo: "strada" as const, senzaOrigine, valutati, totale: candidati.length,
    esclusi: esclusi.sort((a, b) => (a.tratta?.secondi ?? Infinity) - (b.tratta?.secondi ?? Infinity)).slice(0, 3),
    risultati: esiti.sort((a, b) => a.tratta.secondi - b.tratta.secondi ||
      a.tratta.metri - b.tratta.metri).slice(0, 3),
  };
}

export function kmDocumentati<T extends { id: string; metri: number }>(viaggi: T[]) {
  return [...new Map(viaggi.map(v => [v.id, v])).values()].reduce((somma, v) => somma + v.metri, 0);
}
