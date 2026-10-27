import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SaltEdgeClient, saltConfiguration, saltId, saltPublicError, saltBody, verifySaltCallbackSignature, type SaltConnection } from "../_shared/saltedge.ts";
import { checkSaltDb, saltAttach, saltSync } from "../_shared/saltedgeStore.ts";

Deno.serve(async req => {
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const kind = new URL(req.url).pathname.split("/").at(-1)!;
  if (!["success", "fail", "notify", "destroy", "consent"].includes(kind)) return json({ error: "Not found" }, 404);
  const base = Deno.env.get("SALTEDGE_WEBHOOK_BASE_URL")?.replace(/\/$/, "");
  if (!base) return json({ error: "Not configured" }, 503);
  let raw: string;
  try { raw = await saltBody(req); } catch { return json({ error: "Payload too large" }, 413); }
  if (!(await verifySaltCallbackSignature(`${base}/${kind}`, raw, req.headers.get("Signature"), req.headers.get("Signature-key-version")))) return json({ error: "Invalid signature" }, 401);
  try {
    const { data, meta } = JSON.parse(raw);
    const time = Date.parse(meta?.time);
    if (String(meta?.version) !== "6" || !Number.isFinite(time) || time > Date.now() + 300000 || time < Date.now() - 86400000) return json({ error: "Expired callback" }, 400);
    saltId(data?.connection_id); saltId(data?.customer_id);
    if (kind === "notify") return json({ received: true });
    const db: any = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const existing = await db.from("bank_connections").select("*").eq("provider_slug", "saltedge").eq("provider_connection_id", data.connection_id).eq("saltedge_customer_id", data.customer_id).maybeSingle(); checkSaltDb(existing);
    let row = existing.data;
    if (row?.status === "disconnected") return json({ received: true });
    const pending = !row && typeof data.custom_fields?.eic_session_id === "string"
      ? await db.from("bank_saltedge_sessions").select("*").eq("id", data.custom_fields.eic_session_id).eq("customer_id", data.customer_id).gt("expires_at", new Date().toISOString()).maybeSingle() : null;
    if (pending) checkSaltDb(pending);
    if (!row && !pending?.data) return json({ received: true });
    const config = saltConfiguration(name => Deno.env.get(name), row?.company_id ?? pending!.data.company_id);
    const api = new SaltEdgeClient(config);
    if (kind === "destroy") {
      if (row) {
        checkSaltDb(await db.from("bank_accounts").update({ is_active: false }).eq("company_id", row.company_id).eq("connection_id", row.id));
        checkSaltDb(await db.from("bank_connections").update({ status: "disconnected", error_message: null }).eq("id", row.id).eq("company_id", row.company_id));
      }
      return json({ received: true });
    }
    if (!row) row = await saltAttach(db, (await api.request<SaltConnection>(`/connections/${data.connection_id}`)).data, pending!.data);
    if (kind === "consent") {
      // Read authoritative consent state; callbacks may arrive out of order.
      const remote = (await api.request<SaltConnection>(`/connections/${data.connection_id}`)).data;
      if (remote.customer_id !== row.saltedge_customer_id) return json({ error: "Not found" }, 404);
      const consent = remote.last_consent_id ? (await api.request<{ status: string; expires_at?: string }>(`/consents/${saltId(remote.last_consent_id)}?connection_id=${remote.id}&customer_id=${remote.customer_id}`)).data : null;
      if (remote.status !== "active" || (consent && consent.status !== "active")) checkSaltDb(await db.from("bank_connections").update({ status: "expired", error_message: "Consenso scaduto o revocato. Ricollega la banca." }).eq("id", row.id).eq("company_id", row.company_id));
      return json({ received: true });
    }
    if (kind === "success" && data.stage !== "finish") return json({ received: true });
    await saltSync(db, api, row);
    return json({ received: true });
  } catch (error) { return json(saltPublicError(error), 503); }
});
