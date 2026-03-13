import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { type, table, record, old_record } = payload;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let triggerType: string | null = null;
    let triggerData: Record<string, unknown> = {};

    // CONTACTS
    if (table === "marketing_contacts") {
      if (type === "INSERT") {
        triggerType = "contact_created";
        triggerData = {
          contact_name: `${record.first_name ?? ""} ${record.last_name ?? ""}`.trim(),
          source: record.source,
          assignee_id: record.assigned_to,
          creator_id: record.created_by,
          contact_id: record.id,
        };
      }
    }

    // OPPORTUNITIES
    if (table === "marketing_opportunities") {
      if (type === "INSERT") {
        triggerType = "opportunity_created";
        triggerData = {
          opportunity_name: record.name,
          source: record.source,
          value: record.value,
          assignee_id: record.assigned_to,
          creator_id: record.created_by,
          opportunity_id: record.id,
          contact_id: record.contact_id,
        };
      } else if (
        type === "UPDATE" &&
        old_record?.stage_id !== record.stage_id
      ) {
        triggerType = "opportunity_stage_changed";
        triggerData = {
          opportunity_name: record.name,
          from_stage_id: old_record.stage_id,
          to_stage_id: record.stage_id,
          assignee_id: record.assigned_to,
          creator_id: record.created_by,
          opportunity_id: record.id,
          contact_id: record.contact_id,
        };
      }
    }

    // APPOINTMENTS
    if (table === "appointments") {
      if (type === "UPDATE") {
        if (
          record.status === "confirmed" &&
          old_record?.status !== "confirmed"
        ) {
          triggerType = "appointment_confirmed";
          triggerData = {
            appointment_title: record.title,
            appointment_date: record.appointment_date,
            assignee_id: record.assigned_to,
            creator_id: record.created_by,
            contact_id: record.contact_id,
            appointment_id: record.id,
          };
        } else if (
          record.is_completed === true &&
          old_record?.is_completed !== true
        ) {
          triggerType = "appointment_completed";
          triggerData = {
            appointment_title: record.title,
            assignee_id: record.assigned_to,
            creator_id: record.created_by,
            contact_id: record.contact_id,
            appointment_id: record.id,
          };
        }
      }
    }

    if (!triggerType) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "no matching trigger" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const companyId = record.company_id;
    if (!companyId) {
      return new Response(
        JSON.stringify({ error: "company_id not found in record" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch active rules for this trigger
    const { data: rules, error: rulesErr } = await supabase
      .from("task_automation_rules")
      .select("*")
      .eq("company_id", companyId)
      .eq("trigger_type", triggerType)
      .eq("is_active", true);

    if (rulesErr || !rules?.length) {
      return new Response(
        JSON.stringify({ executed: 0, trigger: triggerType }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If we need contact name for an opportunity, fetch it
    if (
      triggerData.contact_id &&
      !triggerData.contact_name &&
      (triggerType === "opportunity_created" ||
        triggerType === "opportunity_stage_changed" ||
        triggerType === "appointment_confirmed" ||
        triggerType === "appointment_completed")
    ) {
      const { data: contact } = await supabase
        .from("marketing_contacts")
        .select("first_name, last_name")
        .eq("id", triggerData.contact_id)
        .single();
      if (contact) {
        triggerData.contact_name =
          `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim();
      }
    }

    const results = [];

    for (const rule of rules) {
      // Evaluate conditions
      const conditions: Array<{
        field: string;
        operator: string;
        value: string;
      }> = (rule.conditions as any[]) ?? [];

      const passesConditions = conditions.every((c) => {
        const recordValue = triggerData[c.field];
        switch (c.operator) {
          case "=":
            return String(recordValue) === c.value;
          case "!=":
            return String(recordValue) !== c.value;
          case ">":
            return Number(recordValue) > Number(c.value);
          case "<":
            return Number(recordValue) < Number(c.value);
          case "contains":
            return String(recordValue ?? "").includes(c.value);
          default:
            return true;
        }
      });

      if (!passesConditions) continue;

      // Build task title with template variables
      let taskTitle = rule.action_title;
      taskTitle = taskTitle.replace(
        /\{\{contact_name\}\}/g,
        String(triggerData.contact_name ?? "")
      );
      taskTitle = taskTitle.replace(
        /\{\{opportunity_name\}\}/g,
        String(triggerData.opportunity_name ?? "")
      );
      taskTitle = taskTitle.replace(
        /\{\{appointment_title\}\}/g,
        String(triggerData.appointment_title ?? "")
      );
      taskTitle = taskTitle.replace(
        /\{\{source\}\}/g,
        String(triggerData.source ?? "")
      );

      // Determine assignee
      let assigneeId: string | null = null;
      if (rule.action_assign_to === "entity_assignee") {
        assigneeId = (triggerData.assignee_id as string) ?? null;
      } else if (rule.action_assign_to === "creator") {
        assigneeId = (triggerData.creator_id as string) ?? null;
      } else if (
        typeof rule.action_assign_to === "string" &&
        rule.action_assign_to.startsWith("user:")
      ) {
        assigneeId = rule.action_assign_to.split(":")[1];
      }

      // Calculate due date
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (rule.action_due_days ?? 1));

      // Create task
      const taskInsert: Record<string, unknown> = {
        company_id: companyId,
        title: taskTitle,
        notes: rule.action_notes,
        priority: rule.action_priority ?? "normale",
        status: "da_fare",
        category: rule.action_category ?? "generale",
        due_date: dueDate.toISOString(),
        assigned_to: assigneeId,
        created_by: assigneeId ?? (triggerData.creator_id as string) ?? null,
      };

      // Set correlation FK if available
      if (triggerData.contact_id) {
        taskInsert.contact_id = triggerData.contact_id;
      }
      if (triggerData.opportunity_id) {
        taskInsert.opportunity_id = triggerData.opportunity_id;
      }

      const { data: newTask, error: taskErr } = await supabase
        .from("tasks")
        .insert(taskInsert)
        .select("id")
        .single();

      // Update rule stats
      await supabase
        .from("task_automation_rules")
        .update({
          executions_count: (rule.executions_count ?? 0) + 1,
          last_executed_at: new Date().toISOString(),
        })
        .eq("id", rule.id);

      // Log execution
      await supabase.from("task_automation_log").insert({
        rule_id: rule.id,
        task_created_id: newTask?.id ?? null,
        trigger_data: triggerData,
        success: !taskErr,
        error: taskErr?.message ?? null,
      });

      results.push({
        rule_id: rule.id,
        task_id: newTask?.id,
        error: taskErr?.message,
      });
    }

    return new Response(
      JSON.stringify({ executed: results.length, trigger: triggerType, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
