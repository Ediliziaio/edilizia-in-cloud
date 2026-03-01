// Shared rate limiting utility for edge functions
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface RateLimitConfig {
  functionName: string;
  callerId: string;
  maxCalls: number;      // max calls allowed
  windowSeconds: number; // time window in seconds
}

export async function checkRateLimit(config: RateLimitConfig): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds?: number }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const windowStart = new Date(Date.now() - config.windowSeconds * 1000).toISOString();

  // Count recent calls
  const { count, error } = await supabase
    .from("edge_function_rate_limits")
    .select("*", { count: "exact", head: true })
    .eq("function_name", config.functionName)
    .eq("caller_id", config.callerId)
    .gte("called_at", windowStart);

  if (error) {
    console.error("Rate limit check error:", error);
    // Fail open - don't block if rate limit check fails
    return { allowed: true, remaining: config.maxCalls };
  }

  const currentCount = count || 0;
  const remaining = Math.max(0, config.maxCalls - currentCount);

  if (currentCount >= config.maxCalls) {
    return { allowed: false, remaining: 0, retryAfterSeconds: config.windowSeconds };
  }

  // Record this call
  await supabase.from("edge_function_rate_limits").insert({
    function_name: config.functionName,
    caller_id: config.callerId,
  });

  return { allowed: true, remaining: remaining - 1 };
}

export function rateLimitResponse(retryAfterSeconds: number, corsHeaders: Record<string, string>) {
  return new Response(
    JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSeconds),
      },
    }
  );
}
