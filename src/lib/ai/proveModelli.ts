/**
 * «Prove modelli» del pannello AI (15/11/2026): i dati di admin_ai_prove_modelli e i segnali che
 * meritano uno sguardo. Modulo puro: la pagina disegna, qui si decide cosa è strano.
 */

export type RuoloModello = "principale" | "riserva" | "fuori_catena";

export interface ModelloDelCompito {
  modello: string;
  ruolo: RuoloModello;
  chiamate: number;
  riuscite: number;
  errori: number;
  /** Risposte arrivate da questo modello perché il principale non ce l'ha fatta. */
  da_riserva: number;
  costo: number;
  costo_medio: number | null;
  p50_ms: number | null;
  p95_ms: number | null;
  cache_pct: number | null;
  token_in: number | null;
  token_out: number | null;
  aziende: number;
  ultima: string;
  ultimo_errore: string | null;
}

export interface CompitoAI {
  task_key: string;
  etichetta: string | null;
  categoria: string | null;
  configurato: boolean;
  abilitato: boolean;
  principale: string | null;
  riserve: string[];
  chiamate: number;
  costo: number;
  modelli: ModelloDelCompito[];
}

export interface ChiamataDiretta {
  provider: string;
  modello: string;
  chiamate: number;
  errori: number;
  costo: number;
  ultima: string;
}

export interface AllarmeAperto {
  provider: string;
  motivo: string;
  aperto_il: string;
  conteggio: number;
  dettaglio: string | null;
}

export interface ProveModelli {
  dal: string;
  giorni: number;
  totali: { chiamate: number; errori: number; da_riserva: number; costo: number | null; cache_pct: number | null };
  compiti: CompitoAI[];
  diretti: ChiamataDiretta[];
  allarmi_aperti: AllarmeAperto[];
}

export type Gravita = "rosso" | "giallo" | "info";

export interface Segnale {
  gravita: Gravita;
  titolo: string;
  dettaglio: string;
  /** Il compito a cui portare, se c'è. */
  task_key?: string;
}

/** Sotto queste soglie un numero non dice ancora niente. */
const MIN_CHIAMATE = 5;
const SOGLIA_ERRORI = 0.5;
const SOGLIA_RISERVA = 0.1;
const SOGLIA_FUORI_CATENA = 0.2;
const COSTO_PER_CACHE = 1;
const CACHE_BASSA = 20;
const LENTO_MS = 60_000;

export const nomeCompito = (c: Pick<CompitoAI, "etichetta" | "task_key">) => c.etichetta?.trim() || c.task_key;
export const nomeModello = (m: string) => m.split("/").pop() ?? m;
export const providerModello = (m: string) => (m.includes("/") ? m.split("/")[0] : "n/d");

const percento = (x: number) => `${Math.round(x * 100)}%`;
const dollari = (x: number) => `${x.toFixed(2)} $`;

/** Cosa guardare per primo, dal più grave. */
export function segnaliDaGuardare(d: ProveModelli): Segnale[] {
  const out: Segnale[] = [];

  for (const a of d.allarmi_aperti) {
    out.push({
      gravita: "rosso",
      titolo: `Allarme aperto: ${a.provider}, ${a.motivo.replace(/_/g, " ")}`,
      dettaglio: `Dal ${new Date(a.aperto_il).toLocaleString("it-IT")}, ${a.conteggio} errori.${a.dettaglio ? ` ${a.dettaglio}` : ""}`,
    });
  }

  for (const c of d.compiti) {
    const nome = nomeCompito(c);
    for (const m of c.modelli) {
      if (m.chiamate >= MIN_CHIAMATE && m.errori / m.chiamate >= SOGLIA_ERRORI) {
        out.push({
          gravita: "rosso",
          titolo: `${nomeModello(m.modello)} fallisce in «${nome}»`,
          dettaglio: `${m.errori} errori su ${m.chiamate} chiamate.${m.ultimo_errore ? ` Ultimo: ${m.ultimo_errore}` : ""}`,
          task_key: c.task_key,
        });
      }
      if (m.p95_ms && m.p95_ms > LENTO_MS && m.riuscite >= MIN_CHIAMATE) {
        out.push({
          gravita: "giallo",
          titolo: `${nomeModello(m.modello)} è lento in «${nome}»`,
          dettaglio: `Una risposta su venti supera ${Math.round(m.p95_ms / 1000)} secondi.`,
          task_key: c.task_key,
        });
      }
    }
    if (c.chiamate < MIN_CHIAMATE) continue;
    const riuscite = c.modelli.reduce((s, m) => s + m.riuscite, 0);
    const daRiserva = c.modelli.reduce((s, m) => s + m.da_riserva, 0);
    if (riuscite >= 10 && daRiserva / riuscite > SOGLIA_RISERVA) {
      out.push({
        gravita: "giallo",
        titolo: `«${nome}» va spesso sulla riserva`,
        dettaglio: `${daRiserva} risposte su ${riuscite} (${percento(daRiserva / riuscite)}) non sono arrivate dal modello principale.`,
        task_key: c.task_key,
      });
    }
    if (c.configurato && c.principale && c.chiamate >= 10 && !c.modelli.some((m) => m.ruolo === "principale")) {
      out.push({
        gravita: "giallo",
        titolo: `Il modello principale di «${nome}» non lavora mai`,
        dettaglio: `Configurato ${nomeModello(c.principale)}, ma tutte le ${c.chiamate} chiamate sono andate ad altri modelli: il codice lo scavalca o non risponde.`,
        task_key: c.task_key,
      });
    }
    const fuori = c.modelli.filter((m) => m.ruolo === "fuori_catena");
    const costoFuori = fuori.reduce((s, m) => s + m.costo, 0);
    if (c.configurato && c.costo > 0 && costoFuori / c.costo > SOGLIA_FUORI_CATENA) {
      out.push({
        gravita: "info",
        titolo: `«${nome}» spende soprattutto fuori dalla catena`,
        dettaglio: `${percento(costoFuori / c.costo)} del costo da ${fuori.map((m) => nomeModello(m.modello)).join(", ")}: modelli scelti a mano o dal codice, non dalla configurazione.`,
        task_key: c.task_key,
      });
    }
    const anthropic = c.modelli.filter((m) => providerModello(m.modello) === "anthropic" && m.riuscite > 0);
    const costoAnthropic = anthropic.reduce((s, m) => s + m.costo, 0);
    const cacheMedia = costoAnthropic > 0
      ? anthropic.reduce((s, m) => s + (m.cache_pct ?? 0) * m.costo, 0) / costoAnthropic
      : null;
    if (costoAnthropic >= COSTO_PER_CACHE && cacheMedia !== null && cacheMedia < CACHE_BASSA) {
      out.push({
        gravita: "info",
        titolo: `Poca cache in «${nome}»`,
        dettaglio: `Solo il ${Math.round(cacheMedia)}% dei token in ingresso viene dalla cache, su ${dollari(costoAnthropic)} di modelli Anthropic: un prompt fisso in testa costerebbe meno.`,
        task_key: c.task_key,
      });
    }
    if (!c.configurato) {
      out.push({
        gravita: "info",
        titolo: `«${nome}» non ha una configurazione`,
        dettaglio: `${c.chiamate} chiamate con la catena di ripiego del router o col modello scelto dal codice.`,
        task_key: c.task_key,
      });
    }
  }

  const ordine: Record<Gravita, number> = { rosso: 0, giallo: 1, info: 2 };
  return out.sort((a, b) => ordine[a.gravita] - ordine[b.gravita]);
}

/** Compiti configurati che nel periodo non hanno fatto nessuna chiamata. */
export function compitiFermi(d: ProveModelli): CompitoAI[] {
  return d.compiti.filter((c) => c.configurato && c.abilitato && c.chiamate === 0);
}
