// ============================================================================
// hr-check-scadenze — controllo giornaliero scadenze documenti dipendenti (HR)
// ============================================================================
// Cron (pg_cron) con header x-cron-secret (vedi _shared/cronAuth.ts).
// Per ogni documento (hr_documenti) in scadenza entro `alert_giorni_prima` o
// già scaduto, avvisa gli admin dell'azienda: notifica in campanella
// (tabella notifications) + email best-effort. Anti-doppione: niente nuova
// notifica per lo stesso documento/admin se già inviata negli ultimi 7 giorni.
// Nessun JWT utente (verify_jwt=false): l'auth è il cron-secret.
// v1.0.1 — config.toml verify_jwt=false.
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadProviderSettings, sendViaProviderWithFailover } from "../_shared/emailProvider.ts";

const CAT_LABEL: Record<string, string> = {
  contratto: "Contratto", visita_medica: "Visita medica", corso_sicurezza: "Corso sicurezza",
  idoneita: "Idoneità", patente: "Patente", durc: "DURC", documento_identita: "Documento d'identità",
  permesso_soggiorno: "Permesso di soggiorno", unilav: "Unilav", altro: "Documento",
};

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const [y, m, g] = d.split("-");
  return `${g}/${m}/${y}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (!cronSecretValido(req)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

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
  if (!docs.length) return new Response(JSON.stringify({ ok: true, companies: 0, notified: 0 }), { headers: { "Content-Type": "application/json" } });

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
  const provider = await loadProviderSettings("transactional").catch(() => null);

  for (const [companyId, companyDocs] of byCompany) {
    // Admin dell'azienda = profili della company con ruolo admin.
    const { data: profs } = await admin
      .from("profiles").select("id, email, first_name").eq("company_id", companyId);
    const admins = ((profs ?? []) as Array<{ id: string; email: string | null; first_name: string | null }>)
      .filter((p) => adminUserIds.has(p.id));
    if (!admins.length) continue;
    companiesProcessed++;

    const notifRows: any[] = [];
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

  console.log(`[hr-check-scadenze] companies=${companiesProcessed} notified=${notified} emails=${emailsSent}`);
  return new Response(JSON.stringify({ ok: true, companies: companiesProcessed, notified, emails: emailsSent }), { headers: { "Content-Type": "application/json" } });
});
