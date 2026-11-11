import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { FishAudioClient } from "./fishAudio.ts";
import { agentCompanyAccess } from "./agentCompanyAccess.ts";
import { amministraAzienda } from "./amministraAzienda.ts";
import { getCorsHeaders } from "./headers.ts";
import { saldoVoce } from "./voiceCredits.ts";
import { eseguiCustomerTool, suffissoTelefono } from "./ediliziaCustomerTools.ts";
import type { FishRuntimeDeps } from "./fishCentralino.ts";
import { checkRateLimit } from "./rateLimit.ts";
import { fishRealCustomerTool } from "./fishCustomerTools.ts";
import { fishCalendarTool } from "./fishCalendarTools.ts";

export function fishRuntimeDeps(): FishRuntimeDeps {
  const db: any = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const key = Deno.env.get("FISH_API_KEY") || "";
  return {
    db, fish: new FishAudioClient(key || "not-configured"), keyConfigured: !!key,
    secret: Deno.env.get("FISH_WEBHOOK_SECRET") || "", backendUrl: Deno.env.get("FISH_BACKEND_URL"), cors: getCorsHeaders,
    async allowCostlyAction(company) { return (await checkRateLimit({ functionName: "fish-agent-proxy", callerId: company, maxCalls: 6, windowSeconds: 60 })).allowed; },
    async authorize(req, company) {
      const token = req.headers.get("Authorization");
      if (!token?.startsWith("Bearer ")) throw new Response("Unauthorized", { status: 401 });
      const { data: { user }, error } = await db.auth.getUser(token.slice(7));
      if (error || !user) throw new Response("Unauthorized", { status: 401 });
      const access = await agentCompanyAccess(db, user.id, company, getCorsHeaders(req));
      const canAdmin = await amministraAzienda(db, user.id, access.companyId);
      return { companyId: access.companyId, userId: user.id, isAdmin: canAdmin, isSuperAdmin: access.isSuperAdmin };
    },
    async allowInbound(company, binding, agent) {
      const [balance, feature] = await Promise.all([saldoVoce(db, company), db.rpc("resolve_company_feature", { p_company_id: company, p_feature_key: "ai_agents" })]);
      const data = Array.isArray(feature.data) ? feature.data[0] : feature.data;
      const maxSeconds = Math.max(30, Math.min(3600, agent?.durata_max_secondi || 300));
      const maxCost = maxSeconds / 60 * Number(binding?.billed_per_min_eur);
      return !balance.bloccato && Number.isFinite(maxCost) && balance.spendibile >= maxCost && !feature.error && data?.is_enabled === true;
    },
    executeTool(company, phone, session, name, params, config) {
      if(["info_cliente","crea_ticket"].includes(name))return fishRealCustomerTool(db,company,phone,name,params);
      if(config?.calendarId && ["disponibilita","fissa_appuntamento"].includes(name)) return fishCalendarTool(db,company,config.calendarId,phone,name,params);
      return eseguiCustomerTool(db, company, { rawPhone: phone, suffix: suffissoTelefono(phone), conversationId: session }, name, params);
    },
  };
}
