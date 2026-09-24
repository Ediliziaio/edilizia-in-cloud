// ============================================================================
// hr-check-scadenze — controllo giornaliero delle scadenze: personale e mezzi
// ============================================================================
// Cron (pg_cron, 07:34) con header x-cron-secret (vedi _shared/cronAuth.ts).
//
// Personale — per ogni documento (hr_documenti) in scadenza entro
// `alert_giorni_prima` o già scaduto, avvisa gli admin dell'azienda: notifica in
// campanella (tabella notifications) + email best-effort + evento per le
// automazioni.
//
// Mezzi (dal 24/09/2026) — assicurazione, bollo, revisione, contratti,
// verifiche e prossimo tagliando dei mezzi aziendali, letti dalla vista
// mezzi_scadenze (che decide cosa è scaduto o in scadenza, rinnovi compresi).
// Avvisa gli admin e chi può modificare il Magazzino (stessi permessi dei
// mezzi): campanella `mezzo_scadenza` + email. Sta qui e non in una funzione
// nuova perché il progetto è vicino al tetto di 500 edge function.
//
// Anti-doppione: niente nuova notifica per lo stesso documento/utente se già
// inviata negli ultimi 7 giorni.
// Nessun JWT utente (verify_jwt=false): l'auth è il cron-secret. Risposta
// rapida a pg_net (withMetricsRapida): il lavoro finisce sotto waitUntil.
// ============================================================================
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadProviderSettings, sendViaProviderWithFailover } from "../_shared/emailProvider.ts";
// Mancava: `cronSecretValido` era usata sotto ma mai importata → ReferenceError
// alla prima richiesta, quindi 500 a OGNI esecuzione. Il cron delle 07:30
// risultava "succeeded" in job_run_details (pg_net accodava bene la chiamata)
// mentre la funzione non è mai arrivata a leggere un documento: gli avvisi di
// scadenza dei documenti del personale non sono mai partiti.
import { cronSecretValido } from "../_shared/cronAuth.ts";
import { serveConMetricheRapida } from "../_shared/withMetricsRapida.ts";

type Provider = Awaited<ReturnType<typeof loadProviderSettings>> | null;
type Esito = { companies: number; notified: number; emails: number };
const NESSUNO: Esito = { companies: 0, notified: 0, emails: 0 };

const CAT_LABEL: Record<string, string> = {
  contratto: "Contratto", visita_medica: "Visita medica", corso_sicurezza: "Corso sicurezza",
  idoneita: "Idoneità", patente: "Patente", durc: "DURC", documento_identita: "Documento d'identità",
  permesso_soggiorno: "Permesso di soggiorno", unilav: "Unilav", altro: "Documento",
};

const CAT_MEZZO: Record<string, string> = {
  assicurazione: "Assicurazione", bollo: "Bollo", revisione: "Revisione",
  contratto: "Contratto leasing/noleggio", verifica_periodica: "Verifica periodica",
  libretto: "Libretto", altro: "Documento", tagliando: "Tagliando",
};

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const [y, m, g] = d.split("-");
  return `${g}/${m}/${y}`;
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1, useGrouping: "always" }).format(n);
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Personale ────────────────────────────────────────────────────────────────

async function controllaPersonale(admin: SupabaseClient, provider: Provider): Promise<Esito> {
  // Documenti con scadenza entro la finestra di alert (o già scaduti), col nome del dipendente.
  const today = new Date().toISOString().slice(0, 10);
  const { data: docsRaw } = await admin
    .from("hr_documenti")
    .select("id, company_id, hr_profilo_id, categoria, titolo, data_scadenza, alert_giorni_prima, hr_profili!inner(nome, cognome)")
    .not("data_scadenza", "is", null);

  type Doc = {
    id: string; company_id: string; hr_profilo_id: string; categoria: string;
    titolo: string | null; data_scadenza: string; alert_giorni_prima: number;
    hr_profili: { nome: string; cognome: string } | { nome: string; cognome: string }[];
  };
  const todayMs = new Date(today + "T00:00:00Z").getTime();
  // Tieni solo quelli realmente in scadenza/scaduti (data_scadenza <= oggi + alert).
  const docs = ((docsRaw ?? []) as Doc[]).filter((d) => {
    const sc = new Date(d.data_scadenza + "T00:00:00Z").getTime();
    return sc <= todayMs + (d.alert_giorni_prima ?? 30) * 864e5;
  });
  if (!docs.length) return NESSUNO;

  // Admin globali (user_roles non ha company_id → si filtra via profiles.company_id).
  const { data: roleRows } = await admin.from("user_roles").select("user_id, role").in("role", ["company_admin", "super_admin"]);
  const adminUserIds = new Set<string>(((roleRows ?? []) as Array<{ user_id: string }>).map((r) => r.user_id));

  const byCompany = new Map<string, Doc[]>();
  for (const d of docs) { (byCompany.get(d.company_id) ?? byCompany.set(d.company_id, []).get(d.company_id)!).push(d); }

  // Notifiche hr_scadenza già create negli ultimi 7 giorni (anti-doppione).
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const { data: recentNotif } = await admin
    .from("notifications").select("user_id, entity_id")
    .eq("type", "hr_scadenza").gte("created_at", since).in("entity_id", docs.map((d) => d.id));
  const alreadySent = new Set<string>(((recentNotif ?? []) as Array<{ user_id: string; entity_id: string }>).map((n) => `${n.user_id}|${n.entity_id}`));

  let notified = 0, companiesProcessed = 0, emailsSent = 0;

  for (const [companyId, companyDocs] of byCompany) {
    // Admin dell'azienda = profili della company con ruolo admin.
    const { data: profs } = await admin
      .from("profiles").select("id, email, first_name").eq("company_id", companyId);
    const admins = ((profs ?? []) as Array<{ id: string; email: string | null; first_name: string | null }>)
      .filter((p) => adminUserIds.has(p.id));
    if (!admins.length) continue;
    companiesProcessed++;

    const notifRows: Record<string, unknown>[] = [];
    const perAdminNew = new Map<string, Doc[]>(); // admin.id → docs nuovi (per email)
    const newDocIds = new Set<string>(); // docs alla PRIMA segnalazione → evento automazione

    for (const d of companyDocs) {
      const prof = Array.isArray(d.hr_profili) ? d.hr_profili[0] : d.hr_profili;
      const nomeDip = `${prof?.nome ?? ""} ${prof?.cognome ?? ""}`.trim();
      const cat = CAT_LABEL[d.categoria] ?? "Documento";
      const sc = new Date(d.data_scadenza + "T00:00:00Z").getTime();
      const scaduto = sc < todayMs;
      const titolo = scaduto ? `${cat} scaduto — ${nomeDip}` : `${cat} in scadenza — ${nomeDip}`;
      const body = `${d.titolo ? d.titolo + " · " : ""}${scaduto ? "scaduto il" : "scade il"} ${fmtDate(d.data_scadenza)}`;
      for (const a of admins) {
        if (alreadySent.has(`${a.id}|${d.id}`)) continue;
        notifRows.push({
          company_id: companyId, user_id: a.id, type: "hr_scadenza",
          title: titolo, body, entity_type: "hr_documento", entity_id: d.id,
          action_url: "/azienda/personale?tab=profili",
        });
        (perAdminNew.get(a.id) ?? perAdminNew.set(a.id, []).get(a.id)!).push(d);
        newDocIds.add(d.id);
      }
    }

    if (notifRows.length) {
      const { error } = await admin.from("notifications").insert(notifRows);
      if (!error) notified += notifRows.length;
      else console.error("[hr-check-scadenze] insert notifications:", error.message);
    }

    // Evento per le AUTOMAZIONI (trigger "Documento del personale in scadenza"):
    // un evento per documento alla prima segnalazione (stesso anti-doppione
    // delle notifiche), così i flussi possono es. mandare email al team per il
    // DURC in scadenza. Payload con chiavi piatte per il filtro categoria e
    // chiavi puntate per le variabili {{documento.X}}/{{dipendente.nome}}.
    if (newDocIds.size > 0) {
      const eventRows = companyDocs
        .filter((d) => newDocIds.has(d.id))
        .map((d) => {
          const prof = Array.isArray(d.hr_profili) ? d.hr_profili[0] : d.hr_profili;
          const nomeDip = `${prof?.nome ?? ""} ${prof?.cognome ?? ""}`.trim();
          const sc = new Date(d.data_scadenza + "T00:00:00Z").getTime();
          const giorni = Math.ceil((sc - todayMs) / 864e5);
          return {
            company_id: companyId,
            trigger_event: "hr_document_expiring",
            entity_id: d.hr_profilo_id,
            entity_type: "employee",
            payload: {
              categoria: d.categoria,
              "documento.categoria": CAT_LABEL[d.categoria] ?? d.categoria,
              "documento.titolo": d.titolo ?? "",
              "documento.scadenza": fmtDate(d.data_scadenza),
              "documento.giorni_rimanenti": giorni,
              "dipendente.nome": nomeDip,
            },
          };
        });
      const { error: evErr } = await admin.from("automation_trigger_events").insert(eventRows);
      if (evErr) console.error("[hr-check-scadenze] insert trigger events:", evErr.message);
    }

    // Email best-effort: un digest per admin con i documenti nuovi di oggi.
    if (provider?.apiKey) {
      for (const a of admins) {
        const news = perAdminNew.get(a.id);
        if (!a.email || !news?.length) continue;
        const righe = news.map((d) => {
          const prof = Array.isArray(d.hr_profili) ? d.hr_profili[0] : d.hr_profili;
          const nomeDip = `${prof?.nome ?? ""} ${prof?.cognome ?? ""}`.trim();
          const cat = CAT_LABEL[d.categoria] ?? "Documento";
          const sc = new Date(d.data_scadenza + "T00:00:00Z").getTime();
          const stato = sc < todayMs ? "SCADUTO" : "in scadenza";
          return `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${nomeDip}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${cat}${d.titolo ? " · " + d.titolo : ""}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;white-space:nowrap"><b>${stato}</b> ${fmtDate(d.data_scadenza)}</td></tr>`;
        }).join("");
        const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px">
          <h2 style="color:#0EA5E9;margin:0 0 4px">Scadenze personale</h2>
          <p style="color:#444;margin:0 0 12px">Ci sono ${news.length} documento/i del personale da controllare:</p>
          <table style="border-collapse:collapse;width:100%;font-size:14px"><thead><tr style="text-align:left;color:#888;font-size:12px">
            <th style="padding:6px 10px">Dipendente</th><th style="padding:6px 10px">Documento</th><th style="padding:6px 10px">Scadenza</th></tr></thead>
            <tbody>${righe}</tbody></table>
          <p style="margin:16px 0 0"><a href="https://app.ediliziaincloud.com/azienda/personale?tab=profili" style="background:#0EA5E9;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block">Apri il personale</a></p>
        </div>`;
        try {
          const r = await sendViaProviderWithFailover("transactional", provider, {
            from: provider.fromDefault, to: [a.email],
            subject: `Scadenze personale: ${news.length} da controllare`, html,
          });
          if (r.ok) emailsSent++;
        } catch (e) { console.error("[hr-check-scadenze] email:", e instanceof Error ? e.message : String(e)); }
      }
    }
  }

  return { companies: companiesProcessed, notified, emails: emailsSent };
}

// ── Mezzi ────────────────────────────────────────────────────────────────────

type ScadenzaMezzo = {
  company_id: string; mezzo_id: string; mezzo_nome: string; targa: string | null;
  origine: string; riferimento_id: string; categoria: string; titolo: string | null;
  data_scadenza: string | null; contatore_scadenza: number | null; contatore_attuale: number | null;
  contatore_unita: string; stato: "scaduto" | "in_scadenza";
};

/** "scade il 04/10/2026", "scadenza passata il 21/09/2026", "a 59.000 km (ora 58.500)". */
function quandoMezzo(s: ScadenzaMezzo): string {
  const parti: string[] = [];
  if (s.data_scadenza) {
    parti.push(`${s.stato === "scaduto" ? "scadenza passata il" : "scade il"} ${fmtDate(s.data_scadenza)}`);
  }
  if (s.contatore_scadenza != null) {
    const ora = s.contatore_attuale != null ? ` (ora ${fmtNum(Number(s.contatore_attuale))})` : "";
    parti.push(`a ${fmtNum(Number(s.contatore_scadenza))} ${s.contatore_unita}${ora}`);
  }
  return parti.join(" o ");
}

function nomeMezzo(s: ScadenzaMezzo): string {
  return s.targa ? `${s.mezzo_nome} (${s.targa})` : s.mezzo_nome;
}

async function controllaMezzi(admin: SupabaseClient, provider: Provider): Promise<Esito> {
  const { data, error } = await admin
    .from("mezzi_scadenze")
    .select("company_id, mezzo_id, mezzo_nome, targa, origine, riferimento_id, categoria, titolo, data_scadenza, contatore_scadenza, contatore_attuale, contatore_unita, stato")
    .in("stato", ["scaduto", "in_scadenza"]);
  if (error) {
    console.error("[hr-check-scadenze] mezzi_scadenze:", error.message);
    return NESSUNO;
  }
  const scadenze = (data ?? []) as ScadenzaMezzo[];
  if (!scadenze.length) return NESSUNO;

  const companyIds = [...new Set(scadenze.map((s) => s.company_id))];

  // Destinatari: admin dell'azienda (ruolo + profiles.company_id) e chi può
  // modificare il Magazzino in quell'azienda (staff_permissions.can_edit_warehouse).
  const { data: roleRows } = await admin.from("user_roles").select("user_id").in("role", ["company_admin", "super_admin"]);
  const adminUserIds = new Set<string>(((roleRows ?? []) as Array<{ user_id: string }>).map((r) => r.user_id));
  const { data: profs } = await admin.from("profiles").select("id, email, company_id").in("company_id", companyIds);
  const { data: staffRows } = await admin
    .from("staff_permissions").select("user_id, company_id")
    .in("company_id", companyIds).eq("can_edit_warehouse", true);

  const profili = (profs ?? []) as Array<{ id: string; email: string | null; company_id: string }>;
  const emailDi = new Map<string, string | null>(profili.map((p) => [p.id, p.email]));
  const staffIds = ((staffRows ?? []) as Array<{ user_id: string }>).map((r) => r.user_id).filter((id) => !emailDi.has(id));
  if (staffIds.length) {
    // Staff con accesso a più aziende: il profilo può stare su un'altra azienda.
    const { data: altri } = await admin.from("profiles").select("id, email").in("id", staffIds);
    for (const p of (altri ?? []) as Array<{ id: string; email: string | null }>) emailDi.set(p.id, p.email);
  }
  const destinatari = new Map<string, Set<string>>();
  for (const cid of companyIds) destinatari.set(cid, new Set());
  for (const p of profili) if (adminUserIds.has(p.id)) destinatari.get(p.company_id)?.add(p.id);
  for (const r of (staffRows ?? []) as Array<{ user_id: string; company_id: string }>) destinatari.get(r.company_id)?.add(r.user_id);

  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const { data: recenti } = await admin
    .from("notifications").select("user_id, entity_id")
    .eq("type", "mezzo_scadenza").gte("created_at", since)
    .in("entity_id", scadenze.map((s) => s.riferimento_id));
  const giaInviate = new Set(((recenti ?? []) as Array<{ user_id: string; entity_id: string }>).map((n) => `${n.user_id}|${n.entity_id}`));

  let notified = 0, companies = 0, emails = 0;

  for (const cid of companyIds) {
    const utenti = [...(destinatari.get(cid) ?? [])];
    if (!utenti.length) continue;
    companies++;
    const sue = scadenze.filter((s) => s.company_id === cid);
    const righe: Record<string, unknown>[] = [];
    const nuovePerUtente = new Map<string, ScadenzaMezzo[]>();

    for (const s of sue) {
      const cosa = CAT_MEZZO[s.categoria] ?? "Documento";
      const title = `${s.stato === "scaduto" ? "Scadenza passata" : "In scadenza"}: ${cosa.toLowerCase()} · ${nomeMezzo(s)}`;
      const body = `${s.titolo ? s.titolo + " · " : ""}${quandoMezzo(s)}`;
      for (const u of utenti) {
        if (giaInviate.has(`${u}|${s.riferimento_id}`)) continue;
        righe.push({
          company_id: cid, user_id: u, type: "mezzo_scadenza", title, body,
          entity_type: "mezzo", entity_id: s.riferimento_id, action_url: `/azienda/mezzi/${s.mezzo_id}`,
        });
        (nuovePerUtente.get(u) ?? nuovePerUtente.set(u, []).get(u)!).push(s);
      }
    }

    if (righe.length) {
      const { error: insErr } = await admin.from("notifications").insert(righe);
      if (!insErr) notified += righe.length;
      else console.error("[hr-check-scadenze] notifiche mezzi:", insErr.message);
    }

    if (!provider?.apiKey) continue;
    for (const [u, nuove] of nuovePerUtente) {
      const email = emailDi.get(u);
      if (!email || !nuove.length) continue;
      const tabella = nuove.map((s) => {
        const colore = s.stato === "scaduto" ? "#b91c1c" : "#b45309";
        return `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${escHtml(nomeMezzo(s))}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${escHtml(CAT_MEZZO[s.categoria] ?? "Documento")}${s.titolo ? " · " + escHtml(s.titolo) : ""}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;color:${colore}">${escHtml(quandoMezzo(s))}</td></tr>`;
      }).join("");
      const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px">
        <h2 style="color:#ea580c;margin:0 0 4px">Scadenze dei mezzi</h2>
        <p style="color:#444;margin:0 0 12px">${nuove.length === 1 ? "C'è una scadenza da controllare" : `Ci sono ${nuove.length} scadenze da controllare`}:</p>
        <table style="border-collapse:collapse;width:100%;font-size:14px"><thead><tr style="text-align:left;color:#888;font-size:12px">
          <th style="padding:6px 10px">Mezzo</th><th style="padding:6px 10px">Cosa</th><th style="padding:6px 10px">Quando</th></tr></thead>
          <tbody>${tabella}</tbody></table>
        <p style="margin:16px 0 0"><a href="https://app.ediliziaincloud.com/azienda/mezzi" style="background:#ea580c;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block">Apri i mezzi</a></p>
      </div>`;
      try {
        const r = await sendViaProviderWithFailover("transactional", provider, {
          from: provider.fromDefault, to: [email],
          subject: `Scadenze mezzi: ${nuove.length} da controllare`, html,
        });
        if (r.ok) emails++;
      } catch (e) { console.error("[hr-check-scadenze] email mezzi:", e instanceof Error ? e.message : String(e)); }
    }
  }

  return { companies, notified, emails };
}

serveConMetricheRapida("hr-check-scadenze", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (!cronSecretValido(req)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const provider: Provider = await loadProviderSettings("transactional").catch(() => null);

  // Un guasto sui mezzi non deve fermare gli avvisi del personale, e viceversa.
  const [personale, mezzi] = await Promise.all([
    controllaPersonale(admin, provider).catch((e) => {
      console.error("[hr-check-scadenze] personale:", e instanceof Error ? e.message : String(e));
      return NESSUNO;
    }),
    controllaMezzi(admin, provider).catch((e) => {
      console.error("[hr-check-scadenze] mezzi:", e instanceof Error ? e.message : String(e));
      return NESSUNO;
    }),
  ]);

  console.log(`[hr-check-scadenze] personale companies=${personale.companies} notified=${personale.notified} emails=${personale.emails} · mezzi companies=${mezzi.companies} notified=${mezzi.notified} emails=${mezzi.emails}`);
  // Le chiavi di prima restano quelle del personale: chi legge la risposta non cambia.
  return new Response(
    JSON.stringify({ ok: true, companies: personale.companies, notified: personale.notified, emails: personale.emails, mezzi }),
    { headers: { "Content-Type": "application/json" } },
  );
});
