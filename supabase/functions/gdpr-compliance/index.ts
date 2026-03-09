import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, secureHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json();
    const { action, ...params } = body;

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return errorResponse("Non autorizzato", 401);

    const { data: profile } = await admin
      .from("profiles")
      .select("company_id, first_name, last_name")
      .eq("id", user.id)
      .single();

    if (!profile?.company_id) return errorResponse("Profilo non trovato", 403);
    const companyId = profile.company_id;

    switch (action) {
      // ── Request Data Export ──
      case "request_export": {
        // Check for existing pending request
        const { data: existing } = await admin
          .from("gdpr_data_requests")
          .select("id")
          .eq("user_id", user.id)
          .eq("request_type", "export")
          .eq("status", "pending")
          .maybeSingle();

        if (existing) return errorResponse("Hai già una richiesta di export in corso", 400);

        const { data: request, error } = await admin.from("gdpr_data_requests").insert({
          company_id: companyId,
          user_id: user.id,
          request_type: "export",
          status: "processing",
        }).select().single();

        if (error) throw error;

        // Collect user data
        const exportData: Record<string, unknown> = {};

        // Profile
        const { data: profileData } = await admin.from("profiles").select("*").eq("id", user.id).single();
        exportData.profile = profileData;

        // Orders
        const { data: orders } = await admin.from("orders").select("id, order_code, description, total_amount, created_at, status").eq("company_id", companyId);
        exportData.orders = orders;

        // Contacts (if marketing)
        const { data: contacts } = await admin.from("marketing_contacts").select("*").eq("company_id", companyId).limit(500);
        exportData.contacts = contacts;

        // Appointments
        const { data: appointments } = await admin.from("appointments").select("id, title, appointment_date, status").eq("company_id", companyId).limit(500);
        exportData.appointments = appointments;

        // Activity log
        const { data: activities } = await admin.from("company_activity_log").select("action, target_type, details, created_at").eq("company_id", companyId).eq("user_id", user.id).limit(500);
        exportData.activity_log = activities;

        // Consents
        const { data: consents } = await admin.from("gdpr_consents").select("*").eq("user_id", user.id);
        exportData.consents = consents;

        // Convert to JSON string
        const jsonContent = JSON.stringify(exportData, null, 2);
        const fileName = `gdpr-export-${user.id.substring(0, 8)}-${Date.now()}.json`;

        // Upload to storage (create bucket if needed)
        const bucketName = "gdpr-exports";
        await admin.storage.createBucket(bucketName, { public: false, fileSizeLimit: 52428800 }).catch(() => {});

        const { error: uploadError } = await admin.storage
          .from(bucketName)
          .upload(`${companyId}/${fileName}`, new Blob([jsonContent], { type: "application/json" }), {
            contentType: "application/json",
          });

        if (uploadError) throw uploadError;

        // Create signed URL (valid 24h)
        const { data: urlData } = await admin.storage
          .from(bucketName)
          .createSignedUrl(`${companyId}/${fileName}`, 86400);

        // Update request
        await admin.from("gdpr_data_requests").update({
          status: "completed",
          download_url: urlData?.signedUrl,
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          processed_at: new Date().toISOString(),
          processed_by: user.id,
        }).eq("id", request.id);

        // Audit log
        await admin.from("gdpr_audit_log").insert({
          company_id: companyId,
          user_id: user.id,
          action: "data_export_completed",
          details: { request_id: request.id, file_name: fileName },
        });

        return jsonResponse({ success: true, download_url: urlData?.signedUrl, expires_in_hours: 24 });
      }

      // ── Request Account Deletion ──
      case "request_deletion": {
        const { reason } = params;

        const { data: existing } = await admin
          .from("gdpr_data_requests")
          .select("id")
          .eq("user_id", user.id)
          .eq("request_type", "deletion")
          .in("status", ["pending", "processing"])
          .maybeSingle();

        if (existing) return errorResponse("Hai già una richiesta di cancellazione in corso", 400);

        const { data: request, error } = await admin.from("gdpr_data_requests").insert({
          company_id: companyId,
          user_id: user.id,
          request_type: "deletion",
          status: "pending",
          reason: reason || null,
        }).select().single();

        if (error) throw error;

        // Audit log
        await admin.from("gdpr_audit_log").insert({
          company_id: companyId,
          user_id: user.id,
          action: "deletion_requested",
          details: { request_id: request.id, reason },
        });

        return jsonResponse({ success: true, request_id: request.id });
      }

      // ── Process Deletion (admin only) ──
      case "process_deletion": {
        const { request_id, approve } = params;

        // Check if user is admin
        const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
        const isAdmin = roles?.some(r => r.role === "super_admin" || r.role === "company_admin");
        if (!isAdmin) return errorResponse("Solo gli amministratori possono processare le richieste", 403);

        const { data: request } = await admin
          .from("gdpr_data_requests")
          .select("*")
          .eq("id", request_id)
          .single();

        if (!request) return errorResponse("Richiesta non trovata", 404);

        if (approve) {
          // Anonymize profile data
          await admin.from("profiles").update({
            first_name: "DELETED",
            last_name: "USER",
            phone: null,
            avatar_url: null,
          }).eq("id", request.user_id);

          // Delete user from auth
          await admin.auth.admin.deleteUser(request.user_id);

          await admin.from("gdpr_data_requests").update({
            status: "completed",
            processed_at: new Date().toISOString(),
            processed_by: user.id,
          }).eq("id", request_id);

          await admin.from("gdpr_audit_log").insert({
            company_id: companyId,
            user_id: user.id,
            action: "deletion_completed",
            details: { request_id, target_user_id: request.user_id },
          });
        } else {
          await admin.from("gdpr_data_requests").update({
            status: "rejected",
            processed_at: new Date().toISOString(),
            processed_by: user.id,
          }).eq("id", request_id);

          await admin.from("gdpr_audit_log").insert({
            company_id: companyId,
            user_id: user.id,
            action: "deletion_rejected",
            details: { request_id, target_user_id: request.user_id },
          });
        }

        return jsonResponse({ success: true });
      }

      // ── Update Consent ──
      case "update_consent": {
        const { consent_type, granted } = params;
        if (!consent_type) return errorResponse("consent_type richiesto", 400);

        const now = new Date().toISOString();
        const consentData = {
          company_id: companyId,
          user_id: user.id,
          consent_type,
          granted: !!granted,
          granted_at: granted ? now : null,
          revoked_at: granted ? null : now,
          updated_at: now,
        };

        const { error } = await admin.from("gdpr_consents").upsert(consentData, {
          onConflict: "company_id,user_id,consent_type",
        });

        if (error) throw error;

        // Audit
        await admin.from("gdpr_audit_log").insert({
          company_id: companyId,
          user_id: user.id,
          action: granted ? "consent_granted" : "consent_revoked",
          details: { consent_type },
        });

        return jsonResponse({ success: true });
      }

      // ── Get My Consents ──
      case "get_consents": {
        const { data, error } = await admin
          .from("gdpr_consents")
          .select("*")
          .eq("user_id", user.id)
          .eq("company_id", companyId);

        if (error) throw error;
        return jsonResponse(data);
      }

      // ── Get My Requests ──
      case "get_requests": {
        const { data, error } = await admin
          .from("gdpr_data_requests")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (error) throw error;
        return jsonResponse(data);
      }

      // ── Admin: Get All Requests ──
      case "admin_get_requests": {
        const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
        const isAdmin = roles?.some(r => r.role === "super_admin" || r.role === "company_admin");
        if (!isAdmin) return errorResponse("Accesso negato", 403);

        const query = admin
          .from("gdpr_data_requests")
          .select("*, profiles:user_id(first_name, last_name)")
          .order("created_at", { ascending: false });

        // Super admin sees all; company admin sees own company
        const isSuperAdmin = roles?.some(r => r.role === "super_admin");
        if (!isSuperAdmin) {
          query.eq("company_id", companyId);
        }

        const { data, error } = await query.limit(100);
        if (error) throw error;
        return jsonResponse(data);
      }

      // ── Admin: Audit Log ──
      case "get_audit_log": {
        const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
        const isAdmin = roles?.some(r => r.role === "super_admin" || r.role === "company_admin");
        if (!isAdmin) return errorResponse("Accesso negato", 403);

        const isSuperAdmin = roles?.some(r => r.role === "super_admin");
        let query = admin
          .from("gdpr_audit_log")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200);

        if (!isSuperAdmin) {
          query = query.eq("company_id", companyId);
        }

        const { data, error } = await query;
        if (error) throw error;
        return jsonResponse(data);
      }

      default:
        return errorResponse("Azione non supportata", 400);
    }
  } catch (e) {
    console.error("gdpr-compliance error:", e);
    return errorResponse(e.message || "Errore interno", 500);
  }
});
