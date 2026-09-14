// supabase/functions/_shared/statisticheSocialMeta.ts
//
// Sincronizzazione delle statistiche di Pagina Facebook e profilo Instagram
// verso social_statistiche_giornaliere / social_statistiche_post /
// social_statistiche_stato, e aggiornamento di social_accounts.followers.
//
// Chi la chiama (nessuna edge function nuova: tetto 500):
//   • meta-ads-sync-insights — cron `meta-ads-sync-insights-4h`, ogni 4 ore,
//     dopo le inserzioni, con una scadenza: le pagine sincronizzate da più
//     tempo passano per prime, così nessuna resta indietro per sempre;
//   • meta-api-proxy, azione `sincronizza-statistiche-social` — «Aggiorna ora».
//
// Un permesso mancante (#10/#200/#190) NON è un errore della sincronizzazione:
// si scrive esito `permesso_mancante` sull'account e si passa oltre. Le
// inserzioni, che girano prima nello stesso cron, non ne risentono.
//
// Quali metriche e perché: vedi statisticheSocialLogica.ts.

// deno-lint-ignore-file no-explicit-any
import { decrypt, getEncryptionKey } from "./encryption.ts";
import {
  classificaErroreMeta,
  elencoGiorni,
  esitoAccount,
  giorniDaSincronizzare,
  giornoIso,
  MAX_GIORNI_FACEBOOK,
  MAX_GIORNI_INSTAGRAM,
  METRICHE_INSTAGRAM_GIORNO,
  METRICHE_INSTAGRAM_MEDIA,
  METRICHE_PAGINA,
  METRICHE_POST_FACEBOOK,
  numero,
  seguitiEPersi,
  unisciFollower,
  unixGiorno,
  valoriGiornoFacebook,
  valoriGiornoInstagram,
  valoriPaginaPerGiorno,
  valoriPostFacebook,
  valoriPostInstagram,
  valoriTotali,
  type ErroreMeta,
  type EsitoAccount,
  type MediaInstagramApi,
  type PostFacebookApi,
  type RispostaInsights,
  type ValoriGiorno,
  type ValoriPost,
} from "./statisticheSocialLogica.ts";

type Admin = any;

export interface OpzioniStatisticheSocial {
  apiVersion: string;
  companyId?: string;
  integrationId?: string;
  /** giorni da riscrivere (7/30/90 dalla UI); di norma 3, 30 la prima volta */
  giorni?: number;
  /** epoch ms: oltre questo istante non si comincia una nuova pagina */
  scadenzaMs?: number;
}

export interface EsitoStatisticheSocial {
  pagine_facebook: number;
  account_instagram: number;
  righe_giornaliere: number;
  righe_post: number;
  permessi_mancanti: number;
  saltati_per_tempo: number;
  errori: string[];
}

interface Chiamata {
  ok: boolean;
  data: any;
  errore: ErroreMeta | null;
}

type Graph = (percorso: string, token: string, parametri?: Record<string, string>) => Promise<Chiamata>;

function creaGraph(apiVersion: string): Graph {
  return async (percorso, token, parametri = {}) => {
    const url = new URL(`https://graph.facebook.com/${apiVersion}/${percorso}`);
    for (const [k, v] of Object.entries(parametri)) url.searchParams.set(k, v);
    url.searchParams.set("access_token", token);
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      const j = await r.json().catch(() => ({}));
      // Graph risponde a volte 200 con "error" nel corpo.
      if (!r.ok || j?.error) return { ok: false, data: j, errore: j?.error ?? { message: `HTTP ${r.status}` } };
      return { ok: true, data: j, errore: null };
    } catch (e) {
      return { ok: false, data: null, errore: { message: String(e).slice(0, 200) } };
    }
  };
}

/**
 * Chiede più metriche insieme; se Meta rifiuta il gruppo come non valido
 * (#100: metrica deprecata, account sotto soglia…) le riprova una per una,
 * tiene quelle buone e annota le altre. `metriche` si riduce sul posto: nei
 * giorni successivi non si richiede ciò che è già stato rifiutato.
 */
async function insightsConRipiego(
  graph: Graph,
  percorso: string,
  token: string,
  metriche: string[],
  parametri: Record<string, string>,
): Promise<{ risposta: RispostaInsights; nonDisponibili: string[]; errore: ErroreMeta | null }> {
  if (!metriche.length) return { risposta: { data: [] }, nonDisponibili: [], errore: null };
  const tutte = await graph(percorso, token, { ...parametri, metric: metriche.join(",") });
  if (tutte.ok) return { risposta: tutte.data as RispostaInsights, nonDisponibili: [], errore: null };
  if (classificaErroreMeta(tutte.errore) !== "metrica_non_valida") {
    return { risposta: { data: [] }, nonDisponibili: [], errore: tutte.errore };
  }
  const data: NonNullable<RispostaInsights["data"]> = [];
  const nonDisponibili: string[] = [];
  let errore: ErroreMeta | null = null;
  for (const m of [...metriche]) {
    const una = await graph(percorso, token, { ...parametri, metric: m });
    if (una.ok) {
      data.push(...((una.data as RispostaInsights)?.data ?? []));
      continue;
    }
    if (classificaErroreMeta(una.errore) === "metrica_non_valida") {
      nonDisponibili.push(m);
      const i = metriche.indexOf(m);
      if (i >= 0) metriche.splice(i, 1);
      continue;
    }
    errore = una.errore;
    break;
  }
  return { risposta: { data }, nonDisponibili, errore };
}

async function aGruppi<T, R>(elementi: T[], quanti: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < elementi.length; i += quanti) {
    out.push(...(await Promise.all(elementi.slice(i, i + quanti).map(fn))));
  }
  return out;
}

async function upsertALotti(
  admin: Admin,
  tabella: string,
  righe: Record<string, unknown>[],
  onConflict: string,
): Promise<{ scritte: number; errore: string | null }> {
  let scritte = 0;
  for (let i = 0; i < righe.length; i += 500) {
    const lotto = righe.slice(i, i + 500);
    const { error } = await admin.from(tabella).upsert(lotto, { onConflict });
    if (error) return { scritte, errore: String(error.message ?? error).slice(0, 160) };
    scritte += lotto.length;
  }
  return { scritte, errore: null };
}

interface Account {
  companyId: string;
  piattaforma: "facebook" | "instagram";
  accountId: string;
  paginaId: string;
}

const VUOTO: ValoriGiorno = {
  follower: null,
  nuovi_follower: null,
  follower_persi: null,
  copertura: null,
  visualizzazioni: null,
  interazioni: null,
  visite_profilo: null,
  click_link: null,
  metriche: {},
};

async function scriviGiorni(
  admin: Admin,
  acc: Account,
  righe: Array<{ giorno: string } & ValoriGiorno>,
): Promise<{ scritte: number; errore: string | null }> {
  if (!righe.length) return { scritte: 0, errore: null };
  const da = righe.map((r) => r.giorno).sort()[0];
  const { data: esistenti } = await admin
    .from("social_statistiche_giornaliere")
    .select("giorno, follower")
    .eq("company_id", acc.companyId)
    .eq("piattaforma", acc.piattaforma)
    .eq("account_esterno_id", acc.accountId)
    .gte("giorno", da);
  const followerDi = new Map<string, number | null>(
    ((esistenti ?? []) as Array<{ giorno: string; follower: number | null }>).map((r) => [r.giorno, r.follower]),
  );
  const adesso = new Date().toISOString();
  return upsertALotti(
    admin,
    "social_statistiche_giornaliere",
    righe.map((r) => ({
      company_id: acc.companyId,
      piattaforma: acc.piattaforma,
      account_esterno_id: acc.accountId,
      pagina_id: acc.paginaId,
      giorno: r.giorno,
      follower: unisciFollower(r.follower, followerDi.get(r.giorno)),
      nuovi_follower: r.nuovi_follower,
      follower_persi: r.follower_persi,
      copertura: r.copertura,
      visualizzazioni: r.visualizzazioni,
      interazioni: r.interazioni,
      visite_profilo: r.visite_profilo,
      click_link: r.click_link,
      metriche: r.metriche,
      sincronizzato_il: adesso,
    })),
    "company_id,piattaforma,account_esterno_id,giorno",
  );
}

async function scriviPost(admin: Admin, acc: Account, post: ValoriPost[]): Promise<{ scritte: number; errore: string | null }> {
  if (!post.length) return { scritte: 0, errore: null };
  const adesso = new Date().toISOString();
  return upsertALotti(
    admin,
    "social_statistiche_post",
    post.map((p) => ({
      company_id: acc.companyId,
      piattaforma: acc.piattaforma,
      account_esterno_id: acc.accountId,
      pagina_id: acc.paginaId,
      ...p,
      sincronizzato_il: adesso,
    })),
    "company_id,piattaforma,post_id",
  );
}

interface StatoDaSalvare {
  esito: EsitoAccount;
  messaggio: string | null;
  nonDisponibili: string[];
  nome?: string | null;
  username?: string | null;
  follower?: number | null;
  contenutiTotali?: number | null;
}

async function salvaStato(admin: Admin, acc: Account, s: StatoDaSalvare): Promise<string | null> {
  const adesso = new Date().toISOString();
  // Upsert di una riga sola: le colonne assenti restano quelle di prima
  // (un follower già letto non si cancella se oggi Meta non risponde).
  const riga: Record<string, unknown> = {
    company_id: acc.companyId,
    piattaforma: acc.piattaforma,
    account_esterno_id: acc.accountId,
    pagina_id: acc.paginaId,
    esito: s.esito,
    messaggio: s.messaggio,
    metriche_non_disponibili: [...new Set(s.nonDisponibili)],
    ultima_sync: adesso,
    updated_at: adesso,
  };
  if (s.nome) riga.nome = s.nome;
  if (s.username) riga.username = s.username;
  if (s.follower !== null && s.follower !== undefined) riga.follower = s.follower;
  if (s.contenutiTotali !== null && s.contenutiTotali !== undefined) riga.contenuti_totali = s.contenutiTotali;
  if (s.esito === "ok" || s.esito === "parziale") riga.ultima_sync_riuscita = adesso;
  const { error } = await admin
    .from("social_statistiche_stato")
    .upsert(riga, { onConflict: "company_id,piattaforma,account_esterno_id" });
  return error ? String(error.message ?? error).slice(0, 160) : null;
}

/** Raccoglie permessi mancanti ed errori di un account, con un messaggio leggibile. */
function registro(prefisso: string, errori: string[]) {
  const stato = { permesso: false, errore: false, nonDisponibili: [] as string[], messaggio: null as string | null };
  const annota = (e: ErroreMeta | null, cosa: string) => {
    const tipo = classificaErroreMeta(e);
    errori.push(`${prefisso}_${cosa.replace(/\W+/g, "_")}:${String(e?.message ?? "").slice(0, 80)}`);
    if (tipo === "permesso") {
      stato.permesso = true;
      stato.messaggio = `Meta non concede ${cosa}: ricollega Meta per vedere le statistiche.`;
    } else if (!stato.permesso) {
      stato.errore = true;
      stato.messaggio = tipo === "limite"
        ? "Limite di chiamate Meta raggiunto: riprova più tardi."
        : `Lettura di ${cosa} non riuscita: ${String(e?.message ?? "errore sconosciuto").slice(0, 160)}`;
    }
    return tipo;
  };
  return { stato, annota };
}

async function sincronizzaFacebook(
  graph: Graph,
  admin: Admin,
  acc: Account,
  token: string,
  giorniRichiesti: number | undefined,
  haStorico: boolean,
  esito: EsitoStatisticheSocial,
): Promise<void> {
  const { stato, annota } = registro(`fb_${acc.accountId}`, esito.errori);

  const info = await graph(acc.paginaId, token, { fields: "name,followers_count,fan_count" });
  const follower = info.ok ? (numero(info.data?.followers_count) ?? numero(info.data?.fan_count)) : null;
  if (!info.ok) annota(info.errore, "i dati della pagina");

  // Insights giornalieri della Pagina (una chiamata per tutto il periodo).
  const elenco = elencoGiorni(giorniDaSincronizzare(giorniRichiesti, haStorico, MAX_GIORNI_FACEBOOK));
  const ins = await insightsConRipiego(graph, `${acc.paginaId}/insights`, token, [...METRICHE_PAGINA], {
    period: "day",
    since: String(unixGiorno(elenco[0])),
    // fino a domani: il valore di ieri ha end_time oggi alle 07:00 UTC
    until: String(unixGiorno(giornoIso(new Date())) + 86_400),
  });
  stato.nonDisponibili.push(...ins.nonDisponibili);
  if (ins.errore) annota(ins.errore, "le statistiche della pagina (read_insights)");
  const nelPeriodo = new Set(elenco);
  const righe: Array<{ giorno: string } & ValoriGiorno> = [...valoriPaginaPerGiorno(ins.risposta).entries()]
    .filter(([giorno]) => nelPeriodo.has(giorno))
    .map(([giorno, v]) => ({ giorno, ...valoriGiornoFacebook(v) }));
  // La fotografia di oggi: i follower si vedono anche prima che Meta chiuda la giornata.
  if (follower !== null) {
    righe.push({ giorno: giornoIso(new Date()), ...VUOTO, follower, metriche: { followers_count: follower } });
  }
  const g = await scriviGiorni(admin, acc, righe);
  esito.righe_giornaliere += g.scritte;
  if (g.errore) esito.errori.push(`fb_${acc.accountId}_giorni_upsert:${g.errore}`);

  // Post degli ultimi 90 giorni con reazioni, commenti, condivisioni e,
  // se Meta li concede, visualizzazioni e clic per post.
  const campiBase =
    "id,message,story,created_time,permalink_url,full_picture,status_type," +
    "reactions.summary(true).limit(0),comments.summary(true).limit(0),shares";
  const since = String(Math.floor(Date.now() / 1000) - 90 * 86_400);
  let posts = await graph(`${acc.paginaId}/posts`, token, {
    fields: `${campiBase},insights.metric(${METRICHE_POST_FACEBOOK.join(",")})`,
    limit: "25",
    since,
  });
  if (!posts.ok && classificaErroreMeta(posts.errore) !== "limite") {
    if (classificaErroreMeta(posts.errore) === "permesso") annota(posts.errore, "le statistiche dei post (read_insights)");
    else stato.nonDisponibili.push("insights_post");
    posts = await graph(`${acc.paginaId}/posts`, token, { fields: campiBase, limit: "25", since });
  }
  if (posts.ok) {
    const valori = ((posts.data?.data ?? []) as PostFacebookApi[])
      .map(valoriPostFacebook)
      .filter((p): p is ValoriPost => p !== null);
    const p = await scriviPost(admin, acc, valori);
    esito.righe_post += p.scritte;
    if (p.errore) esito.errori.push(`fb_${acc.accountId}_post_upsert:${p.errore}`);
  } else {
    annota(posts.errore, "i post della pagina");
  }

  const errStato = await salvaStato(admin, acc, {
    esito: esitoAccount(stato),
    messaggio: stato.messaggio,
    nonDisponibili: stato.nonDisponibili,
    nome: info.ok ? (info.data?.name ?? null) : null,
    follower,
  });
  if (errStato) esito.errori.push(`fb_${acc.accountId}_stato:${errStato}`);
  if (follower !== null) {
    await admin
      .from("social_accounts")
      .update({ followers: follower, updated_at: new Date().toISOString() })
      .eq("company_id", acc.companyId)
      .eq("platform_id", "facebook")
      .eq("page_id", acc.paginaId);
  }
  esito.pagine_facebook += 1;
  if (stato.permesso) esito.permessi_mancanti += 1;
}

async function sincronizzaInstagram(
  graph: Graph,
  admin: Admin,
  acc: Account,
  token: string,
  giorniRichiesti: number | undefined,
  haStorico: boolean,
  esito: EsitoStatisticheSocial,
): Promise<void> {
  const { stato, annota } = registro(`ig_${acc.accountId}`, esito.errori);

  const info = await graph(acc.accountId, token, { fields: "username,name,followers_count,media_count" });
  const follower = info.ok ? numero(info.data?.followers_count) : null;
  if (!info.ok) annota(info.errore, "il profilo Instagram (instagram_basic)");

  // Metriche di account: total_value, un giorno alla volta.
  const elenco = elencoGiorni(giorniDaSincronizzare(giorniRichiesti, haStorico, MAX_GIORNI_INSTAGRAM));
  const metriche = [...METRICHE_INSTAGRAM_GIORNO];
  let seguitiDisponibili = true;
  let fermo = !info.ok && classificaErroreMeta(info.errore) !== "altro";
  const leggiGiorno = async (giorno: string): Promise<({ giorno: string } & ValoriGiorno) | null> => {
    if (fermo) return null;
    const base = {
      period: "day",
      metric_type: "total_value",
      since: String(unixGiorno(giorno)),
      until: String(unixGiorno(giorno) + 86_400),
    };
    const ins = await insightsConRipiego(graph, `${acc.accountId}/insights`, token, metriche, base);
    for (const m of ins.nonDisponibili) if (!stato.nonDisponibili.includes(m)) stato.nonDisponibili.push(m);
    if (ins.errore) {
      if (!fermo) {
        const tipo = annota(ins.errore, "le statistiche Instagram (instagram_manage_insights)");
        if (tipo === "permesso" || tipo === "limite") fermo = true;
      }
      return null;
    }
    let seguiti: { nuovi: number | null; persi: number | null } = { nuovi: null, persi: null };
    if (seguitiDisponibili) {
      const f = await graph(`${acc.accountId}/insights`, token, {
        ...base,
        metric: "follows_and_unfollows",
        breakdown: "follow_type",
      });
      if (f.ok) seguiti = seguitiEPersi(f.data as RispostaInsights);
      else {
        seguitiDisponibili = false;
        if (!stato.nonDisponibili.includes("follows_and_unfollows")) stato.nonDisponibili.push("follows_and_unfollows");
      }
    }
    return { giorno, ...valoriGiornoInstagram(valoriTotali(ins.risposta), seguiti) };
  };
  // Il primo giorno da solo: se una metrica viene rifiutata, i successivi non la richiedono più.
  const [primo, ...resto] = elenco;
  const righe = [await leggiGiorno(primo), ...(await aGruppi(resto, 5, leggiGiorno))]
    .filter((r): r is { giorno: string } & ValoriGiorno => r !== null);
  if (follower !== null) {
    righe.push({ giorno: giornoIso(new Date()), ...VUOTO, follower, metriche: { followers_count: follower } });
  }
  const g = await scriviGiorni(admin, acc, righe);
  esito.righe_giornaliere += g.scritte;
  if (g.errore) esito.errori.push(`ig_${acc.accountId}_giorni_upsert:${g.errore}`);

  // Contenuti degli ultimi 90 giorni (massimo 25) con le metriche per contenuto.
  if (!fermo || info.ok) {
    const media = await graph(`${acc.accountId}/media`, token, {
      fields: "id,caption,media_type,media_product_type,timestamp,permalink,media_url,thumbnail_url,like_count,comments_count",
      limit: "25",
    });
    if (media.ok) {
      const limite = Date.now() - 90 * 86_400_000;
      const elencoMedia = ((media.data?.data ?? []) as MediaInstagramApi[])
        .filter((m) => !m.timestamp || Date.parse(m.timestamp) >= limite);
      let insightsNegati = fermo;
      const leggiMedia = async (m: MediaInstagramApi): Promise<ValoriPost | null> => {
        if (!m.id) return null;
        if (insightsNegati) return valoriPostInstagram(m, {});
        // Lista per contenuto: un carosello può rifiutare una metrica che un reel accetta.
        const ins = await insightsConRipiego(graph, `${m.id}/insights`, token, [...METRICHE_INSTAGRAM_MEDIA], {});
        if (ins.errore) {
          const tipo = classificaErroreMeta(ins.errore);
          if (tipo === "permesso" || tipo === "limite") {
            if (!insightsNegati) annota(ins.errore, "le statistiche dei contenuti Instagram (instagram_manage_insights)");
            insightsNegati = true;
          }
          return valoriPostInstagram(m, {});
        }
        return valoriPostInstagram(m, valoriTotali(ins.risposta));
      };
      const [m0, ...altri] = elencoMedia;
      const valori = (m0 ? [await leggiMedia(m0), ...(await aGruppi(altri, 5, leggiMedia))] : [])
        .filter((p): p is ValoriPost => p !== null);
      const p = await scriviPost(admin, acc, valori);
      esito.righe_post += p.scritte;
      if (p.errore) esito.errori.push(`ig_${acc.accountId}_post_upsert:${p.errore}`);
    } else {
      annota(media.errore, "i contenuti Instagram");
    }
  }

  const errStato = await salvaStato(admin, acc, {
    esito: esitoAccount(stato),
    messaggio: stato.messaggio,
    nonDisponibili: stato.nonDisponibili,
    nome: info.ok ? (info.data?.name ?? null) : null,
    username: info.ok ? (info.data?.username ?? null) : null,
    follower,
    contenutiTotali: info.ok ? numero(info.data?.media_count) : null,
  });
  if (errStato) esito.errori.push(`ig_${acc.accountId}_stato:${errStato}`);
  if (follower !== null) {
    // social_accounts per Instagram usa come page_id la Pagina Facebook collegata.
    await admin
      .from("social_accounts")
      .update({ followers: follower, updated_at: new Date().toISOString() })
      .eq("company_id", acc.companyId)
      .eq("platform_id", "instagram")
      .eq("page_id", acc.paginaId);
  }
  esito.account_instagram += 1;
  if (stato.permesso) esito.permessi_mancanti += 1;
}

/**
 * Token della Pagina: prima uno fresco chiesto col token utente (quelli
 * salvati invecchiano e rispondono #10 sulle letture), poi quello salvato
 * in integration_credentials.meta_page_tokens.
 */
async function tokenPagina(
  graph: Graph,
  cred: { access_token_encrypted?: string | null; meta_page_tokens?: Record<string, string> | null },
  pageId: string,
  encKey: string,
): Promise<string | null> {
  if (cred.access_token_encrypted) {
    try {
      const tokenUtente = await decrypt(cred.access_token_encrypted, encKey);
      const fresco = await graph(pageId, tokenUtente, { fields: "access_token" });
      if (fresco.ok && fresco.data?.access_token) return String(fresco.data.access_token);
    } catch { /* si prova il token salvato */ }
  }
  const salvato = cred.meta_page_tokens?.[pageId];
  if (salvato) {
    try {
      return await decrypt(salvato, encKey);
    } catch { /* nessun token utilizzabile */ }
  }
  return null;
}

export async function sincronizzaStatisticheSocial(
  admin: Admin,
  opz: OpzioniStatisticheSocial,
): Promise<EsitoStatisticheSocial> {
  const esito: EsitoStatisticheSocial = {
    pagine_facebook: 0,
    account_instagram: 0,
    righe_giornaliere: 0,
    righe_post: 0,
    permessi_mancanti: 0,
    saltati_per_tempo: 0,
    errori: [],
  };
  const graph = creaGraph(opz.apiVersion);

  const qPagine = admin
    .from("meta_assets")
    .select("company_id, integration_id, asset_id, asset_name, metadata")
    .eq("asset_type", "page")
    .eq("selected", true);
  if (opz.companyId) qPagine.eq("company_id", opz.companyId);
  if (opz.integrationId) qPagine.eq("integration_id", opz.integrationId);
  const { data: pagine, error: errPagine } = await qPagine;
  if (errPagine) {
    esito.errori.push(`statistiche_social_pagine:${String(errPagine.message).slice(0, 120)}`);
    return esito;
  }
  type Pagina = { company_id: string; integration_id: string; asset_id: string; asset_name: string; metadata: any };
  const elencoPagine = (pagine ?? []) as Pagina[];
  if (!elencoPagine.length) return esito;

  const integrationIds = [...new Set(elencoPagine.map((p) => p.integration_id))];
  const companyIds = [...new Set(elencoPagine.map((p) => p.company_id))];
  const [integrazioniRes, credRes, statiRes] = await Promise.all([
    admin.from("integrations").select("id, status").in("id", integrationIds),
    admin
      .from("integration_credentials")
      .select("integration_id, access_token_encrypted, meta_page_tokens")
      .in("integration_id", integrationIds),
    admin
      .from("social_statistiche_stato")
      .select("company_id, piattaforma, account_esterno_id, ultima_sync, ultima_sync_riuscita")
      .in("company_id", companyIds),
  ]);
  if (statiRes.error) {
    // Migrazione non ancora applicata: le inserzioni vanno avanti lo stesso.
    esito.errori.push(`statistiche_social_schema:${String(statiRes.error.message).slice(0, 120)}`);
    return esito;
  }
  const collegate = new Set(
    ((integrazioniRes.data ?? []) as Array<{ id: string; status: string }>)
      .filter((i) => i.status === "connected")
      .map((i) => i.id),
  );
  const credDi = new Map(
    ((credRes.data ?? []) as Array<{ integration_id: string; access_token_encrypted: string; meta_page_tokens: Record<string, string> | null }>)
      .map((c) => [c.integration_id, c]),
  );
  const statoDi = new Map(
    ((statiRes.data ?? []) as Array<{ company_id: string; piattaforma: string; account_esterno_id: string; ultima_sync: string | null; ultima_sync_riuscita: string | null }>)
      .map((s) => [`${s.company_id}|${s.piattaforma}|${s.account_esterno_id}`, s]),
  );
  const ultimaSync = (p: Pagina) => Date.parse(statoDi.get(`${p.company_id}|facebook|${p.asset_id}`)?.ultima_sync ?? "") || 0;
  // Le pagine aggiornate da più tempo (o mai) per prime.
  elencoPagine.sort((a, b) => ultimaSync(a) - ultimaSync(b));

  const encKey = getEncryptionKey();
  for (const p of elencoPagine) {
    if (opz.scadenzaMs && Date.now() > opz.scadenzaMs) {
      esito.saltati_per_tempo += 1;
      continue;
    }
    const igId: string | null = p.metadata?.instagram_business_account?.id ?? null;
    const fb: Account = { companyId: p.company_id, piattaforma: "facebook", accountId: p.asset_id, paginaId: p.asset_id };
    const ig: Account | null = igId
      ? { companyId: p.company_id, piattaforma: "instagram", accountId: String(igId), paginaId: p.asset_id }
      : null;
    const haStorico = (acc: Account) => !!statoDi.get(`${acc.companyId}|${acc.piattaforma}|${acc.accountId}`)?.ultima_sync_riuscita;

    try {
      const cred = credDi.get(p.integration_id);
      const token = collegate.has(p.integration_id) && cred ? await tokenPagina(graph, cred, p.asset_id, encKey) : null;
      if (!token) {
        const messaggio = collegate.has(p.integration_id)
          ? "Token della pagina non disponibile: ricollega Meta per vedere le statistiche."
          : "Meta non è collegato: ricollega Meta per vedere le statistiche.";
        for (const acc of ig ? [fb, ig] : [fb]) {
          await salvaStato(admin, acc, { esito: "permesso_mancante", messaggio, nonDisponibili: [] });
          esito.permessi_mancanti += 1;
        }
        continue;
      }
      await sincronizzaFacebook(graph, admin, fb, token, opz.giorni, haStorico(fb), esito);
      if (ig) await sincronizzaInstagram(graph, admin, ig, token, opz.giorni, haStorico(ig), esito);
    } catch (e) {
      esito.errori.push(`statistiche_social_${p.company_id}_${p.asset_id}:${String(e).slice(0, 120)}`);
    }
  }
  return esito;
}
