import { supabase } from "@/integrations/supabase/client";

type EsitoRpc = { data: unknown; error: { message: string } | null };
const db = supabase as unknown as {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<EsitoRpc>;
};

export async function outreachRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}
