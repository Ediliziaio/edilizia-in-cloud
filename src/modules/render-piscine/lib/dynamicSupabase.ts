import { supabase } from "@/integrations/supabase/client";

export type PiscineDbError = { message?: string } | null;
export type PiscineDbResult<T> = { data: T | null; error: PiscineDbError };

export type PiscineDbQuery<T = unknown> = PromiseLike<PiscineDbResult<T>> & {
  select: <R = T>(columns?: string) => PiscineDbQuery<R>;
  insert: <R = T>(values: unknown) => PiscineDbQuery<R>;
  update: <R = T>(values: unknown) => PiscineDbQuery<R>;
  eq: (column: string, value: unknown) => PiscineDbQuery<T>;
  order: (column: string, options?: { ascending?: boolean }) => PiscineDbQuery<T>;
  limit: (count: number) => PiscineDbQuery<T>;
  single: () => Promise<PiscineDbResult<T>>;
};

export type DynamicPiscineSupabase = {
  from: <T = unknown>(table: "render_piscine_sessions" | string) => PiscineDbQuery<T>;
};

export function getPiscineDb(): DynamicPiscineSupabase {
  return supabase as unknown as DynamicPiscineSupabase;
}
