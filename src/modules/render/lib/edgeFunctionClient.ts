import { supabase } from "@/integrations/supabase/client";

type EdgeFunctionErrorLike = {
  message?: string;
  context?: unknown;
} | null | undefined;

type EdgeFunctionDataLike = {
  error?: string;
  message?: string;
} | null | undefined;

type EdgeFunctionErrorPayload = {
  error?: string;
  message?: string;
};

export async function getEdgeFunctionAuthHeaders(): Promise<Record<string, string> | undefined> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

export async function resolveEdgeFunctionErrorMessage(args: {
  error?: EdgeFunctionErrorLike;
  data?: EdgeFunctionDataLike;
  fallback?: string;
}): Promise<string> {
  const { error, data, fallback = "Operazione fallita" } = args;
  let payload: EdgeFunctionErrorPayload | null = null;

  const responseLike = error?.context;
  if (responseLike instanceof Response) {
    try {
      payload = await responseLike.clone().json() as EdgeFunctionErrorPayload;
    } catch {
      try {
        const text = await responseLike.clone().text();
        if (text) {
          payload = { message: text };
        }
      } catch {
        // ignore secondary parse failures
      }
    }
  }

  return (
    payload?.message ||
    payload?.error ||
    data?.message ||
    data?.error ||
    error?.message ||
    fallback
  );
}
