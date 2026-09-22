/**
 * Il voto dell'azienda sulle piattaforme di recensioni (Google, Trustpilot…),
 * per la pagina «Dicono di noi» dei preventivi: edili, Serramenti, Fotovoltaico.
 *
 * L'azienda lo scrive una volta nel Profilo azienda (`companies.recensioni_online`)
 * e vale per tutti i moduli. Non c'è un voto di serie: quello che l'azienda non ha
 * scritto non esce. Un voto inventato in un documento commerciale è una pratica
 * scorretta (Codice del Consumo, art. 23), e il cliente lo controlla in un minuto.
 *
 * Qui solo la lettura e i numeri scritti all'italiana: il disegno lo fa ogni motore.
 */

export type PiattaformaRecensioni = "google" | "trustpilot" | "facebook" | "houzz" | "prontopro" | "instapro" | "altro";

export const PIATTAFORME_RECENSIONI: Array<{ id: PiattaformaRecensioni; nome: string }> = [
  { id: "google", nome: "Google" },
  { id: "trustpilot", nome: "Trustpilot" },
  { id: "facebook", nome: "Facebook" },
  { id: "houzz", nome: "Houzz" },
  { id: "prontopro", nome: "ProntoPro" },
  { id: "instapro", nome: "Instapro" },
  { id: "altro", nome: "Altro" },
];

export interface VotoOnline {
  piattaforma: PiattaformaRecensioni;
  /** Il nome da mostrare: quello della piattaforma, o quello scritto per «Altro». */
  nome: string;
  /** Da 1 a 5, con un decimale. */
  voto: number;
  /** Quante recensioni; null se l'azienda non l'ha scritto. */
  numero: number | null;
  /** L'indirizzo della scheda, com'è stato scritto. */
  link: string | null;
  /** Quando l'azienda l'ha scritto (AAAA-MM-GG): il voto cambia, il documento dice di quando è. */
  aggiornato: string | null;
}

/** Nel preventivo ne stanno tre affiancati; l'elenco salvato ne tiene al massimo sei. */
export const MAX_VOTI_NEL_PDF = 3;

const NOMI = new Map(PIATTAFORME_RECENSIONI.map((p) => [p.id, p.nome]));

const numeroDa = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.trim().replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/**
 * Dal valore salvato (jsonb) ai voti da stampare, nell'ordine scelto. Si scarta
 * quello che non è un voto vero: fuori da 1–5, senza piattaforma, «Altro» senza
 * nome, la stessa piattaforma due volte.
 */
export function leggiVotiOnline(grezzo: unknown, quanti = MAX_VOTI_NEL_PDF): VotoOnline[] {
  if (!Array.isArray(grezzo)) return [];
  const visti = new Set<string>();
  const out: VotoOnline[] = [];
  for (const riga of grezzo) {
    if (!riga || typeof riga !== "object") continue;
    const r = riga as Record<string, unknown>;
    const piattaforma = String(r.piattaforma ?? "") as PiattaformaRecensioni;
    if (!NOMI.has(piattaforma)) continue;
    const nomeScritto = typeof r.nome === "string" ? r.nome.trim() : "";
    const nome = piattaforma === "altro" ? nomeScritto : NOMI.get(piattaforma) ?? "";
    if (!nome) continue;
    const voto = numeroDa(r.voto);
    if (voto == null || voto < 1 || voto > 5) continue;
    const numero = numeroDa(r.numero);
    const chiave = `${piattaforma}:${nome.toLowerCase()}`;
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    out.push({
      piattaforma,
      nome,
      voto: Math.round(voto * 10) / 10,
      numero: numero != null && numero >= 1 ? Math.floor(numero) : null,
      link: typeof r.link === "string" && r.link.trim() ? r.link.trim() : null,
      aggiornato: typeof r.aggiornato === "string" && /^\d{4}-\d{2}-\d{2}/.test(r.aggiornato) ? r.aggiornato.slice(0, 10) : null,
    });
    if (out.length >= quanti) break;
  }
  return out;
}

/** «4,8» */
export const votoScritto = (voto: number): string => voto.toFixed(1).replace(".", ",");

/** «126 recensioni», «1.240 recensioni», «1 recensione». */
export function recensioniScritte(numero: number | null): string | null {
  if (numero == null) return null;
  // Il punto delle migliaia a mano: Intl in italiano lo omette sotto le cinque cifre.
  const cifre = String(numero).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return numero === 1 ? "1 recensione" : `${cifre} recensioni`;
}

/** Quanto è piena ciascuna delle cinque stelle (0…1): 4,8 = quattro piene e una all'80%. */
export function stellePiene(voto: number): number[] {
  return [0, 1, 2, 3, 4].map((i) => Math.max(0, Math.min(1, voto - i)));
}

/** L'indirizzo della scheda da leggere sulla carta: senza «https://», «www.» e la barra finale. */
export function indirizzoDaLeggere(link: string | null, massimo = 42): string | null {
  if (!link) return null;
  const pulito = link.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "");
  if (!pulito) return null;
  return pulito.length > massimo ? `${pulito.slice(0, massimo - 1)}…` : pulito;
}

/**
 * La stella a cinque punte su una griglia di 24 × 24, come elenco di punti:
 * la disegnano react-pdf (Polygon) e le pagine HTML (polygon SVG).
 */
export const PUNTI_STELLA = "12,1.8 15.09,8.26 22.2,9.27 17.1,14.14 18.34,21.2 12,17.77 5.66,21.2 6.9,14.14 1.8,9.27 8.91,8.26";

/** Il colore delle stelle: lo stesso oro per tutti, è il segno che il cliente riconosce. */
export const ORO_STELLE = "#E3A008";
