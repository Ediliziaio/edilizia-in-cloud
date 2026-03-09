import { requireAuth, requireRole } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsHeaders);
    await requireRole(supabaseAdmin, userId, ["company_admin", "super_admin"], corsHeaders);

    const body = await req.json();
    const { action } = body; // list, create, update, delete, apply

    // Get actor's company_id (support super_admin impersonation via body.company_id)
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    // Super admins can pass company_id explicitly for impersonation
    const companyId = profile?.company_id || body.company_id;

    if (!companyId) {
      return new Response(JSON.stringify({ error: "No company found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list") {
      // Return company templates + system defaults
      const { data, error } = await supabaseAdmin
        .from("permission_templates")
        .select("*")
        .or(`company_id.eq.${companyId},is_system_default.eq.true`)
        .order("is_system_default", { ascending: false })
        .order("name");

      if (error) throw error;
      return new Response(JSON.stringify({ templates: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create") {
      const { name, description, permissions } = body;
      if (!name || !permissions) {
        return new Response(JSON.stringify({ error: "name and permissions required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data, error } = await supabaseAdmin
        .from("permission_templates")
        .insert({
          company_id: companyId,
          name,
          description: description || null,
          permissions,
          created_by: userId,
        })
        .select()
        .single();

      if (error) throw error;

      // Audit
      await supabaseAdmin.from("user_audit_log").insert({
        company_id: companyId,
        actor_id: userId,
        action: "permission_template_created",
        details: { template_id: data.id, name },
      });

      return new Response(JSON.stringify({ template: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update") {
      const { template_id, name, description, permissions } = body;
      if (!template_id) {
        return new Response(JSON.stringify({ error: "template_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Cannot edit system defaults
      const { data: existing } = await supabaseAdmin
        .from("permission_templates")
        .select("is_system_default, company_id")
        .eq("id", template_id)
        .single();

      if (!existing || existing.is_system_default || existing.company_id !== companyId) {
        return new Response(JSON.stringify({ error: "Cannot edit this template" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (permissions !== undefined) updates.permissions = permissions;

      const { data, error } = await supabaseAdmin
        .from("permission_templates")
        .update(updates)
        .eq("id", template_id)
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ template: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      const { template_id } = body;

      const { data: existing } = await supabaseAdmin
        .from("permission_templates")
        .select("is_system_default, company_id")
        .eq("id", template_id)
        .single();

      if (!existing || existing.is_system_default || existing.company_id !== companyId) {
        return new Response(JSON.stringify({ error: "Cannot delete this template" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabaseAdmin
        .from("permission_templates")
        .delete()
        .eq("id", template_id);

      if (error) throw error;

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "apply") {
      // Apply a template to a user's staff_permissions
      const { template_id, target_user_id } = body;
      if (!template_id || !target_user_id) {
        return new Response(JSON.stringify({ error: "template_id and target_user_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get template permissions
      const { data: template } = await supabaseAdmin
        .from("permission_templates")
        .select("permissions, name")
        .eq("id", template_id)
        .single();

      if (!template) {
        return new Response(JSON.stringify({ error: "Template not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify target user belongs to same company
      const { data: targetProfile } = await supabaseAdmin
        .from("profiles")
        .select("company_id")
        .eq("id", target_user_id)
        .single();

      if (!targetProfile || targetProfile.company_id !== companyId) {
        return new Response(JSON.stringify({ error: "User not in your company" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Upsert staff_permissions with template values
      const perms = template.permissions as Record<string, boolean>;
      const { error } = await supabaseAdmin
        .from("staff_permissions")
        .update(perms)
        .eq("user_id", target_user_id)
        .eq("company_id", companyId);

      if (error) throw error;

      // Audit
      await supabaseAdmin.from("user_audit_log").insert({
        company_id: companyId,
        actor_id: userId,
        target_user_id: target_user_id,
        action: "permission_template_applied",
        details: { template_id, template_name: template.name },
      });

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("manage-permission-template error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
