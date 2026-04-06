import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface CreateTasksPayload {
  company_id: string;
  data_iscrizione?: string; // ISO date string
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    const body = await req.json() as CreateTasksPayload;
    const { company_id, data_iscrizione } = body;

    if (!company_id) {
      return new Response(
        JSON.stringify({ error: "company_id è obbligatorio" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseDate = data_iscrizione ? new Date(data_iscrizione) : new Date();

    // Leggi template attivi
    const { data: templates, error: templateError } = await supabase
      .from("onboarding_task_template")
      .select("id, ordine, titolo, descrizione, giorni_da_iscrizione, assegna_a_ruolo")
      .eq("attivo", true)
      .order("ordine", { ascending: true });

    if (templateError) throw new Error(templateError.message);
    if (!templates || templates.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, tasks_created: 0, message: "Nessun template attivo" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Controlla se i task esistono già per questa azienda
    const { count: existing } = await supabase
      .from("onboarding_task")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company_id);

    if (existing && existing > 0) {
      return new Response(
        JSON.stringify({ ok: true, tasks_created: 0, message: "Task già esistenti per questa azienda" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Crea task per ogni template
    const tasksToInsert = templates.map((t) => {
      const scadenza = new Date(baseDate);
      scadenza.setDate(scadenza.getDate() + t.giorni_da_iscrizione);
      return {
        company_id,
        template_id: t.id,
        titolo: t.titolo,
        descrizione: t.descrizione ?? null,
        stato: "da_fare" as const,
        scadenza: scadenza.toISOString().split("T")[0],
      };
    });

    const { error: insertError, count: inserted } = await supabase
      .from("onboarding_task")
      .insert(tasksToInsert, { count: "exact" });

    if (insertError) throw new Error(insertError.message);

    return new Response(
      JSON.stringify({ ok: true, tasks_created: inserted ?? tasksToInsert.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto";
    console.error("[create-onboarding-tasks]", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
