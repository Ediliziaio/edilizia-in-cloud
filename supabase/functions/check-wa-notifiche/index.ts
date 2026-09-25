// MP03 — check-wa-notifiche (cron ogni 15 minuti)
// Valuta i trigger wa_notifiche_triggers accesi e manda le notifiche WhatsApp
// rispettando il cooldown (una volta per soggetto e trigger).
//
// 25/09/2026: non aveva MAI avuto un cron (ora in
// 20280925190000_cron_mancanti_campagne_notifiche_sessioni). Corretto insieme:
//  - chi chiama si controlla col sistema comune (i segreti dei cron o la
//    chiave di servizio), non più col solo INTERNAL_CRON_SECRET né leggendo il
//    ruolo da un JWT non verificato;
//  - a pg_net si risponde entro 5 secondi (serveConMetricheRapida);
//  - «fattura scaduta» leggeva total_amount e payment_status, che non esistono:
//    ora fatture esterne (invoices) e interne (documenti_fiscali), col residuo;
//  - «titolare» cercava i ruoli titolare/admin, che non esistono: ora
//    companies.titolare_user_id, altrimenti un amministratore dell'azienda;
//  - gli eventi in coda più vecchi di 3 giorni si chiudono senza inviare.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";
import { chiamataInternaValida, rispostaNonAutorizzata } from "../_shared/chiamataInterna.ts";
import { serveConMetricheRapida } from "../_shared/withMetricsRapida.ts";

/** Un evento più vecchio di così non manda più niente: la notizia è passata. */
const EVENTI_VALIDI_GIORNI = 3;

/** Fatture interne che si incassano (come la riconciliazione bancaria). */
const TIPI_FATTURA_INTERNA = [
  "fattura", "fattura_pa", "parcella", "fattura_accompagnatoria", "acconto_fattura",
  "acconto_parcella", "fattura_differita_b", "fattura_riepilogativa", "nota_debito",
];
const STATI_DA_INCASSARE = ["emessa", "inviata_sdi", "consegnata", "accettata", "parzialmente_pagata", "scaduta"];

interface TriggerRow {
  id: string;
  company_id: string;
  trigger_kind: string;
  enabled: boolean;
  config: Record<string, unknown> | null;
  template_name: string;
  wa_number_id: string | null;
  destinatario_kind: string | null;
  destinatario_custom_phone: string | null;
  fire_count: number | null;
}

interface Subject {
  subject_id: string;
  variables: Record<string, string>;
  destinatario_phone?: string;
}

serveConMetricheRapida("check-wa-notifiche", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!chiamataInternaValida(req)) return rispostaNonAutorizzata(corsHeaders);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Gli eventi vecchi si chiudono senza inviare: chi accende oggi una notifica
  // non deve ricevere quelle di mesi fa.
  const limiteEventi = new Date(Date.now() - EVENTI_VALIDI_GIORNI * 86_400_000).toISOString();
  await supabase
    .from("wa_notifiche_event_queue")
    .update({ processed: true, processed_at: new Date().toISOString() })
    .not("processed", "is", true)
    .lt("created_at", limiteEventi);

  const { data: triggers } = await supabase
    .from("wa_notifiche_triggers")
    .select("*")
    .eq("enabled", true);

  let fired = 0;
  let skipped = 0;
  const details: Array<Record<string, unknown>> = [];

  for (const t of (triggers ?? []) as TriggerRow[]) {
    try {
      const subjects = await evaluateTrigger(supabase, t);
      for (const subject of subjects) {
        // Prima il destinatario, poi il cooldown: senza un telefono la
        // notifica non deve bruciarsi, così parte quando il numero c'è.
        const destinatario = await resolveDestinatario(supabase, t, subject);
        if (!destinatario) continue;
        const ok = await checkAndSetCooldown(supabase, t.id, subject.subject_id);
        if (!ok) {
          skipped++;
          continue;
        }
        await fireNotifica(supabase, t, subject, destinatario);
        fired++;
        details.push({
          trigger: t.trigger_kind,
          subject_id: subject.subject_id,
          destinatario,
        });
      }
    } catch (e) {
      console.error(
        JSON.stringify({
          level: "error",
          fn: "check-wa-notifiche",
          trigger_id: t.id,
          error: String(e),
        }),
      );
    }
  }

  return new Response(
    JSON.stringify({
      fired,
      skipped,
      triggers: triggers?.length ?? 0,
      details: details.slice(0, 20),
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

async function evaluateTrigger(
  supabase: SupabaseClient,
  t: TriggerRow,
): Promise<Subject[]> {
  switch (t.trigger_kind) {
    case "fattura_scaduta": {
      // Scadute da almeno N giorni e non saldate, dei gestionali esterni e
      // della fatturazione interna. La cifra è quanto resta da incassare.
      const giorni = (t.config?.giorni_soglia as number) ?? 7;
      const soglia = new Date(Date.now() - giorni * 86_400_000).toISOString().substring(0, 10);
      const [esterne, interne] = await Promise.all([
        supabase
          .from("invoices")
          .select("id, invoice_number, total, paid_amount, client_company_name, due_date")
          .eq("company_id", t.company_id)
          .is("deleted_at", null)
          .not("status", "in", '("paid","cancelled","draft")')
          .lt("due_date", soglia)
          .limit(10),
        supabase
          .from("documenti_fiscali")
          .select("id, numero, totale_da_pagare, importo_pagato, cliente_snapshot, data_scadenza")
          .eq("company_id", t.company_id)
          .is("deleted_at", null)
          .in("tipo", TIPI_FATTURA_INTERNA)
          .in("stato", STATI_DA_INCASSARE)
          .lt("data_scadenza", soglia)
          .limit(10),
      ]);
      const euro = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 2 });
      const soggetti: Subject[] = [];
      for (const f of esterne.data ?? []) {
        const residuo = Number(f.total ?? 0) - Number(f.paid_amount ?? 0);
        if (residuo <= 0.005) continue;
        soggetti.push({
          subject_id: f.id,
          variables: {
            "1": String(f.invoice_number ?? "N/D"),
            "2": f.client_company_name ?? "N/D",
            "3": euro(residuo),
            "4": f.due_date ?? "",
          },
        });
      }
      for (const d of interne.data ?? []) {
        const residuo = Number(d.totale_da_pagare ?? 0) - Number(d.importo_pagato ?? 0);
        if (residuo <= 0.005) continue;
        const snap = (d.cliente_snapshot ?? {}) as { ragione_sociale?: string; nome?: string; cognome?: string };
        const cliente = snap.ragione_sociale || [snap.nome, snap.cognome].filter(Boolean).join(" ") || "N/D";
        soggetti.push({
          subject_id: d.id,
          variables: {
            "1": String(d.numero ?? "N/D"),
            "2": cliente,
            "3": euro(residuo),
            "4": d.data_scadenza ?? "",
          },
        });
      }
      return soggetti.slice(0, 10);
    }

    case "approvazione_pendente": {
      const giorni = (t.config?.giorni_soglia as number) ?? 3;
      const soglia = new Date(Date.now() - giorni * 86_400_000).toISOString();
      const { data } = await supabase
        .from("cantiere_segnalazioni")
        .select("id, descrizione, urgenza, created_at")
        .eq("company_id", t.company_id)
        .eq("stato", "aperta")
        .lt("created_at", soglia)
        .limit(5);
      return (data ?? []).map((s) => ({
        subject_id: s.id,
        variables: {
          "1": "segnalazione",
          "2": (s.descrizione ?? "").substring(0, 50),
          "3": s.urgenza ?? "media",
        },
      }));
    }

    case "ddt_pendente": {
      const ore = (t.config?.ore_soglia as number) ?? 48;
      const soglia = new Date(Date.now() - ore * 3_600_000).toISOString();
      const { data } = await supabase
        .from("ddt_ricezione")
        .select("id, numero_ddt, data_ricezione, stato, created_at, corriere")
        .eq("company_id", t.company_id)
        .eq("stato", "ricevuto")
        .lt("created_at", soglia)
        .limit(10);
      return (data ?? []).map((d) => ({
        subject_id: d.id,
        variables: {
          "1": String(d.numero_ddt ?? "N/D"),
          "2": d.corriere ?? "N/D",
          "3": String(d.data_ricezione ?? ""),
        },
      }));
    }

    case "margine_basso": {
      const percent = (t.config?.percentuale as number) ?? 10;
      const { data } = await supabase.rpc("get_cantieri_margine_basso", {
        p_company_id: t.company_id,
        p_soglia_percent: percent,
      });
      return ((data ?? []) as Array<{
        cantiere_id: string;
        nome: string;
        margine_percent: number;
        valore: number;
      }>).map((c) => ({
        subject_id: c.cantiere_id,
        variables: {
          "1": c.nome,
          "2": Number(c.margine_percent).toFixed(1),
          "3": Number(c.valore).toLocaleString("it-IT"),
        },
      }));
    }

    // Event-driven: drain dalla event queue per questo trigger_kind
    case "preventivo_inviato":
    case "sal_raggiunto":
    case "fattura_emessa": {
      const { data } = await supabase
        .from("wa_notifiche_event_queue")
        .select("id, subject_id, variables")
        .eq("company_id", t.company_id)
        .eq("trigger_kind", t.trigger_kind)
        .eq("processed", false)
        .order("created_at", { ascending: true })
        .limit(20);
      const subjects = ((data ?? []) as Array<{
        id: string;
        subject_id: string;
        variables: Record<string, string> | null;
      }>).map((row) => ({
        subject_id: row.subject_id,
        variables: (row.variables ?? {}) as Record<string, string>,
      }));
      // Marchia come processati gli eventi letti (anche se cooldown skippa,
      // il cooldown è gestito per subject_id separatamente).
      if ((data ?? []).length > 0) {
        const ids = (data ?? []).map((r) => (r as { id: string }).id);
        await supabase
          .from("wa_notifiche_event_queue")
          .update({ processed: true, processed_at: new Date().toISOString() })
          .in("id", ids);
      }
      return subjects;
    }

    case "custom":
      return [];
  }
  return [];
}

async function checkAndSetCooldown(
  supabase: SupabaseClient,
  triggerId: string,
  subjectId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("wa_notifiche_cooldown")
    .insert({ trigger_id: triggerId, subject_id: subjectId });
  return !error;
}

async function resolveDestinatario(
  supabase: SupabaseClient,
  t: TriggerRow,
  subject: Subject,
): Promise<string | null> {
  if (subject.destinatario_phone) return subject.destinatario_phone;
  if (t.destinatario_kind === "custom" && t.destinatario_custom_phone) {
    return t.destinatario_custom_phone;
  }
  if (t.destinatario_kind === "titolare") {
    // Il titolare segnato sull'azienda; se manca, un amministratore
    // dell'azienda col telefono. Mai il super admin della piattaforma: la
    // notifica è dell'azienda.
    const { data: azienda } = await supabase
      .from("companies")
      .select("titolare_user_id")
      .eq("id", t.company_id)
      .maybeSingle();
    if (azienda?.titolare_user_id) {
      const { data: titolare } = await supabase
        .from("profiles")
        .select("phone")
        .eq("id", azienda.titolare_user_id)
        .maybeSingle();
      if (titolare?.phone) return titolare.phone;
    }
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, phone")
      .eq("company_id", t.company_id)
      .not("phone", "is", null)
      .limit(20);
    const userIds = (profiles ?? []).map((p) => p.id);
    if (userIds.length === 0) return null;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("user_id", userIds)
      .eq("role", "company_admin");
    const amministratori = new Set((roles ?? []).map((r) => r.user_id));
    return (profiles ?? []).find((p) => amministratori.has(p.id))?.phone ?? null;
  }
  return null;
}

async function fireNotifica(
  supabase: SupabaseClient,
  t: TriggerRow,
  subject: Subject,
  destinatario: string,
): Promise<void> {
  if (!t.wa_number_id) return;

  const baseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const resp = await fetch(`${baseUrl}/functions/v1/whatsapp-send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      wa_number_id: t.wa_number_id,
      company_id: t.company_id,
      to: destinatario,
      template: { name: t.template_name, language: "it", variables: subject.variables },
    }),
  });

  const stato = resp.ok ? "sent" : "failed";
  const errorDetail = resp.ok ? null : (await resp.text()).substring(0, 500);

  await supabase.from("wa_notifiche_log").insert({
    trigger_id: t.id,
    company_id: t.company_id,
    subject_id: subject.subject_id,
    destinatario,
    template_name: t.template_name,
    variables_used: subject.variables,
    stato,
    error_detail: errorDetail,
  });

  if (resp.ok) {
    await supabase
      .from("wa_notifiche_triggers")
      .update({
        last_fired_at: new Date().toISOString(),
        fire_count: (t.fire_count ?? 0) + 1,
      })
      .eq("id", t.id);
  }
}
