// deno-lint-ignore-file no-explicit-any
/**
 * Messaggi diretti di Instagram e Facebook Messenger → casella Conversazioni.
 *
 * Arrivano a meta-webhook come entry.messaging: object "instagram" (entry.id =
 * account Instagram professionale) oppure "page" (entry.id = pagina Facebook).
 * Un messaggio con is_echo è partito dall'azienda (da qui o dall'app di Meta):
 * la persona è il destinatario, non il mittente.
 *
 * Tutto dietro l'impostazione di piattaforma `meta_messaggi_attivi`:
 *  - vuota/"false" → spento: nessun permesso chiesto, pagine iscritte ai soli lead;
 *  - "revisione"   → per la App Review: i permessi li chiede solo il super admin
 *                    (ruolo sull'app) e le pagine provano anche `messages`;
 *  - "true"        → acceso per tutte le aziende, dopo l'approvazione di Meta.
 * Se Meta rifiuta `messages` la pagina resta iscritta ai lead.
 */

export type PiattaformaSocial = "instagram" | "messenger";

export interface MessaggioSocialMeta {
  piattaforma: PiattaformaSocial;
  /** Pagina Facebook (Messenger) o account Instagram che riceve. */
  accountId: string;
  /** PSID / IGSID della persona. */
  utenteId: string;
  direzione: "in" | "out";
  mid: string | null;
  testo: string | null;
  mediaUrl: string | null;
  allegati: { tipo: string; url: string | null }[];
  ts: string;
}

export const CHIAVE_ATTIVAZIONE = "meta_messaggi_attivi";
export const CAMPI_SOLO_LEAD = "leadgen";
export const CAMPI_LEAD_E_MESSAGGI = "leadgen,messages,message_echoes";
export const PERMESSI_MESSAGGI = ["pages_messaging", "instagram_basic", "instagram_manage_messages"];
const FINESTRA_MS = 24 * 60 * 60 * 1000;

export const ETICHETTA: Record<PiattaformaSocial, string> = {
  instagram: "Instagram",
  messenger: "Messenger",
};

/** Estrae i messaggi (in e out) da un payload webhook di Meta. Ignora letture, reazioni, consegne. */
export function estraiMessaggiSocial(payload: any): MessaggioSocialMeta[] {
  const piattaforma: PiattaformaSocial | null =
    payload?.object === "instagram" ? "instagram" : payload?.object === "page" ? "messenger" : null;
  if (!piattaforma) return [];
  const out: MessaggioSocialMeta[] = [];
  for (const entry of payload?.entry ?? []) {
    const accountId = entry?.id != null ? String(entry.id) : "";
    for (const ev of entry?.messaging ?? []) {
      const msg = ev?.message;
      if (!msg || msg.is_deleted || msg.is_unsupported) continue;
      const eco = msg.is_echo === true;
      const utente = eco ? ev?.recipient?.id : ev?.sender?.id;
      if (!accountId || utente == null || String(utente) === accountId) continue;
      const allegati = (Array.isArray(msg.attachments) ? msg.attachments : []).map((a: any) => ({
        tipo: String(a?.type ?? "file"),
        url: typeof a?.payload?.url === "string" ? a.payload.url : null,
      }));
      const testo = typeof msg.text === "string" && msg.text.trim() ? msg.text : null;
      if (!testo && allegati.length === 0) continue;
      const ms = Number(ev?.timestamp);
      out.push({
        piattaforma,
        accountId,
        utenteId: String(utente),
        direzione: eco ? "out" : "in",
        mid: msg.mid ? String(msg.mid) : null,
        testo,
        mediaUrl: allegati.find((a: { url: string | null }) => a.url)?.url ?? null,
        allegati,
        ts: new Date(Number.isFinite(ms) && ms > 0 ? ms : Date.now()).toISOString(),
      });
    }
  }
  return out;
}

/** Meta lascia rispondere liberamente entro 24 ore dall'ultimo messaggio della persona. */
export function dentroFinestra24Ore(ultimoIn: string | null | undefined, ora = Date.now()): boolean {
  if (!ultimoIn) return false;
  const t = new Date(ultimoIn).getTime();
  return Number.isFinite(t) && ora - t < FINESTRA_MS;
}

export type ModalitaMessaggiSocial = "spento" | "revisione" | "attivo";

export function leggiModalita(valore: unknown): ModalitaMessaggiSocial {
  const v = String(valore ?? "").trim().toLowerCase();
  if (v === "true" || v === "attivo") return "attivo";
  if (v === "revisione" || v === "review") return "revisione";
  return "spento";
}

/**
 * Modalità dei messaggi: prima platform_settings.meta_permessi_modalita
 * (JSON per gruppo, chiave "messaggi", vedi metaPermessi.ts), poi la vecchia
 * meta_messaggi_attivi. Letta qui senza importare metaPermessi (che importa
 * questo file).
 */
export function modalitaMessaggiDaImpostazioni(valoreJson: unknown, valoreVecchio: unknown): ModalitaMessaggiSocial {
  let messaggi: unknown = undefined;
  try {
    const o = typeof valoreJson === "string" ? JSON.parse(valoreJson) : valoreJson;
    if (o && typeof o === "object" && !Array.isArray(o)) messaggi = (o as Record<string, unknown>).messaggi;
  } catch {
    messaggi = undefined;
  }
  return leggiModalita(messaggi ?? valoreVecchio);
}

export async function modalitaMessaggiSocial(admin: any): Promise<ModalitaMessaggiSocial> {
  try {
    const { data } = await admin.from("platform_settings").select("key, value")
      .in("key", ["meta_permessi_modalita", CHIAVE_ATTIVAZIONE]);
    const righe = (data ?? []) as { key: string; value: unknown }[];
    return modalitaMessaggiDaImpostazioni(
      righe.find((r) => r.key === "meta_permessi_modalita")?.value,
      righe.find((r) => r.key === CHIAVE_ATTIVAZIONE)?.value,
    );
  } catch {
    return "spento";
  }
}

/** Le pagine provano l'iscrizione ai messaggi (con ripiego sui lead) in revisione e da accesi. */
export async function messaggiSocialAttivi(admin: any): Promise<boolean> {
  return (await modalitaMessaggiSocial(admin)) !== "spento";
}

/** Permessi dei messaggi nel collegamento Meta: tutti da acceso, solo il super admin in revisione. */
export function chiediPermessiMessaggi(modalita: ModalitaMessaggiSocial, isSuperAdmin: boolean): boolean {
  return modalita === "attivo" || (modalita === "revisione" && isSuperAdmin);
}

/**
 * Iscrive la pagina ai webhook. Con i messaggi attivi prova lead+messaggi; se
 * Meta rifiuta (permesso non approvato o non concesso) ripiega sui soli lead,
 * così l'ingresso dei lead non si ferma mai per colpa dei messaggi.
 */
export async function iscriviPaginaMeta(
  apiVersion: string,
  pageId: string,
  pageToken: string,
  conMessaggi: boolean,
  fetchFn: (url: string, init?: any) => Promise<{ json: () => Promise<any> }> = fetch,
): Promise<{ data: any; campi: string[] }> {
  const prova = async (campi: string) => {
    const res = await fetchFn(`https://graph.facebook.com/${apiVersion}/${pageId}/subscribed_apps`, {
      method: "POST",
      body: new URLSearchParams({ subscribed_fields: campi, access_token: pageToken }),
    });
    return await res.json();
  };
  if (conMessaggi) {
    const d = await prova(CAMPI_LEAD_E_MESSAGGI);
    if (!d?.error) return { data: d, campi: CAMPI_LEAD_E_MESSAGGI.split(",") };
    console.warn(`iscriviPaginaMeta: messaggi rifiutati su ${pageId}, solo lead:`, d.error?.message);
  }
  const d = await prova(CAMPI_SOLO_LEAD);
  return { data: d, campi: [CAMPI_SOLO_LEAD] };
}

interface Cfg {
  decrypt: (cifrato: string, chiave: any) => Promise<string>;
  encKey: any;
  apiVersion: string;
  fetchFn?: (url: string, init?: any) => Promise<{ json: () => Promise<any> }>;
}

interface PaginaMeta { integration_id: string; company_id: string; asset_id: string }

async function paginaDellAccount(admin: any, piattaforma: PiattaformaSocial, accountId: string): Promise<PaginaMeta | null> {
  let q = admin.from("meta_assets")
    .select("integration_id, company_id, asset_id")
    .eq("asset_type", "page")
    .eq("selected", true);
  q = piattaforma === "messenger"
    ? q.eq("asset_id", accountId)
    : q.eq("metadata->instagram_business_account->>id", accountId);
  const { data } = await q.limit(1);
  return (data?.[0] as PaginaMeta | undefined) ?? null;
}

async function tokenPagina(admin: any, pagina: PaginaMeta, cfg: Cfg): Promise<string | null> {
  const { data } = await admin.from("integration_credentials")
    .select("meta_page_tokens")
    .eq("integration_id", pagina.integration_id)
    .maybeSingle();
  const cifrato = (data?.meta_page_tokens as Record<string, string> | null)?.[pagina.asset_id];
  if (!cifrato) return null;
  return await cfg.decrypt(cifrato, cfg.encKey);
}

async function profiloUtente(ev: MessaggioSocialMeta, token: string, cfg: Cfg) {
  const campi = ev.piattaforma === "instagram" ? "name,username,profile_pic" : "first_name,last_name,profile_pic";
  try {
    const res = await (cfg.fetchFn ?? fetch)(
      `https://graph.facebook.com/${cfg.apiVersion}/${ev.utenteId}?fields=${campi}&access_token=${token}`,
    );
    const j = await res.json();
    if (!j || j.error) return {};
    return {
      nome: (j.name as string | undefined) ?? ([j.first_name, j.last_name].filter(Boolean).join(" ") || null),
      firstName: (j.first_name as string | undefined) ?? null,
      lastName: (j.last_name as string | undefined) ?? null,
      username: (j.username as string | undefined) ?? null,
      avatar: (j.profile_pic as string | undefined) ?? null,
    };
  } catch {
    return {};
  }
}

async function creaContatto(admin: any, companyId: string, ev: MessaggioSocialMeta, p: any): Promise<string> {
  const ig = ev.piattaforma === "instagram";
  const nomeCompleto: string = p.nome || (p.username ? `@${p.username}` : ig ? "Utente Instagram" : "Utente Messenger");
  const [primo, ...resto] = nomeCompleto.split(" ");
  const { data, error } = await admin.from("marketing_contacts").insert({
    company_id: companyId,
    first_name: p.firstName || primo,
    last_name: p.lastName || resto.join(" ") || "",
    source: ig ? "Instagram" : "Facebook Messenger",
    attr_source: ig ? "instagram" : "facebook",
    attr_medium: "social_dm",
    meta_platform: ig ? "instagram" : "messenger",
    tags: [ig ? "instagram-dm" : "messenger-dm"],
  }).select("id").single();
  if (error) throw new Error(`contatto non creato: ${error.message}`);
  return data.id as string;
}

async function identitaPerUtente(admin: any, ev: MessaggioSocialMeta, pagina: PaginaMeta, cfg: Cfg) {
  const chiave = { company_id: pagina.company_id, piattaforma: ev.piattaforma, account_id: ev.accountId, utente_id: ev.utenteId };
  const leggi = async () => {
    const { data } = await admin.from("social_identita").select("id, contact_id")
      .eq("company_id", chiave.company_id).eq("piattaforma", chiave.piattaforma)
      .eq("account_id", chiave.account_id).eq("utente_id", chiave.utente_id).maybeSingle();
    return data as { id: string; contact_id: string | null } | null;
  };
  const esistente = await leggi();
  if (esistente?.contact_id) return esistente;

  const token = await tokenPagina(admin, pagina, cfg).catch((): null => null);
  const profilo: any = token ? await profiloUtente(ev, token, cfg) : {};
  const contactId = await creaContatto(admin, pagina.company_id, ev, profilo);
  const campiProfilo = { nome: profilo.nome ?? null, username: profilo.username ?? null, avatar_url: profilo.avatar ?? null };

  if (esistente) {
    await admin.from("social_identita").update({ contact_id: contactId, ...campiProfilo, updated_at: new Date().toISOString() }).eq("id", esistente.id);
    return { id: esistente.id, contact_id: contactId };
  }
  const { data, error } = await admin.from("social_identita")
    .insert({ ...chiave, pagina_id: pagina.asset_id, contact_id: contactId, ...campiProfilo })
    .select("id, contact_id").single();
  if (!error) return data as { id: string; contact_id: string };
  if (error.code === "23505") {
    // Due messaggi della stessa persona nello stesso istante: vince il primo.
    await admin.from("marketing_contacts").delete().eq("id", contactId);
    const vincitore = await leggi();
    if (vincitore) return vincitore;
  }
  throw new Error(`identità non salvata: ${error.message}`);
}

/** Registra i messaggi arrivati dal webhook. Non lancia: conta e prosegue. */
export async function registraMessaggiSocial(admin: any, eventi: MessaggioSocialMeta[], cfg: Cfg) {
  const esito = { registrati: 0, doppi: 0, senza_azienda: 0, errori: 0 };
  for (const ev of eventi) {
    try {
      const pagina = await paginaDellAccount(admin, ev.piattaforma, ev.accountId);
      if (!pagina) { esito.senza_azienda++; continue; }
      const identita = await identitaPerUtente(admin, ev, pagina, cfg);
      const { error } = await admin.from("social_messaggi").insert({
        company_id: pagina.company_id,
        identita_id: identita.id,
        piattaforma: ev.piattaforma,
        direzione: ev.direzione,
        mid: ev.mid,
        testo: ev.testo,
        media_url: ev.mediaUrl,
        allegati: ev.allegati,
        inviato_at: ev.ts,
      });
      if (error) {
        if (error.code === "23505") { esito.doppi++; continue; }
        throw new Error(error.message);
      }
      if (ev.direzione === "in") {
        await admin.from("social_identita")
          .update({ ultimo_in_at: ev.ts, updated_at: new Date().toISOString() })
          .eq("id", identita.id)
          .or(`ultimo_in_at.is.null,ultimo_in_at.lt.${ev.ts}`);
      }
      esito.registrati++;
    } catch (e) {
      esito.errori++;
      console.error("socialMessaggiMeta: messaggio non registrato:", e instanceof Error ? e.message : e);
    }
  }
  return esito;
}

export type EsitoInvio = { ok: true; mid: string | null } | { ok: false; errore: string };

/** Risponde a una persona che ha scritto su Instagram o Messenger. */
export async function inviaMessaggioSocial(
  admin: any,
  p: { companyId: string; contactId: string; piattaforma: PiattaformaSocial; testo: string; userId: string },
  cfg: Cfg,
): Promise<EsitoInvio> {
  const testo = (p.testo ?? "").trim();
  if (!testo) return { ok: false, errore: "Scrivi un messaggio." };
  if (testo.length > 1000) return { ok: false, errore: "Il messaggio supera i 1000 caratteri consentiti da Meta." };

  const { data: righe } = await admin.from("social_identita")
    .select("id, account_id, pagina_id, utente_id, ultimo_in_at")
    .eq("company_id", p.companyId).eq("contact_id", p.contactId).eq("piattaforma", p.piattaforma)
    .order("ultimo_in_at", { ascending: false, nullsFirst: false })
    .limit(1);
  const id = righe?.[0];
  if (!id) return { ok: false, errore: `Questo contatto non ha mai scritto su ${ETICHETTA[p.piattaforma]}.` };
  if (!dentroFinestra24Ore(id.ultimo_in_at)) {
    return {
      ok: false,
      errore: "Sono passate più di 24 ore dall'ultimo messaggio del cliente: Meta non permette di rispondere da qui finché non scrive di nuovo.",
    };
  }

  const { data: pagine } = await admin.from("meta_assets")
    .select("integration_id, company_id, asset_id")
    .eq("company_id", p.companyId).eq("asset_type", "page").eq("asset_id", id.pagina_id).limit(1);
  const pagina = pagine?.[0] as PaginaMeta | undefined;
  if (!pagina) return { ok: false, errore: "La pagina Facebook non è più collegata: ricollega Meta nelle integrazioni." };
  const token = await tokenPagina(admin, pagina, cfg);
  if (!token) return { ok: false, errore: "Token della pagina mancante: ricollega Meta nelle integrazioni." };

  const res = await (cfg.fetchFn ?? fetch)(
    `https://graph.facebook.com/${cfg.apiVersion}/${id.pagina_id}/messages?access_token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: id.utente_id }, messaging_type: "RESPONSE", message: { text: testo } }),
    },
  );
  const j = await res.json();
  if (!j || j.error) return { ok: false, errore: `Meta ha rifiutato il messaggio: ${j?.error?.message ?? "risposta vuota"}` };

  const mid = (j.message_id as string | undefined) ?? null;
  const { error } = await admin.from("social_messaggi").insert({
    company_id: p.companyId,
    identita_id: id.id,
    piattaforma: p.piattaforma,
    direzione: "out",
    mid,
    testo,
    inviato_da: p.userId,
    inviato_at: new Date().toISOString(),
  });
  // 23505: l'eco del webhook è arrivata prima di noi, il messaggio c'è già.
  if (error && error.code !== "23505") console.error("inviaMessaggioSocial: inviato ma non salvato:", error.message);
  return { ok: true, mid };
}
