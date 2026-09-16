/**
 * avvisaSuperAdmin — notifica push + traccia in-app allo staff di piattaforma.
 *
 * Serve al caso concreto del cold outreach: quando un prospect risponde su
 * WhatsApp, chi presidia deve accorgersene SUBITO. Una risposta che resta
 * ferma mezz'ora e' un'occasione persa, e chi scrive "chi sei?" senza ricevere
 * risposta e' esattamente chi poi ti segnala.
 *
 * Due canali, di proposito:
 *  - riga in `notifications`: traccia durevole, sopravvive al telefono spento;
 *  - web push: la vibrazione sul telefono, ma SOLO per chi si e' iscritto.
 * Il push che fallisce non deve far fallire il chiamante: l'evento vero
 * (il messaggio ricevuto) e' gia' stato salvato prima.
 *
 * LIMITE DA CONOSCERE: il web push arriva nel BROWSER del telefono (o nella
 * PWA installata in home), NON dentro l'app nativa Capacitor — il WebView non
 * implementa la Push API. Per la notifica dentro l'app nativa servirebbe
 * @capacitor/push-notifications con FCM/APNs: il pacchetto e' installato ma
 * non e' cablato a niente.
 */

import { sendEmailUnified } from "./sendEmailUnified.ts";
import { destinatariDa, htmlAvviso, vaPerEmail, type RigaAvviso } from "./avvisoEmail.ts";

const PLATFORM_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

// deno-lint-ignore no-explicit-any
type Admin = any;

export interface AvvisoParams {
  titolo: string;
  testo: string;
  /** Dove porta il click. Percorso relativo, es. "/admin/marketing/whatsapp-locale". */
  url?: string;
  /** Tipo per la campanella/filtri (es. "whatsapp_risposta"). */
  tipo: string;
  /** Raggruppa le notifiche sullo stesso soggetto: le nuove sostituiscono le vecchie. */
  tag?: string;
  entityType?: string;
  entityId?: string | null;
  /** Falso per non far vibrare il telefono (es. uno STOP: da sapere, non da presidiare). */
  push?: boolean;
  /**
   * Il contenuto dell'email al titolare, se diverso da titolo/testo: il
   * messaggio intero invece dello snippet, e i dettagli (chi, casella, brand).
   * L'email parte solo per i tipi di `vaPerEmail` e se `avvisi_email_destinatari` è scritto.
   */
  email?: { testo?: string | null; righe?: RigaAvviso[] };
}

export interface AvvisoEsito {
  destinatari: number;
  push_inviate: number;
  push_fallite: number;
  email_inviate: number;
}

/**
 * L'email al titolare (16/09/2026): risposte e blocchi di outreach e WhatsApp
 * arrivano anche su Gmail, perché campanella e push si vedono solo con l'app
 * aperta. Mai bloccante: l'evento vero è già stato salvato dal chiamante.
 */
async function inviaAvvisoEmail(admin: Admin, p: AvvisoParams): Promise<number> {
  if (!vaPerEmail(p.tipo)) return 0;
  try {
    const { data } = await admin.from("platform_settings").select("value").eq("key", "avvisi_email_destinatari").maybeSingle();
    const to = destinatariDa(data?.value);
    if (!to.length) return 0;
    const appUrl = Deno.env.get("APP_URL") ?? "https://app.ediliziaincloud.com";
    const r = await sendEmailUnified({
      companyId: null,
      stream: "transactional",
      to,
      subject: p.titolo,
      html: htmlAvviso({ titolo: p.titolo, testo: p.email?.testo ?? p.testo, righe: p.email?.righe, url: p.url }, appUrl),
      templateName: `avviso_${p.tipo}`.slice(0, 60),
      skipCredits: true,
      adminClient: admin,
      metadata: { tipo: p.tipo, tag: p.tag ?? null },
    });
    return r.ok ? to.length : 0;
  } catch (e) {
    console.error("[avvisaSuperAdmin] email:", (e as Error)?.message);
    return 0;
  }
}

/** Gli utenti che presidiano la piattaforma. */
async function staffPiattaforma(admin: Admin): Promise<string[]> {
  const { data } = await admin
    .from("user_roles")
    .select("user_id")
    .in("role", [
      "super_admin", "platform_manager", "platform_sales",
      "platform_support", "platform_marketing", "platform_implementation",
    ]);
  const ids = (data ?? []).map((r: { user_id: string }) => r.user_id);
  return [...new Set(ids)] as string[];
}

export async function avvisaSuperAdmin(admin: Admin, p: AvvisoParams): Promise<AvvisoEsito> {
  const esito: AvvisoEsito = { destinatari: 0, push_inviate: 0, push_fallite: 0, email_inviate: 0 };

  // 0. Email al titolare, prima di tutto il resto: non dipende dallo staff
  //    iscritto al push, e le uscite anticipate qui sotto non devono saltarla.
  esito.email_inviate = await inviaAvvisoEmail(admin, p);

  const utenti = await staffPiattaforma(admin);
  if (utenti.length === 0) return esito;
  esito.destinatari = utenti.length;

  // 1. Traccia durevole. company_id e' NOT NULL: lo staff di piattaforma non
  //    ha un'azienda propria, quindi si intesta alla company della piattaforma.
  try {
    await admin.from("notifications").insert(
      utenti.map((uid) => ({
        company_id: PLATFORM_COMPANY_ID,
        user_id: uid,
        type: p.tipo,
        title: p.titolo,
        body: p.testo,
        entity_type: p.entityType ?? null,
        entity_id: p.entityId ?? null,
        action_url: p.url ?? null,
      })),
    );
  } catch (e) {
    console.error("[avvisaSuperAdmin] notifications:", (e as Error)?.message);
  }

  // 2. Push a chi si e' iscritto su questo o altri dispositivi.
  if (p.push === false) return esito;
  const { data: iscrizioni } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth_key")
    .in("user_id", utenti);

  if (!iscrizioni?.length) return esito;

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return esito;

  for (const s of iscrizioni as Array<{ endpoint: string; p256dh: string; auth_key: string }>) {
    try {
      const res = await fetch(`${url}/functions/v1/send-push-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // send-push-notification e' verify_jwt=true: il gateway accetta la
          // service key come Bearer valido.
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          endpoint: s.endpoint,
          p256dh: s.p256dh,
          auth_key: s.auth_key,
          title: p.titolo,
          body: p.testo,
          url: p.url,
          tag: p.tag,
        }),
      });
      if (res.ok) esito.push_inviate++;
      else esito.push_fallite++;
    } catch {
      esito.push_fallite++;
    }
  }

  return esito;
}
