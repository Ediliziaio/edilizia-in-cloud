/**
 * Amministratore DI QUALE azienda (26/09/2026).
 *
 * Il ruolo company_admin sta in user_roles senza azienda: vale per l'azienda
 * del profilo. In un'altra azienda, raggiunta con un accesso multi-azienda,
 * vale il grado di QUELL'accesso (access_role). Le funzioni che chiedevano
 * «ha il ruolo company_admin?» e poi «può entrare in quest'azienda?» facevano
 * dell'amministratore della propria azienda A un amministratore anche in B,
 * dove era entrato come semplice staff.
 *
 * È la regola di public.aziende_amministrate() / e_amministratore_di() nel
 * database, scritta per le funzioni che lavorano col service role (dove
 * auth.uid() è vuoto e le funzioni del database non sanno chi chiama).
 *
 * Niente import: così i test la eseguono davvero, con un client finto.
 * requireCompanyAccess in auth.ts NON va cambiata per questo (toccare auth.ts
 * ripubblica tutte le funzioni che lo importano): chi ha bisogno del ruolo in
 * un'azienda chiama requireCompanyAccess SENZA allowedRoles e poi queste.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClientServizio = any;

type RigaProfilo = { company_id?: string | null; is_blocked?: boolean | null } | null;
type RigaAccesso = { access_role?: string | null; expires_at?: string | null } | null;

async function profiloDi(db: ClientServizio, userId: string): Promise<RigaProfilo> {
  const { data } = await db.from("profiles").select("company_id, is_blocked").eq("id", userId).maybeSingle();
  return (data ?? null) as RigaProfilo;
}

async function ruoliGlobaliDi(db: ClientServizio, userId: string): Promise<string[]> {
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId);
  return ((data ?? []) as Array<{ role: string }>).map((r) => r.role);
}

/** Il grado dell'accesso multi-azienda ATTIVO e non scaduto dell'utente su questa azienda, o null. */
export async function gradoAccessoMultiAzienda(
  db: ClientServizio,
  userId: string,
  companyId: string,
  adesso: Date = new Date(),
): Promise<string | null> {
  if (!userId || !companyId) return null;
  const { data } = await db
    .from("multi_company_access")
    .select("access_role, expires_at")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .eq("status", "active")
    .maybeSingle();
  const accesso = (data ?? null) as RigaAccesso;
  if (!accesso?.access_role) return null;
  const scadenza = accesso.expires_at;
  if (scadenza !== null && scadenza !== undefined && !(new Date(scadenza) > adesso)) return null;
  return accesso.access_role;
}

/**
 * I ruoli che l'utente ha IN QUESTA azienda: quelli di user_roles se è
 * l'azienda del suo profilo, più il grado dell'accesso multi-azienda attivo su
 * questa azienda (può esserci anche sulla propria). Nessun ruolo globale vale
 * per un'altra azienda. Il super admin resta super admin dappertutto. Un
 * utente bloccato non ha ruoli.
 */
export async function ruoliNellAzienda(
  db: ClientServizio,
  userId: string,
  companyId: string,
  adesso: Date = new Date(),
): Promise<string[]> {
  if (!userId || !companyId) return [];
  const [profilo, globali, grado] = await Promise.all([
    profiloDi(db, userId),
    ruoliGlobaliDi(db, userId),
    gradoAccessoMultiAzienda(db, userId, companyId, adesso),
  ]);
  if (profilo?.is_blocked) return [];
  const ruoli = new Set<string>(profilo?.company_id === companyId ? globali : []);
  if (grado) ruoli.add(grado);
  if (globali.includes("super_admin")) ruoli.add("super_admin");
  return [...ruoli];
}

/**
 * L'utente è amministratore di QUESTA azienda? Azienda del profilo col ruolo
 * company_admin, oppure accesso multi-azienda attivo da amministratore.
 * Il super admin NON è compreso: chi lo ammette lo dice a parte.
 */
export async function amministraAzienda(
  db: ClientServizio,
  userId: string,
  companyId: string,
  adesso: Date = new Date(),
): Promise<boolean> {
  return (await ruoliNellAzienda(db, userId, companyId, adesso)).includes("company_admin");
}

/**
 * Da chiamare dopo requireCompanyAccess (senza allowedRoles): ferma con un 403
 * chi non è amministratore di QUESTA azienda. Il super admin passa, come
 * passava con allowedRoles. Stesso messaggio di requireCompanyAccess, così le
 * pagine non cambiano.
 */
export async function richiediAmministratoreAzienda(
  db: ClientServizio,
  userId: string,
  companyId: string,
  corsHeaders: Record<string, string>,
  accesso: { isSuperAdmin: boolean },
): Promise<void> {
  if (accesso.isSuperAdmin) return;
  if (await amministraAzienda(db, userId, companyId)) return;
  throw new Response(
    JSON.stringify({ error: "Forbidden: insufficient permissions for this action" }),
    { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
