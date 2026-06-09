import { requireAuth } from "./auth.ts";
import { errorResponse } from "./headers.ts";

// Il client admin non è tipizzato qui (Deno edge): manteniamo `any` localmente.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export interface ProduttoreCtx {
  userId: string;
  supabaseAdmin: Admin;
  produttoreId: string;
  isSuper: boolean;
}

/**
 * Risolve il PRODUTTORE chiamante: auth + azienda (profiles.company_id) + ruolo
 * (produttore_admin | super_admin). Centralizza la guardia ripetuta nelle edge
 * function produttore (audit #2). LANCIA (throw) una Response su errore: il
 * chiamante la intercetta con `if (e instanceof Response) return e;`.
 */
export async function resolveProduttore(req: Request, corsH: Record<string, string>): Promise<ProduttoreCtx> {
  const { userId, supabaseAdmin } = await requireAuth(req, corsH);

  const { data: profile } = await supabaseAdmin
    .from("profiles").select("company_id").eq("id", userId).single();
  const produttoreId = profile?.company_id as string | undefined;
  if (!produttoreId) throw errorResponse("Profilo senza azienda", 403, corsH);

  const { data: roleRows } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId);
  const roles = new Set((roleRows ?? []).map((r: { role: string }) => r.role));
  const isSuper = roles.has("super_admin");
  if (!isSuper && !roles.has("produttore_admin")) {
    throw errorResponse("Non autorizzato: ruolo produttore richiesto", 403, corsH);
  }
  return { userId, supabaseAdmin, produttoreId, isSuper };
}

/**
 * Carica un rivenditore verificando che sia FIGLIO del produttore (anti-IDOR),
 * salvo super_admin. LANCIA Response su not-found / IDOR. `columns` consente di
 * recuperare in un colpo solo i campi che servono al chiamante.
 */
export async function loadOwnedReseller(
  ctx: ProduttoreCtx,
  resellerId: string,
  corsH: Record<string, string>,
  columns = "id, parent_company_id",
) {
  const { data: reseller } = await ctx.supabaseAdmin
    .from("companies").select(columns).eq("id", resellerId).maybeSingle();
  if (!reseller) throw errorResponse("Rivenditore non trovato", 404, corsH);
  if (!ctx.isSuper && reseller.parent_company_id !== ctx.produttoreId) {
    throw errorResponse("Questo rivenditore non appartiene alla tua azienda", 403, corsH);
  }
  return reseller;
}
