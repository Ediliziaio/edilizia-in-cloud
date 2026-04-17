import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { getCorsHeaders } from "../_shared/headers.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface MilestonePayload {
  milestone_key: string;
  company_id: string;
  metadata?: Record<string, string>;
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    const body = await req.json() as MilestonePayload;
    const { milestone_key, company_id, metadata = {} } = body;

    if (!milestone_key || !company_id) {
      return new Response(
        JSON.stringify({ error: "milestone_key e company_id sono obbligatori" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Leggi configurazione milestone
    const { data: milestone, error: milestoneError } = await supabase
      .from("milestone_notifiche")
      .select("milestone_key, descrizione, attiva, email_destinatario, soggetto_template, corpo_template")
      .eq("milestone_key", milestone_key)
      .eq("attiva", true)
      .maybeSingle();

    if (milestoneError || !milestone) {
      return new Response(
        JSON.stringify({ error: "Milestone non trovata o non attiva" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Leggi dati azienda
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, name, email, subscription_plan_id")
      .eq("id", company_id)
      .maybeSingle();

    if (companyError || !company) {
      return new Response(
        JSON.stringify({ error: "Azienda non trovata" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Variabili template
    const now = new Date();
    const vars: Record<string, string> = {
      nome_azienda: company.name,
      piano: company.subscription_plan_id ?? "N/D",
      data: now.toLocaleDateString("it-IT"),
      ...metadata,
    };

    const soggetto = interpolate(milestone.soggetto_template, vars);
    const corpo = interpolate(milestone.corpo_template, vars);

    // Invia email
    await sendEmailUnified({
      companyId:    company_id,
      stream:       "transactional",
      to:           [milestone.email_destinatario],
      subject:      soggetto,
      html:         `<p>${corpo.replace(/\n/g, "<br>")}</p>`,
      templateName: `milestone_${milestone_key}`,
      skipCredits:  false,
      adminClient:  supabase,
      metadata:     { milestone_key, ...metadata },
    });

    // Logga in superadmin_comunicazioni
    await supabase.from("superadmin_comunicazioni").insert({
      company_id,
      tipo: "email",
      oggetto: soggetto,
      corpo,
      inviato_da_nome: "Sistema automatico",
      stato: "inviato",
      is_automatica: true,
      metadata: { milestone_key },
    });

    return new Response(
      JSON.stringify({ ok: true, soggetto }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto";
    console.error("[send-milestone-email]", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
