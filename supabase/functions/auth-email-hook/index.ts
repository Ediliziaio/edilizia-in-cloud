/**
 * auth-email-hook — le email di autenticazione escono dalla posta della piattaforma.
 *
 * IL GUASTO CHE QUESTO FILE ESISTE PER EVITARE
 * --------------------------------------------
 * Recupero password, invito e conferma indirizzo uscivano dall'SMTP interno di
 * Supabase, che e' quello di sviluppo: tetto di DUE email all'ora su tutto il
 * progetto, e recapito da SMTP condiviso (finisce facilmente in spam). Dalla
 * terza richiesta di reset nella stessa ora non arrivava piu' niente a nessuno,
 * senza un errore visibile ne' per l'utente ne' per il superadmin.
 *
 * Nel frattempo la piattaforma aveva gia' la sua posta — resolveSender +
 * sendEmailUnified, con dominio verificato e log di consegna — usata per tutto
 * il resto. Le email di autenticazione erano l'unico flusso rimasto fuori.
 *
 * Supabase chiama questa funzione al posto di spedire, passando l'utente e i
 * dati del link (Send Email Hook). Qui si compone il messaggio e lo si spedisce
 * dalla stessa strada di tutte le altre.
 *
 * NB: deve essere deployata con --no-verify-jwt. Supabase la chiama senza JWT e
 * la autentica con la firma Standard Webhooks, verificata qui sotto.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { resolveSender } from "../_shared/resolveSender.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HOOK_SECRET = Deno.env.get("AUTH_EMAIL_HOOK_SECRET") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Numero WhatsApp dell'assistenza, come nelle altre email di sistema. */
const SUPPORT_WHATSAPP = "393501780908";

type AzioneEmail =
  | "signup"
  | "recovery"
  | "invite"
  | "magiclink"
  | "email_change"
  | "email_change_current"
  | "email_change_new"
  | "reauthentication";

interface PayloadHook {
  user: { email?: string; new_email?: string };
  email_data: {
    token: string;
    token_hash: string;
    token_new?: string;
    token_hash_new?: string;
    redirect_to?: string;
    email_action_type: AzioneEmail;
    site_url?: string;
  };
}

/**
 * Verifica la firma Standard Webhooks che Supabase mette sulla chiamata.
 * Confronto a lunghezza costante: una verifica che esce al primo byte diverso
 * dice al chiamante quanto ha indovinato.
 */
async function firmaValida(raw: string, headers: Headers): Promise<boolean> {
  if (!HOOK_SECRET) return false;
  const id = headers.get("webhook-id");
  const ts = headers.get("webhook-timestamp");
  const firme = headers.get("webhook-signature");
  if (!id || !ts || !firme) return false;

  // Il timestamp limita il riuso di una chiamata intercettata.
  const eta = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(eta) || eta > 300) return false;

  const base = HOOK_SECRET.startsWith("v1,whsec_")
    ? HOOK_SECRET.slice("v1,whsec_".length)
    : HOOK_SECRET.replace(/^whsec_/, "");
  const chiave = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(atob(base), (c) => c.charCodeAt(0)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    chiave,
    new TextEncoder().encode(`${id}.${ts}.${raw}`),
  );
  const attesa = btoa(String.fromCharCode(...new Uint8Array(mac)));

  for (const parte of firme.split(" ")) {
    const [versione, valore] = parte.split(",");
    if (versione !== "v1" || !valore) continue;
    if (confrontoCostante(valore, attesa)) return true;
  }
  return false;
}

function confrontoCostante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Testi per tipo di email. Chiave: oggetto, titolo, spiegazione, testo del pulsante. */
const TESTI: Record<string, { oggetto: string; titolo: string; corpo: string; bottone: string }> = {
  recovery: {
    oggetto: "Reimposta la tua password",
    titolo: "Hai chiesto una nuova password",
    corpo: "Premi il pulsante qui sotto per sceglierne una nuova. Il link vale un'ora. Se non sei stato tu, ignora questo messaggio: la password attuale resta valida.",
    bottone: "Scegli una nuova password",
  },
  signup: {
    oggetto: "Conferma il tuo indirizzo email",
    titolo: "Ci sei quasi",
    corpo: "Conferma il tuo indirizzo per attivare l'accesso.",
    bottone: "Conferma l'indirizzo",
  },
  invite: {
    oggetto: "Sei stato invitato su Edilizia in Cloud",
    titolo: "Ti hanno invitato",
    corpo: "Accetta l'invito e imposta la tua password per iniziare.",
    bottone: "Accetta l'invito",
  },
  magiclink: {
    oggetto: "Il tuo link di accesso",
    titolo: "Entra senza password",
    corpo: "Premi il pulsante per accedere. Il link vale un'ora e si usa una volta sola.",
    bottone: "Entra",
  },
  email_change: {
    oggetto: "Conferma il nuovo indirizzo email",
    titolo: "Conferma il cambio di indirizzo",
    corpo: "Premi il pulsante per confermare il nuovo indirizzo email.",
    bottone: "Conferma il nuovo indirizzo",
  },
  reauthentication: {
    oggetto: "Codice di verifica",
    titolo: "Conferma che sei tu",
    corpo: "Inserisci questo codice per completare l'operazione.",
    bottone: "",
  },
};

/**
 * Dove atterra chi preme il pulsante.
 *
 * Per il recupero password la destinazione DEVE avere un percorso: puntando
 * alla radice, il link apre una sessione e porta dritti dentro l'app senza mai
 * chiedere la nuova password — l'utente entra quella volta e alla successiva e'
 * di nuovo chiuso fuori. E' successo davvero, con il pulsante di reset della
 * scheda utente. Qui si corregge anche se il chiamante sbaglia.
 */
function destinazione(azione: AzioneEmail, redirect: string | undefined, siteUrl: string): string {
  const grezzo = redirect && redirect.trim() ? redirect.trim() : siteUrl;
  if (azione !== "recovery") return grezzo;
  try {
    const u = new URL(grezzo);
    if (u.pathname === "" || u.pathname === "/") {
      u.pathname = "/reset-password";
      return u.toString();
    }
    return grezzo;
  } catch {
    return `${siteUrl.replace(/\/+$/, "")}/reset-password`;
  }
}

function corpoHtml(t: typeof TESTI[string], link: string, codice: string): string {
  const pulsante = t.bottone
    ? `<p style="margin:28px 0;">
         <a href="${link}" style="background:#0f766e;color:#ffffff;text-decoration:none;
            padding:13px 26px;border-radius:8px;font-family:sans-serif;font-size:15px;
            font-weight:600;display:inline-block;">${t.bottone}</a>
       </p>
       <p style="font-family:sans-serif;font-size:12px;color:#6b7280;margin:0 0 4px;">
         Se il pulsante non funziona, copia questo indirizzo nel browser:
       </p>
       <p style="font-family:monospace;font-size:11px;color:#6b7280;word-break:break-all;margin:0;">
         ${link}
       </p>`
    : `<p style="font-family:monospace;font-size:26px;letter-spacing:5px;color:#111827;
          margin:28px 0;">${codice}</p>`;

  return `<div style="max-width:560px;margin:0 auto;padding:28px;">
    <h2 style="font-family:sans-serif;font-size:19px;color:#111827;margin:0 0 10px;">${t.titolo}</h2>
    <p style="font-family:sans-serif;font-size:14px;color:#374151;line-height:1.6;margin:0;">${t.corpo}</p>
    ${pulsante}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0 14px;">
    <p style="font-family:sans-serif;font-size:12px;color:#9ca3af;margin:0;">
      Problemi ad accedere? Scrivici su
      <a href="https://wa.me/${SUPPORT_WHATSAPP}" style="color:#0f766e;">WhatsApp</a>
      e ti diamo una mano.
    </p>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { http_code: 405, message: "Method not allowed" } }), {
      status: 405, headers: { "Content-Type": "application/json" },
    });
  }

  const raw = await req.text();
  if (!(await firmaValida(raw, req.headers))) {
    console.error("[auth-email-hook] firma non valida o segreto non configurato");
    return new Response(JSON.stringify({ error: { http_code: 401, message: "Unauthorized" } }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { user, email_data } = JSON.parse(raw) as PayloadHook;
    const azione = email_data.email_action_type;
    const testi = TESTI[azione] ?? TESTI.recovery;

    // Per il cambio indirizzo il messaggio va al NUOVO indirizzo, che e' quello
    // da confermare; per tutto il resto all'indirizzo dell'utente.
    const destinatario =
      azione === "email_change" || azione === "email_change_new"
        ? (user.new_email ?? user.email)
        : user.email;
    if (!destinatario) {
      return new Response(JSON.stringify({ error: { http_code: 400, message: "Nessun destinatario" } }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    const siteUrl = email_data.site_url ?? "https://app.ediliziaincloud.com";
    const dove = destinazione(azione, email_data.redirect_to, siteUrl);
    const link =
      `${SUPABASE_URL}/auth/v1/verify` +
      `?token=${encodeURIComponent(email_data.token_hash)}` +
      `&type=${encodeURIComponent(azione)}` +
      `&redirect_to=${encodeURIComponent(dove)}`;

    const sender = await resolveSender(null, "transactional", admin);

    const esito = await sendEmailUnified({
      companyId: null,
      stream: "transactional",
      to: destinatario,
      subject: `${testi.oggetto} — Edilizia in Cloud`,
      html: corpoHtml(testi, link, email_data.token),
      templateName: `auth_${azione}`,
      // Un'email di accesso non si nega mai per credito esaurito: chi non
      // riesce a entrare non puo' nemmeno ricaricare.
      skipCredits: true,
      adminClient: admin,
      senderOverride: sender,
      metadata: { auth_action: azione },
    });

    if (!esito.ok) {
      const messaggio = String((esito.body as { error?: unknown })?.error ?? `status ${esito.status}`);
      console.error("[auth-email-hook] invio fallito:", messaggio);
      return new Response(JSON.stringify({ error: { http_code: 500, message: messaggio } }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[auth-email-hook]", e);
    return new Response(
      JSON.stringify({ error: { http_code: 500, message: (e as Error).message } }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
