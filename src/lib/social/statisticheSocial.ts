/**
 * Statistiche di Pagina Facebook e profilo Instagram: calcoli per la scheda
 * «Analitiche» del Social Manager. Le righe arrivano da
 * social_statistiche_giornaliere / social_statistiche_post / social_statistiche_stato,
 * scritte da meta-ads-sync-insights (ogni 4 ore) e da meta-api-proxy («Aggiorna ora»).
 *
 * I giorni sono in UTC, come li scrive la sincronizzazione.
 * Un dato che Meta non ha fornito resta `null` (mostrato «—»), mai zero.
 */

export type PiattaformaStatistiche = "facebook" | "instagram";

export const PERIODI_STATISTICHE = [7, 30, 90] as const;
export type PeriodoStatistiche = (typeof PERIODI_STATISTICHE)[number];

export interface RigaStatisticaGiornaliera {
  piattaforma: PiattaformaStatistiche;
  account_esterno_id: string;
  giorno: string;
  follower: number | null;
  nuovi_follower: number | null;
  follower_persi: number | null;
  copertura: number | null;
  visualizzazioni: number | null;
  interazioni: number | null;
  visite_profilo: number | null;
  click_link: number | null;
}

export interface RigaStatisticaPost {
  piattaforma: PiattaformaStatistiche;
  account_esterno_id: string;
  post_id: string;
  pubblicato_il: string | null;
  tipo: string | null;
  testo: string | null;
  permalink: string | null;
  immagine_url: string | null;
  copertura: number | null;
  visualizzazioni: number | null;
  reazioni: number | null;
  commenti: number | null;
  condivisioni: number | null;
  salvataggi: number | null;
  clic: number | null;
  interazioni: number | null;
}

export type EsitoStatistiche = "mai" | "ok" | "parziale" | "permesso_mancante" | "errore";

export interface StatoStatisticheAccount {
  piattaforma: PiattaformaStatistiche;
  account_esterno_id: string;
  pagina_id: string;
  nome: string | null;
  username: string | null;
  follower: number | null;
  contenuti_totali: number | null;
  esito: EsitoStatistiche;
  messaggio: string | null;
  metriche_non_disponibili: string[] | null;
  ultima_sync: string | null;
  ultima_sync_riuscita: string | null;
}

const GIORNO_MS = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const inizioOggiUtc = (adesso: Date) =>
  Date.UTC(adesso.getUTCFullYear(), adesso.getUTCMonth(), adesso.getUTCDate());

/**
 * Il periodo sono gli ultimi `giorni` giorni chiusi (fino a ieri), e il
 * periodo precedente di pari durata per il confronto.
 */
export function intervalloPeriodo(giorni: number, adesso = new Date()) {
  const ieri = inizioOggiUtc(adesso) - GIORNO_MS;
  const da = ieri - (giorni - 1) * GIORNO_MS;
  return {
    da: iso(da),
    a: iso(ieri),
    daPrecedente: iso(da - giorni * GIORNO_MS),
    aPrecedente: iso(da - GIORNO_MS),
  };
}

type CampoSommabile =
  | "nuovi_follower"
  | "follower_persi"
  | "copertura"
  | "visualizzazioni"
  | "interazioni"
  | "visite_profilo"
  | "click_link";

/** Somma di un campo; null se nessuna riga ha il dato. */
export function sommaCampo(righe: RigaStatisticaGiornaliera[], campo: CampoSommabile): number | null {
  let tot = 0;
  let visto = false;
  for (const r of righe) {
    const v = r[campo];
    if (v !== null && v !== undefined) {
      tot += v;
      visto = true;
    }
  }
  return visto ? tot : null;
}

/** Variazione % rispetto al periodo precedente; null se non confrontabile. */
export function variazionePercentuale(attuale: number | null, precedente: number | null): number | null {
  if (attuale === null || precedente === null || precedente <= 0) return null;
  return Math.round(((attuale - precedente) / precedente) * 1000) / 10;
}

export interface PuntoSerie {
  giorno: string;
  visualizzazioni: number | null;
  copertura: number | null;
  interazioni: number | null;
}

export interface RiepilogoStatistiche {
  follower: number | null;
  crescitaFollower: number | null;
  copertura: number | null;
  visualizzazioni: number | null;
  interazioni: number | null;
  visiteProfilo: number | null;
  clickLink: number | null;
  variazioni: {
    copertura: number | null;
    visualizzazioni: number | null;
    interazioni: number | null;
  };
  serie: PuntoSerie[];
  giorniConDati: number;
}

export function riepilogaStatistiche(
  righe: RigaStatisticaGiornaliera[],
  giorni: number,
  followerAttuale: number | null,
  adesso = new Date(),
): RiepilogoStatistiche {
  const { da, a, daPrecedente, aPrecedente } = intervalloPeriodo(giorni, adesso);
  const nel = righe.filter((r) => r.giorno >= da && r.giorno <= a);
  const prima = righe.filter((r) => r.giorno >= daPrecedente && r.giorno <= aPrecedente);

  const conFollower = righe
    .filter((r) => r.follower !== null && r.follower !== undefined)
    .sort((x, y) => (x.giorno < y.giorno ? -1 : x.giorno > y.giorno ? 1 : 0));
  const follower = followerAttuale ?? conFollower[conFollower.length - 1]?.follower ?? null;

  // Crescita: dai nuovi follower meno quelli persi, se Meta li dà; altrimenti
  // dalla differenza tra il primo follower registrato nel periodo e l'ultimo.
  const nuovi = sommaCampo(nel, "nuovi_follower");
  const persi = sommaCampo(nel, "follower_persi");
  let crescitaFollower: number | null = null;
  if (nuovi !== null || persi !== null) {
    crescitaFollower = (nuovi ?? 0) - (persi ?? 0);
  } else {
    const inizio = iso(Date.parse(`${da}T00:00:00Z`) - GIORNO_MS);
    const dalPeriodo = conFollower.filter((r) => r.giorno >= inizio);
    if (dalPeriodo.length >= 2) {
      crescitaFollower = (dalPeriodo[dalPeriodo.length - 1].follower as number) - (dalPeriodo[0].follower as number);
    }
  }

  const copertura = sommaCampo(nel, "copertura");
  const visualizzazioni = sommaCampo(nel, "visualizzazioni");
  const interazioni = sommaCampo(nel, "interazioni");

  const perGiorno = new Map(nel.map((r) => [r.giorno, r]));
  const serie: PuntoSerie[] = [];
  for (let t = Date.parse(`${da}T00:00:00Z`); iso(t) <= a; t += GIORNO_MS) {
    const r = perGiorno.get(iso(t));
    serie.push({
      giorno: iso(t),
      visualizzazioni: r?.visualizzazioni ?? null,
      copertura: r?.copertura ?? null,
      interazioni: r?.interazioni ?? null,
    });
  }

  return {
    follower,
    crescitaFollower,
    copertura,
    visualizzazioni,
    interazioni,
    visiteProfilo: sommaCampo(nel, "visite_profilo"),
    clickLink: sommaCampo(nel, "click_link"),
    variazioni: {
      copertura: variazionePercentuale(copertura, sommaCampo(prima, "copertura")),
      visualizzazioni: variazionePercentuale(visualizzazioni, sommaCampo(prima, "visualizzazioni")),
      interazioni: variazionePercentuale(interazioni, sommaCampo(prima, "interazioni")),
    },
    serie,
    giorniConDati: nel.filter((r) => r.copertura !== null || r.visualizzazioni !== null || r.interazioni !== null).length,
  };
}

export function interazioniPost(p: RigaStatisticaPost): number | null {
  if (p.interazioni !== null && p.interazioni !== undefined) return p.interazioni;
  const parti = [p.reazioni, p.commenti, p.condivisioni, p.salvataggi].filter(
    (x): x is number => x !== null && x !== undefined,
  );
  return parti.length ? parti.reduce((s, x) => s + x, 0) : null;
}

/** I post pubblicati nel periodo (oggi compreso), dal più coinvolgente. */
export function miglioriPost(
  post: RigaStatisticaPost[],
  giorni: number,
  adesso = new Date(),
  quanti = 5,
): RigaStatisticaPost[] {
  const { da } = intervalloPeriodo(giorni, adesso);
  return post
    .filter((p) => !!p.pubblicato_il && p.pubblicato_il.slice(0, 10) >= da)
    .sort(
      (x, y) =>
        (interazioniPost(y) ?? -1) - (interazioniPost(x) ?? -1) ||
        (y.copertura ?? -1) - (x.copertura ?? -1),
    )
    .slice(0, quanti);
}

export function formatNumero(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : new Intl.NumberFormat("it-IT").format(n);
}

export function formatVariazione(v: number | null): string | null {
  if (v === null) return null;
  return `${v > 0 ? "+" : ""}${v.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`;
}

export function etichettaUltimaSync(quando: string | null, adesso = new Date()): string {
  if (!quando) return "mai";
  const t = Date.parse(quando);
  if (!Number.isFinite(t)) return "mai";
  const minuti = Math.round((adesso.getTime() - t) / 60_000);
  if (minuti < 5) return "pochi minuti fa";
  if (minuti < 60) return `${minuti} minuti fa`;
  const ore = Math.round(minuti / 60);
  if (ore < 24) return ore === 1 ? "un'ora fa" : `${ore} ore fa`;
  return `il ${new Date(t).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}`;
}
