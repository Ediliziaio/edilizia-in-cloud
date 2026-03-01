// Shared utility for recording system health metrics
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function recordMetric(params: {
  metricType: string;
  functionName?: string;
  statusCode?: number;
  latencyMs?: number;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    await supabase.from("system_health_metrics").insert({
      metric_type: params.metricType,
      function_name: params.functionName || null,
      status_code: params.statusCode || null,
      latency_ms: params.latencyMs || null,
      error_message: params.errorMessage || null,
      metadata: params.metadata || {},
    });
  } catch (e) {
    console.error("Failed to record metric:", e);
  }
}
