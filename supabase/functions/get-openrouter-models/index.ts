/**
 * get-openrouter-models — proxy server-side per https://openrouter.ai/api/v1/models
 *
 * Perché esiste:
 *   La fetch browser-side a `https://openrouter.ai/api/v1/models` falliva
 *   silenziosa in alcune deploy (CORS preflight bloccato da Lovable preview
 *   o ad-blocker). Risultato: il selettore modelli AI Test Lab cadeva nel
 *   fallback DB `ai_model_catalog` che ha solo 12 modelli WHITELIST,
 *   mostrandone solo 6 effettivi.
 *
 *   Spostando il fetch in edge function:
 *     ✓ niente problema CORS (server-to-server)
 *     ✓ una sola entry-point per logging/monitoring
 *     ✓ cache HTTP gestita dal CDN Supabase
 *
 * Auth: nessuna (la lista modelli è pubblica). RLS sul DB non c'entra.
 *
 * Body: nessuno (GET-style)
 *
 * Response:
 *   { count: number, fetched_at: string, models: OpenRouterApiModel[] }
 */

import { getCorsHeaders } from "../_shared/headers.ts";

const OR_MODELS_URL = "https://openrouter.ai/api/v1/models";
const FETCH_TIMEOUT_MS = 10_000;

interface OpenRouterApiModel {
  id: string;
  name?: string;
  pricing?: {
    prompt?: string | number;
    completion?: string | number;
  };
  context_length?: number;
  architecture?: { modality?: string };
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  // Accetta sia GET sia POST (POST è quello usato da supabase.functions.invoke)
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(OR_MODELS_URL, {
      signal: controller.signal,
      headers: {
        // Mostriamo un User-Agent identificabile per debugging lato OpenRouter
        "User-Agent": "EdiliziaInCloud/1.0 (+https://www.ediliziaincloud.com)",
        Accept: "application/json",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return new Response(
        JSON.stringify({
          error: `OpenRouter API HTTP ${res.status}`,
          status: res.status,
          fetched_at: new Date().toISOString(),
        }),
        {
          status: 502,
          headers: { ...cors, "Content-Type": "application/json" },
        },
      );
    }

    const json = (await res.json()) as { data?: OpenRouterApiModel[] };
    const models = json.data ?? [];

    return new Response(
      JSON.stringify({
        count: models.length,
        fetched_at: new Date().toISOString(),
        models,
      }),
      {
        headers: {
          ...cors,
          "Content-Type": "application/json",
          // Cache 30 minuti edge-side (OpenRouter aggiorna la lista raramente)
          "Cache-Control": "public, max-age=1800, s-maxage=1800",
        },
      },
    );
  } catch (e) {
    clearTimeout(timeout);
    const message = e instanceof Error ? e.message : String(e);
    const isTimeout = e instanceof Error && e.name === "AbortError";
    return new Response(
      JSON.stringify({
        error: isTimeout ? "OpenRouter API timeout" : `OpenRouter API error: ${message}`,
        fetched_at: new Date().toISOString(),
      }),
      {
        status: 502,
        headers: { ...cors, "Content-Type": "application/json" },
      },
    );
  }
});
