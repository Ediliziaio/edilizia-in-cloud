import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import type { AppRole, Profile, Company, AuthState, MultiCompanyAccess } from "@/types/auth";
import { logger } from "@/utils/logger";
import { toast } from "sonner";
import { captureVelocityError, setSentryUserContext } from "@/lib/velocity/sentry";
import { isSuperAdminEmailAllowed } from "@/config/superAdmin";
import { queryKeys } from "@/lib/queryKeys";
import { warmupCriticalEdgeFunctions } from "@/lib/utils/edgeWarmup";
import { mergeProfileCompanyAccess, resolveMultiCompanySelection } from "@/lib/auth/multiCompany";
import { computeEffectiveRole } from "@/lib/roleHierarchy";

/**
 * Velocity Protocol — V1/V2
 * Timeout sulla critical path di auth: se Supabase è in cold-start (free tier
 * ibernato → 10-15s), preferiamo dare all'utente uno stato "non autenticato"
 * ritentabile piuttosto che spinner infinito.
 */
// 2026-05-28 Velocity tuning: ridotti i timeout per dare feedback più rapido
// all'utente in caso di cold-start. Prima: 20s critical + 12s watchdog +
// 22s race (line 793) → worst-case ~22s di spinner prima del fallback.
// Ora: 12s critical + 8s watchdog + 12s race → -10s in caso di pod freddo.
// I cache localStorage (persistenti cross-session) coprono il 99% degli
// accessi successivi al primo login, quindi il rischio di "spinner false-
// negative" è basso. Rete pessima (4G ballerino in cantiere): comunque
// utente vede "non autenticato" e può fare retry — meglio di spinner 22s.
const AUTH_CRITICAL_FETCH_TIMEOUT_MS = 12_000;
const AUTH_INITIAL_SESSION_WATCHDOG_MS = 8_000;
const WARMUP_FETCH_TIMEOUT_MS = 6_000;

interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  // Impersonation
  impersonatedCompanyId: string | null;
  impersonationToken: string | null;
  impersonatedCompany: Company | null;
  isImpersonating: boolean;
  /** True only after fetchUserData has confirmed the caller is super_admin.
   *  Prevents granting ALL_PERMISSIONS during the startup race where sessionStorage
   *  holds impersonation tokens but the role has not yet been fetched from DB. */
  isImpersonationReady: boolean;
  impersonateCompany: (companyId: string, permissions?: { can_manage_companies: boolean; allowed_company_ids: string[] | null }) => Promise<string | null>;
  exitImpersonation: () => Promise<void>;
  // Effective company (real or impersonated)
  effectiveCompany: Company | null;
  // Multi-company
  multiCompanyAccesses: MultiCompanyAccess[];
  multiCompanyLoaded: boolean;
  selectedMultiCompanyId: string | null;
  switchMultiCompany: (companyId: string) => void;
  // View-as (simula ruolo utente company senza cambio sessione)
  viewAsRole: AppRole | null;
  viewAsUserId: string | null;
  setViewAsRole: (role: AppRole | null, userId?: string | null) => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

// In sviluppo Vite/HMR puo mantenere in memoria due copie diverse del context
// dopo modifiche frequenti da piu terminali. Accettiamo l'update senza forzare
// reload: il reload automatico qui causava loop locali e boot bloccati su /admin.
if (import.meta.hot && typeof window !== "undefined") {
  import.meta.hot.accept();
}

// Impersonation persisted in sessionStorage (tab-scoped), validated server-side on restore
const SESSION_ID_KEY = "user_session_id";
const IMP_COMPANY_KEY = "imp_company_id";
const IMP_TOKEN_KEY = "imp_token";
const MULTI_COMPANY_KEY = "multi_company_selected";
// Flag di sessione: settato quando l'utente sceglie ESPLICITAMENTE un'azienda
// (dal selettore d'ingresso o dallo switcher). Serve a mostrare il selettore
// /seleziona-azienda una sola volta per sessione ai multi-azienda, distinguendo
// la scelta esplicita dalla selezione auto-risolta al login.
export const COMPANY_CHOSEN_KEY = "company_choice_made";
const MULTI_COMPANY_ACCESS_CACHE_KEY = "multi_company_accesses_v1";
const MULTI_COMPANY_ACCESS_CACHE_TTL_MS = 15 * 60 * 1000;
// Timestamp (ms) of when the impersonation token was created — used to skip redundant
// remote validation for freshly-minted tokens (avoids an edge-function cold-start per load).
const IMP_TOKEN_TS_KEY = "imp_token_ts";

// Profile/role/company cache in localStorage (Velocity 2026-05-28: migrato da
// sessionStorage per persistere cross-tab/cross-session).
//
// Prima (sessionStorage): cache utile solo per refresh nella STESSA tab.
// Apertura nuova tab o chiusura+riapertura browser → cache miss → fetchUserData
// blocking → 5-15s di spinner percepito.
//
// Ora (localStorage): cache sopravvive cross-tab e cross-session. TTL 15min.
// Al boot: render IMMEDIATO con cache stale, re-validate in background.
// Cache invalidata automaticamente su logout o sign-in con user diverso.
//
// Sicurezza: contiene solo {profile, role, company} — nessun token. I token
// auth restano in Supabase auth.storage (gestito da supabase-js).
const AUTH_PROFILE_CACHE_KEY = "auth_profile_v2"; // bump per migrare via dal sessionStorage v1
const AUTH_PROFILE_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function readProfileCache(userId: string): { profile: Profile | null; role: AppRole | null; company: Company | null } | null {
  try {
    // Migrazione: rimuovi il vecchio v1 se presente (no-op se assente)
    sessionStorage.removeItem("auth_profile_v1");
    const raw = localStorage.getItem(AUTH_PROFILE_CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (entry.userId !== userId) return null;
    if (Date.now() - entry.cachedAt > AUTH_PROFILE_CACHE_TTL_MS) return null;
    return { profile: entry.profile, role: entry.role as AppRole | null, company: entry.company };
  } catch {
    return null;
  }
}

function writeProfileCache(userId: string, profile: Profile | null, role: AppRole | null, company: Company | null) {
  try {
    localStorage.setItem(AUTH_PROFILE_CACHE_KEY, JSON.stringify({ userId, profile, role, company, cachedAt: Date.now() }));
  } catch {
    // localStorage full or unavailable — skip silently
  }
}

function clearProfileCache() {
  try {
    localStorage.removeItem(AUTH_PROFILE_CACHE_KEY);
    sessionStorage.removeItem("auth_profile_v1"); // cleanup vecchia chiave
  } catch { /* storage non disponibile — silenzioso */ }
}

function readMultiCompanyAccessCache(): { userId: string | null; accesses: MultiCompanyAccess[] } | null {
  try {
    const raw = sessionStorage.getItem(MULTI_COMPANY_ACCESS_CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() - Number(entry.cachedAt ?? 0) > MULTI_COMPANY_ACCESS_CACHE_TTL_MS) return null;
    if (!Array.isArray(entry.accesses)) return null;
    return {
      userId: typeof entry.userId === "string" ? entry.userId : null,
      accesses: entry.accesses as MultiCompanyAccess[],
    };
  } catch {
    return null;
  }
}

function writeMultiCompanyAccessCache(userId: string, accesses: MultiCompanyAccess[]) {
  try {
    sessionStorage.setItem(
      MULTI_COMPANY_ACCESS_CACHE_KEY,
      JSON.stringify({ userId, accesses, cachedAt: Date.now() }),
    );
  } catch {
    // sessionStorage full or unavailable — skip silently
  }
}

function clearMultiCompanySession() {
  try {
    sessionStorage.removeItem(MULTI_COMPANY_KEY);
    sessionStorage.removeItem(MULTI_COMPANY_ACCESS_CACHE_KEY);
  } catch {
    // storage non disponibile — silenzioso
  }
}

function errorText(error: unknown): string {
  if (!error) return "";
  if (error instanceof Error) return `${error.name} ${error.message}`;
  if (typeof error === "string") return error;
  try { return JSON.stringify(error); } catch { return String(error); }
}

function isAbortLikeError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { name?: string; code?: string; message?: string };
  return (
    err.name === "AbortError" ||
    err.code === "20" ||
    (err.message?.toLowerCase().includes("abort") ?? false)
  );
}

function isInvalidRefreshTokenError(error: unknown): boolean {
  const text = errorText(error).toLowerCase();
  return (
    text.includes("invalid refresh token") ||
    text.includes("refresh token not found") ||
    text.includes("refresh_token_not_found")
  );
}

function clearStaleSupabaseAuthStorage() {
  _cachedAccessToken = null;
  _cachedRefreshToken = null;
  clearProfileCache();

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("sb-") && key.includes("auth-token")) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    // localStorage non disponibile o bloccato: lo stato React viene comunque pulito.
  }
}

// Module-level cache for the latest Supabase access/refresh tokens.
// Updated by onAuthStateChange — lets other code read the current token WITHOUT
// calling supabase.auth.getSession() (which acquires the storage lock and can hang).
let _cachedAccessToken: string | null = null;
let _cachedRefreshToken: string | null = null;

/** Returns the last known access + refresh tokens without acquiring any lock. */
export function getCachedTokens() {
  return { accessToken: _cachedAccessToken, refreshToken: _cachedRefreshToken };
}

function getBrowserInfo() {
  const ua = navigator.userAgent;
  let browser = "Unknown";
  if (ua.includes("Chrome") && !ua.includes("Edg")) browser = "Chrome";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
  else if (ua.includes("Edg")) browser = "Edge";

  let os = "Unknown";
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

  const isMobile = /Mobi|Android/i.test(ua);
  return { browser, os, device_type: isMobile ? "mobile" : "desktop", user_agent: ua };
}

// accessToken is passed directly from the auth event — avoids calling getSession()
// which acquires the Supabase storage lock and can block for several seconds.
async function startSession(accessToken: string) {
  try {
    const info = getBrowserInfo();
    const { data } = await supabase.functions.invoke("track-user-session", {
      body: { action: "start", ...info },
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (data?.session_id) {
      sessionStorage.setItem(SESSION_ID_KEY, data.session_id);
    }
  } catch {
    // Non-blocking
  }
}

async function endSession() {
  try {
    const sessionId = sessionStorage.getItem(SESSION_ID_KEY);
    if (sessionId) {
      await supabase.functions.invoke("track-user-session", {
        body: { action: "end", session_id: sessionId },
      });
      sessionStorage.removeItem(SESSION_ID_KEY);
    }
  } catch {
    // Non-blocking
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    role: null,
    company: null,
    isLoading: true,
  });

  const [impersonatedCompanyId, setImpersonatedCompanyId] = useState<string | null>(
    () => sessionStorage.getItem(IMP_COMPANY_KEY)
  );
  const [impersonatedCompany, setImpersonatedCompany] = useState<Company | null>(null);
  const [impersonationToken, setImpersonationToken] = useState<string | null>(
    () => sessionStorage.getItem(IMP_TOKEN_KEY)
  );
  // BUG 4: only true after fetchUserData confirms super_admin role
  const [isImpersonationReady, setIsImpersonationReady] = useState(false);

  // Generation counter: each SIGNED_IN/SIGNED_OUT increments this ref.
  // After fetchUserData resolves, we compare against the current value —
  // if it changed (e.g. a SIGNED_OUT arrived while fetching), we discard the result.
  const authGenRef = useRef(0);

  // Ref that always holds the latest resolved role — lets TOKEN_REFRESHED read the
  // current role synchronously without a stale closure or calling setState.
  const resolvedRoleRef = useRef<AppRole | null>(null);

  // View-as: simula l'esperienza di un ruolo company senza cambiare sessione
  const [viewAsRole, setViewAsRoleState] = useState<AppRole | null>(null);
  const [viewAsUserId, setViewAsUserId] = useState<string | null>(null);
  const setViewAsRole = useCallback((role: AppRole | null, userId: string | null = null) => {
    setViewAsRoleState(role);
    setViewAsUserId(userId);
  }, []);

  // Multi-company state (combined to reduce re-renders)
  const [multiCompanyState, setMultiCompanyState] = useState(() => {
    const selectedId = sessionStorage.getItem(MULTI_COMPANY_KEY);
    const cachedAccesses = readMultiCompanyAccessCache()?.accesses ?? [];
    const selectedCompany = selectedId
      ? cachedAccesses.find((access) => access.company_id === selectedId)?.company ?? null
      : null;
    return {
      accesses: cachedAccesses,
      selectedId,
      selectedCompany,
    };
  });
  const multiCompanyAccesses = multiCompanyState.accesses;
  const selectedMultiCompanyId = multiCompanyState.selectedId;
  // true quando il fetch degli accessi multi-azienda è completato almeno una volta
  // (necessario a RoleBasedRedirect per decidere se mostrare il selettore d'ingresso).
  const [multiCompanyLoaded, setMultiCompanyLoaded] = useState(false);
  const multiCompanyObj = multiCompanyState.selectedCompany;

  const recoverInvalidAuthSession = useCallback((source: string, error?: unknown) => {
    logger.warn(`[auth] ${source}: sessione locale Supabase non valida, pulizia token stale`, error);
    captureVelocityError("auth.invalid_refresh_token_recovered", error ?? new Error(source), { source });

    clearStaleSupabaseAuthStorage();
    sessionStorage.removeItem(SESSION_ID_KEY);
    sessionStorage.removeItem(IMP_COMPANY_KEY);
    sessionStorage.removeItem(IMP_TOKEN_KEY);
    sessionStorage.removeItem(IMP_TOKEN_TS_KEY);
    clearMultiCompanySession();
    sessionStorage.removeItem("admin_session_token");

    authGenRef.current++;
    resolvedRoleRef.current = null;
    setImpersonatedCompanyId(null);
    setImpersonationToken(null);
    setImpersonatedCompany(null);
    setIsImpersonationReady(false);
    setState({
      user: null,
      profile: null,
      role: null,
      company: null,
      isLoading: false,
    });

    // Best-effort: forza Supabase JS a dimenticare anche l'eventuale sessione in memoria.
    void supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  }, []);

  // Sync impersonation state to sessionStorage
  useEffect(() => {
    if (impersonatedCompanyId) sessionStorage.setItem(IMP_COMPANY_KEY, impersonatedCompanyId);
    else sessionStorage.removeItem(IMP_COMPANY_KEY);
    if (impersonationToken) {
      // Always overwrite timestamp when a NEW token is stored — this ensures
      // validateImpersonation skips the remote call for fresh tokens.
      // We compare with what's already in sessionStorage: if the value changed
      // (new impersonation) we record a fresh timestamp; if it's the same token
      // (re-render) we only write the timestamp when it's missing (first hydration).
      const storedToken = sessionStorage.getItem(IMP_TOKEN_KEY);
      sessionStorage.setItem(IMP_TOKEN_KEY, impersonationToken);
      if (storedToken !== impersonationToken || !sessionStorage.getItem(IMP_TOKEN_TS_KEY)) {
        sessionStorage.setItem(IMP_TOKEN_TS_KEY, String(Date.now()));
      }
    } else {
      sessionStorage.removeItem(IMP_TOKEN_KEY);
      sessionStorage.removeItem(IMP_TOKEN_TS_KEY);
    }
  }, [impersonatedCompanyId, impersonationToken]);

  // Validate persisted impersonation token on mount
  useEffect(() => {
    let cancelled = false;

    async function validateImpersonation() {
      const savedToken = sessionStorage.getItem(IMP_TOKEN_KEY);
      const savedCompanyId = sessionStorage.getItem(IMP_COMPANY_KEY);

      if (!savedToken || !savedCompanyId) return;

      // Safety: if the resolved role is a non-admin role (role is set but not super_admin),
      // immediately clear the impersonation to prevent a leftover session from a previous
      // super_admin login persisting for a different user.
      if (state.role !== null && state.role !== "super_admin") {
        logger.info("Non-admin role detected with active impersonation session — clearing");
        if (cancelled) return;
        setImpersonatedCompanyId(null);
        setImpersonationToken(null);
        setImpersonatedCompany(null);
        sessionStorage.removeItem(IMP_TOKEN_TS_KEY);
        return;
      }

      // Only validate against the edge function once we know the user is a super_admin.
      if (state.role !== "super_admin") return;

      // Skip remote validation if the token was created less than 5 minutes ago —
      // it was just minted by impersonateCompany() and doesn't need re-checking.
      // This avoids an edge-function cold-start (1-3s) on every impersonated page load.
      const tokenTs = sessionStorage.getItem(IMP_TOKEN_TS_KEY);
      const tokenAgeMs = tokenTs ? Date.now() - parseInt(tokenTs, 10) : Infinity;
      if (tokenAgeMs < 5 * 60 * 1000) {
        logger.info("validateImpersonation: token is fresh, skipping remote validation");
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke("secure-impersonation", {
          body: { action: "validate", token: savedToken },
        });

        if (cancelled) return;
        if (!error && data?.valid === false) {
          // Only clear when the edge function explicitly says the token is invalid.
          // Network errors or edge-function failures are treated as "unknown" — keep
          // impersonation alive so a transient error doesn't log the superadmin out.
          logger.info("Impersonation token explicitly invalid, clearing");
          setImpersonatedCompanyId(null);
          setImpersonationToken(null);
          setImpersonatedCompany(null);
          sessionStorage.removeItem(IMP_TOKEN_TS_KEY);
        }
        // If valid (or any error/exception): keep impersonation active.
        // fetchImpersonatedCompany will load the company data via its own effect.
      } catch {
        // Network/edge-function error — keep impersonation alive.
        logger.warn("validateImpersonation: edge function unreachable, keeping impersonation active");
      }
    }

    validateImpersonation();
    return () => { cancelled = true; };
  }, [state.role, queryClient]);

  const fetchUserData = useCallback(async (userId: string, userEmail: string | null | undefined) => {
    // Velocity — V1: timeout sulla critical path di auth.
    // Se Supabase è in cold-start (free tier ibernato) o la rete dell'utente in
    // cantiere è pessima, l'attesa può essere >15s → spinner infinito. Con
    // AbortController a 10s, in caso di timeout restituiamo "non autenticato"
    // e i route guards mandano a /login (riprovabile) invece che bloccare.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AUTH_CRITICAL_FETCH_TIMEOUT_MS);
    try {
      // Fetch profile (with company JOIN) and roles in PARALLEL — 2 DB round-trips total.
      // Previously: profiles → wait → companies (sequential, +300-600ms per load).
      // Now: profiles+companies join and user_roles fire simultaneously.
      const [profileResult, rolesResult] = await Promise.all([
        supabase
          .from("profiles")
          // Disambiguazione FK: PostgREST trova 2 relazioni profiles↔companies
          // (profiles_company_id_fkey + companies_sr_default_consulente_id_fkey).
          // Specifichiamo esplicitamente il vincolo per evitare PGRST201.
          .select("*, company:companies!profiles_company_id_fkey(*)")
          .eq("id", userId)
          .abortSignal(controller.signal)
          .maybeSingle(),
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .abortSignal(controller.signal),
      ]);

      const { data: rawProfile, error: profileError } = profileResult;
      const { data: rolesData, error: roleError } = rolesResult;

      // P2.4 fix — silenziare gli AbortError generati da navigazione veloce
      // (controller.abort()): non sono errori reali, sporcavano la console
      // con warning illeggibili "Error fetching profile: Object".
      const isAbortError = (err: unknown): boolean => {
        if (!err || typeof err !== "object") return false;
        const e = err as { name?: string; code?: string; message?: string };
        return e.name === "AbortError" || e.code === "20" || (e.message?.toLowerCase().includes("abort") ?? false);
      };
      if (profileError && !isAbortError(profileError)) {
        // Log but continue — roles are fetched independently so super_admin
        // role is not lost if the profile row is temporarily unreachable.
        logger.warn("Error fetching profile:", JSON.stringify(profileError));
      }

      if (roleError && !isAbortError(roleError)) {
        logger.warn("Error fetching roles:", JSON.stringify(roleError));
      }

      // Separate company from the joined profile row so the Profile type stays clean
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let company: Company | null = rawProfile ? ((rawProfile as any).company as Company | null) ?? null : null;
      const profileData: Profile | null = rawProfile
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? (() => { const { company: _c, ...rest } = rawProfile as any; return rest as Profile; })()
        : null;

      // FALLBACK defensivo: se il JOIN su `companies` è null ma il profilo
      // ha un company_id valorizzato, riproviamo con fetch separata.
      // Caso reale osservato: alcuni livelli di caching di PostgREST possono
      // ritornare il join vuoto in sessioni appena create, mentre la query
      // diretta funziona regolarmente. Senza questa rete di salvataggio
      // l'utente vede "Nessuna azienda selezionata" pur avendo company_id
      // valido in profiles.
      if (!company && profileData?.company_id) {
        try {
          const { data: directCompany, error: ce } = await supabase
            .from("companies")
            .select("*")
            .eq("id", profileData.company_id)
            .abortSignal(controller.signal)
            .maybeSingle();
          if (!ce && directCompany) {
            company = directCompany as Company;
          } else if (ce && !isAbortError(ce)) {
            logger.warn("Fallback company fetch failed:", JSON.stringify(ce));
          }
        } catch (err) {
          if (!isAbortError(err)) {
            logger.warn("Fallback company fetch exception:", err);
          }
        }
      }

      // Ruolo effettivo: la classifica vive in @/lib/roleHierarchy, unica fonte
      // condivisa con i test (era duplicata e le copie erano gia' divergenti).
      let userRoles = (rolesData || []).map(r => r.role as AppRole);

      // 🛡️  Defense-in-depth: il ruolo super_admin viene rifiutato se l'email dell'utente
      // non è nella SUPER_ADMIN_EMAIL_ALLOWLIST. In caso di mismatch (es. riga spuria in
      // user_roles per demo@azienda.srl), scartiamo il ruolo prima di calcolare
      // effectiveRole → l'utente viene instradato come il suo ruolo legittimo successivo
      // (tipicamente company_admin) e non vede l'area superadmin.
      if (userRoles.includes("super_admin") && !isSuperAdminEmailAllowed(userEmail)) {
        logger.warn("[security] super_admin DB role rifiutato: email non in allowlist", {
          userId,
          email: userEmail ?? null,
        });
        captureVelocityError(
          "auth.superAdmin.refused",
          new Error("super_admin role rejected by allowlist"),
          { userId, email: userEmail ?? null },
        );
        userRoles = userRoles.filter(r => r !== "super_admin");
      }

      const effectiveRole = computeEffectiveRole(userRoles);

      return {
        profile: profileData,
        role: effectiveRole,
        company,
      };
    } catch (error) {
      // Distinguiamo timeout (AbortError) dalle altre failure per triage:
      // - timeout → "DB cold/slow", non allarmante ma tracciabile
      // - altre → errori veri
      const isTimeout =
        controller.signal.aborted ||
        (error as Error | undefined)?.name === "AbortError";
      captureVelocityError(isTimeout ? "auth.fetchUserData.timeout" : "auth.fetchUserData", error, {
        userId,
        timeoutMs: AUTH_CRITICAL_FETCH_TIMEOUT_MS,
      });
      logger.error("Error in fetchUserData:", error);
      return { profile: null, role: null, company: null };
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

  const refreshAuth = useCallback(async () => {
    // Claim a generation slot so we can detect if SIGNED_IN fires while we wait.
    const myGen = ++authGenRef.current;
    try {
      // Race getSession against a 10s timeout to avoid infinite spinner
      // when the auto-refresh network request hangs (e.g. expired token + flaky network).
      // Memory-leak fix: cancella il timer se getSession vince il race, altrimenti il
      // timer continua a girare per 10s e a rilanciare reject su una Promise.race già
      // settled — handle leakato fino al firing.
      let getSessionTimerId: ReturnType<typeof setTimeout> | undefined;
      const sessionResult = await Promise.race([
        supabase.auth.getSession()
          .finally(() => { if (getSessionTimerId) clearTimeout(getSessionTimerId); }),
        new Promise<never>((_, reject) => {
          getSessionTimerId = setTimeout(() => reject(new Error("getSession timeout")), 10_000);
        }),
      ]);

      // If a SIGNED_IN / TOKEN_REFRESHED event fired while we were waiting,
      // that handler already set the correct state — do not override it.
      if (myGen !== authGenRef.current) return;

      const user = sessionResult.data.session?.user ?? null;

      if (user) {
        const userData = await fetchUserData(user.id, user.email);
        if (myGen !== authGenRef.current) return;
        if (userData.role === null) {
          clearProfileCache();
          resolvedRoleRef.current = null;
          setState({
            user: null,
            profile: null,
            role: null,
            company: null,
            isLoading: false,
          });
          return;
        }
        setState({
          user,
          ...userData,
          isLoading: false,
        });
      } else {
        setState({
          user: null,
          profile: null,
          role: null,
          company: null,
          isLoading: false,
        });
      }
    } catch (err) {
      if (isInvalidRefreshTokenError(err)) {
        recoverInvalidAuthSession("refreshAuth", err);
        return;
      }

      // getSession timed out or threw — show login form.
      // IMPORTANT: do NOT clear localStorage here. Doing so would destroy the
      // refresh token that Supabase needs to auto-renew the session in the background.
      // Supabase will fire TOKEN_REFRESHED when the renewal succeeds, or SIGNED_OUT
      // if it fails — both are handled in onAuthStateChange below.
      logger.warn("refreshAuth timed out or failed:", err);
      authGenRef.current++;
      // Only reset to logged-out if a SIGNED_IN event has NOT already authenticated
      // the user while getSession() was hanging. Use functional update to check.
      setState(prev => prev.user !== null ? prev : {
        user: null,
        profile: null,
        role: null,
        company: null,
        isLoading: false,
      });
    }
  }, [fetchUserData, recoverInvalidAuthSession]);

  // Fetch impersonated company data when impersonatedCompanyId or the authenticated user changes.
  // We wait for state.user to be non-null so that the Supabase client has a valid session
  // (e.g. after setSession() completes from the cross-subdomain hash handoff) before querying.
  // On error we do NOT clear impersonatedCompanyId — that would permanently lose the
  // impersonation context if the query races with session setup. We just retry on next render.
  useEffect(() => {
    // Cancel flag: se l'SA cambia rapidamente azienda, la query vecchia può
    // risolvere DOPO quella nuova e sovrascrivere `impersonatedCompany` con
    // dati obsoleti. Il flag garantisce che solo la fetch più recente scriva.
    let cancelled = false;
    const controller = new AbortController();

    async function fetchImpersonatedCompany() {
      if (!impersonatedCompanyId) {
        if (!cancelled) setImpersonatedCompany(null);
        return;
      }
      // Wait for a valid authenticated session before querying
      if (!state.user) return;

      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("id", impersonatedCompanyId)
        .abortSignal(controller.signal)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        if (!isAbortLikeError(error)) {
          logger.error("Error fetching impersonated company:", error);
        }
        // Do NOT clear impersonatedCompanyId — keep it so we can retry on next auth change.
        setImpersonatedCompany(null);
      } else {
        setImpersonatedCompany(data as Company);
      }
    }

    fetchImpersonatedCompany();
    return () => {
      cancelled = true;
      controller.abort();
    };
  // impersonationToken is included so that clicking "Accedi" for the SAME company
  // a second time (when impersonatedCompanyId hasn't changed) still re-triggers
  // this effect and re-fetches the company data.
  }, [impersonatedCompanyId, impersonationToken, state.user]);

  useEffect(() => {
    const handleUnhandledAuthError = (event: PromiseRejectionEvent) => {
      if (!isInvalidRefreshTokenError(event.reason)) return;
      event.preventDefault();
      recoverInvalidAuthSession("unhandledrejection", event.reason);
    };

    window.addEventListener("unhandledrejection", handleUnhandledAuthError);

    // Hoist cross-subdomain flag BEFORE registering the listener so the
    // callback closure never observes it in TDZ. Supabase currently emits
    // INITIAL_SESSION asynchronously, but if that scheduling ever changes
    // to synchronous we'd get a ReferenceError; this hoist eliminates the
    // fragility with zero behavioral change.
    const hash = window.location.hash;
    const isCrossSubdomainHandoff = !!(hash && hash.includes('_at='));
    const handoffParams = isCrossSubdomainHandoff
      ? new URLSearchParams(hash.slice(1))
      : null;
    const handoffAccessToken = handoffParams?.get('_at') ?? null;
    const handoffRefreshToken = handoffParams?.get('_rt') ?? null;
    const hasValidCrossSubdomainHandoff = Boolean(handoffAccessToken && handoffRefreshToken);
    let authSettled = false;
    const authBootstrapWatchdog = window.setTimeout(() => {
      if (authSettled) return;
      authGenRef.current++;
      logger.warn("[auth] INITIAL_SESSION watchdog: sblocco spinner e ritorno a stato non autenticato");
      setState(prev => prev.isLoading
        ? {
            user: null,
            profile: null,
            role: null,
            company: null,
            isLoading: false,
          }
        : prev
      );
    }, AUTH_INITIAL_SESSION_WATCHDOG_MS);
    const settleAuthBootstrap = () => {
      authSettled = true;
      window.clearTimeout(authBootstrapWatchdog);
    };

    // Corpo dell'evento auth, eseguito FUORI dal lock interno di supabase-js.
    // supabase-js emette gli eventi TENENDO il lock auth: un callback async che
    // await-a query Supabase (fetchUserData) le accoda dietro lo stesso lock →
    // deadlock fino al race-timeout (14s) e nel frattempo TUTTE le query
    // dell'app restano in coda (pagine "lente", probe campo in falso timeout,
    // "fetchUserData failed" a ogni load). Fix ufficiale Supabase: il callback
    // ritorna subito, il lavoro parte al tick successivo.
    const processAuthEvent = async (event: AuthChangeEvent, session: Session | null) => {
        if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session?.user) {
          settleAuthBootstrap();
          // Claim a generation slot. Any concurrent or previous fetch whose
          // generation no longer matches will be silently discarded.
          const myGen = ++authGenRef.current;

          // ── Fast path: serve cached profile/role/company from sessionStorage ──
          // On page refresh the user already has a valid session, but fetchUserData
          // must hit the DB (potentially cold, 10-15s on free tier).  If we have a
          // fresh cache entry for this user we render the UI immediately and let
          // the DB re-validation happen in the background.
          const cached = readProfileCache(session.user.id);
          // 🛡️  Defense-in-depth: se il cache contiene super_admin ma l'email non è
          // nell'allowlist (es. cache stale pre-fix o tampering), invalidiamo il cache
          // e costringiamo una re-fetch dal DB (che a sua volta scarta il ruolo).
          const cacheSuperAdminRejected =
            cached?.role === "super_admin" && !isSuperAdminEmailAllowed(session.user.email);
          if (cacheSuperAdminRejected) {
            logger.warn("[security] cache super_admin rifiutato: email non in allowlist — cache invalidata");
            clearProfileCache();
          }
          const usedCachedAuth = !!(cached && cached.role !== null && !cacheSuperAdminRejected);
          if (usedCachedAuth) {
            resolvedRoleRef.current = cached.role;
            setState({
              user: session.user,
              profile: cached.profile,
              role: cached.role,
              company: cached.company,
              isLoading: false, // show UI immediately — background re-validation below
            });
          }

          // ── Background (or blocking) re-validation ──
          // Always re-fetch to keep data fresh. If the cache was used above this
          // runs silently; if not, it blocks until fetchUserData completes.
          let userData: { profile: Profile | null; role: AppRole | null; company: Company | null };
          // Memory-leak fix: il setTimeout precedente NON veniva cancellato se
          // fetchUserData vinceva il race → timer pendente fino al firing.
          // Su rapid login/logout cycle, accumulava handle. Ora cleanup esplicito.
          let raceTimerId: ReturnType<typeof setTimeout> | undefined;
          try {
            userData = await Promise.race([
              fetchUserData(session.user.id, session.user.email)
                .finally(() => { if (raceTimerId) clearTimeout(raceTimerId); }),
              new Promise<never>((_, reject) => {
                // 2026-05-28 Velocity: ridotto da 22s → 14s.
                // Allineato al critical timeout (12s) con 2s di slack per AbortController.
                // Worst-case UX: -8s di spinner prima del fallback "non autenticato".
                raceTimerId = setTimeout(() => reject(new Error("fetchUserData timeout")), 14_000);
              }),
            ]);
          } catch {
            // Background re-validation timed out or threw (DB cold-start / network error).
            // The JWT is still valid and the fast-path cache-hit above already committed
            // the correct role into state (if a cache entry existed).
            // Mirror the TOKEN_REFRESHED slow-path: do NOT wipe role/profile/company.
            // The next TOKEN_REFRESHED cycle will retry fetchUserData automatically.
            // Setting userData = { role: null } here was the root cause of the sidebar
            // blanking to only "Attività" after a 12 s DB timeout mid-session.
            logger.warn("[auth] SIGNED_IN/INITIAL_SESSION: background fetchUserData failed — keeping existing state");
            if (!usedCachedAuth && myGen === authGenRef.current) {
              clearProfileCache();
              resolvedRoleRef.current = null;
              setState({
                user: null,
                profile: null,
                role: null,
                company: null,
                isLoading: false,
              });
            }
            return;
          }

          // Another auth event fired while we were fetching — bail out.
          if (myGen !== authGenRef.current) return;

          if (userData.role === null) {
            logger.warn("[auth] SIGNED_IN/INITIAL_SESSION: ruolo non risolto, fail-closed per evitare permessi/spinner incoerenti", {
              usedCachedAuth,
            });
            clearProfileCache();
            if (!usedCachedAuth) {
              resolvedRoleRef.current = null;
              setState({
                user: null,
                profile: null,
                role: null,
                company: null,
                isLoading: false,
              });
            }
            return;
          }

          resolvedRoleRef.current = userData.role;

          // BUG 4: mark impersonation as ready once we've confirmed super_admin role
          if (userData.role === "super_admin") {
            setIsImpersonationReady(true);
          } else {
            setIsImpersonationReady(false);
          }

          // Persist to cache so the NEXT page refresh is also instant.
          if (userData.role !== null) {
            writeProfileCache(session.user.id, userData.profile, userData.role, userData.company);
          }

          setState({
            user: session.user,
            ...userData,
            isLoading: false,
          });
          // Start session tracking (fire-and-forget, pass token directly to avoid
          // a redundant getSession() call that would compete for the storage lock)
          if (!sessionStorage.getItem(SESSION_ID_KEY)) {
            startSession(session.access_token);
          }
          // Riscalda edge function critiche per UX (manage-totp, maps-proxy, ecc).
          // Fire-and-forget, defer 500ms, idempotente per session — vedi
          // src/lib/utils/edgeWarmup.ts. Elimina lo spinner 10-30s al cold-start
          // di Force2FAGuard, calendario, mappe.
          warmupCriticalEdgeFunctions();
          // Track admin session for super_admin users (fire-and-forget)
          if (userData.role === "super_admin" && event === "SIGNED_IN") {
            const info = getBrowserInfo();
            supabase.functions.invoke("upsert-admin-session", {
              body: {
                device_hint: `${info.browser} su ${info.os}`,
              },
            }).then((res) => {
              if (res.data?.session_token) {
                sessionStorage.setItem("admin_session_token", res.data.session_token);
              }
            }).catch(() => {});
          }
        } else if (event === "TOKEN_REFRESHED" && session?.user) {
          settleAuthBootstrap();
          // Access token renewed in the background.
          // If the role was already resolved (happy path), just update the User object
          // to hold the fresh JWT — no DB queries needed (role/company don't change on refresh).
          // If role is still null (initial fetchUserData failed/timed-out), do a full retry.
          if (resolvedRoleRef.current !== null) {
            // Fast path — only update the user token, skip all DB queries
            setState(prev => ({ ...prev, user: session.user }));
          } else {
            // Slow path — role was never resolved; use TOKEN_REFRESHED as a retry opportunity
            // but never leave the app in the initial spinner if the retry fails.
            const cached = readProfileCache(session.user.id);
            const cacheSuperAdminRejected =
              cached?.role === "super_admin" && !isSuperAdminEmailAllowed(session.user.email);
            if (cacheSuperAdminRejected) {
              logger.warn("[security] cache super_admin rifiutato su TOKEN_REFRESHED: email non in allowlist — cache invalidata");
              clearProfileCache();
            }
            const usedCachedAuth = !!(cached && cached.role !== null && !cacheSuperAdminRejected);
            if (usedCachedAuth) {
              resolvedRoleRef.current = cached.role;
              setState({
                user: session.user,
                profile: cached.profile,
                role: cached.role,
                company: cached.company,
                isLoading: false,
              });
            }

            const myGen = ++authGenRef.current;
            let userData: { profile: Profile | null; role: AppRole | null; company: Company | null };
            // Memory-leak fix: cancella il timer se fetchUserData vince il race
            // (stesso pattern del ramo SIGNED_IN, riga ~705).
            let tokenRefreshRaceTimerId: ReturnType<typeof setTimeout> | undefined;
            try {
              userData = await Promise.race([
                fetchUserData(session.user.id, session.user.email)
                  .finally(() => { if (tokenRefreshRaceTimerId) clearTimeout(tokenRefreshRaceTimerId); }),
                new Promise<never>((_, reject) => {
                  tokenRefreshRaceTimerId = setTimeout(() => reject(new Error("fetchUserData timeout")), 22_000);
                }),
              ]);
            } catch {
              // fetchUserData failed during TOKEN_REFRESHED retry (timeout or network error).
              // The user's session JWT is still valid — do NOT wipe role/company from state.
              // Keep the existing auth state intact; the next token refresh will retry.
              // Blanking role here causes the sidebar to disappear until the page is reloaded.
              logger.warn("[auth] TOKEN_REFRESHED: fetchUserData retry failed — keeping existing state");
              if (!usedCachedAuth && myGen === authGenRef.current) {
                setState(prev => prev.isLoading
                  ? {
                      user: null,
                      profile: null,
                      role: null,
                      company: null,
                      isLoading: false,
                    }
                  : prev
                );
              }
              return;
            }
            if (myGen !== authGenRef.current) return;
            if (userData.role === null) {
              clearProfileCache();
              if (!usedCachedAuth) {
                resolvedRoleRef.current = null;
                setState({
                  user: null,
                  profile: null,
                  role: null,
                  company: null,
                  isLoading: false,
                });
              }
              return;
            }
            resolvedRoleRef.current = userData.role;
            writeProfileCache(session.user.id, userData.profile, userData.role, userData.company);
            setState({ user: session.user, ...userData, isLoading: false });
          }
        } else if (event === "SIGNED_OUT" || (event === "INITIAL_SESSION" && !session?.user)) {
          // When navigating via cross-subdomain handoff (hash contains _at=), INITIAL_SESSION
          // fires with session=null BEFORE setSession() completes.  If we set user:null here
          // ProtectedRoute would redirect to /login instantly (blank page flash).
          // Guard: keep isLoading:true and wait for the SIGNED_IN that setSession() will fire.
          if (event === "INITIAL_SESSION" && hasValidCrossSubdomainHandoff) {
            logger.info("INITIAL_SESSION null during cross-subdomain handoff — keeping isLoading:true, waiting for SIGNED_IN");
            return;
          }
          settleAuthBootstrap();
          // INITIAL_SESSION with no user means no valid session in storage —
          // stop the spinner immediately instead of waiting for refreshAuth().
          // SIGNED_OUT invalidates any in-flight SIGNED_IN fetch.
          authGenRef.current++;

          setState({
            user: null,
            profile: null,
            role: null,
            company: null,
            isLoading: false,
          });
          // Clear impersonation + profile cache on logout
          if (event === "SIGNED_OUT") {
            setImpersonatedCompanyId(null);
            setImpersonationToken(null);
            setImpersonatedCompany(null);
            setIsImpersonationReady(false);
            sessionStorage.removeItem(IMP_TOKEN_TS_KEY);
            clearProfileCache();
          }
        }
    };

    // Set up auth state listener BEFORE checking initial session.
    // NB: callback SINCRONO — vedi processAuthEvent sopra.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Keep the module-level token cache fresh — allows getCachedTokens() to
        // return the current tokens WITHOUT acquiring the Supabase storage lock.
        if (session?.access_token) {
          _cachedAccessToken = session.access_token;
          _cachedRefreshToken = session.refresh_token ?? null;
        } else if (event === "SIGNED_OUT") {
          _cachedAccessToken = null;
          _cachedRefreshToken = null;
        }
        setTimeout(() => { void processAuthEvent(event, session); }, 0);
      }
    );

    // ── Cross-subdomain impersonation handoff ──────────────────────────────────
    // When the super-admin clicks "Accedi" on admin.*, the page navigates to
    // app.* with tokens in the URL hash: #_at=&_rt=&_it=&_ic=[&_pr=]
    //
    // CRITICAL: on app.*, localStorage is empty (different origin). Supabase fires
    // INITIAL_SESSION with session=null BEFORE setSession() completes.  Without the
    // isCrossSubdomainHandoff guard below, the INITIAL_SESSION handler sets
    // user:null / isLoading:false → ProtectedRoute redirects to /login (blank page).
    //
    // Optional _pr field: base64url-encoded JSON of the SA profile/role/company.
    // Pre-populating the sessionStorage cache from it lets SIGNED_IN resolve
    // instantly (cache hit) instead of waiting for DB queries (up to 15s cold start).
    // (isCrossSubdomainHandoff + hash already derived above, before listener registration.)

    if (isCrossSubdomainHandoff) {
      const at = handoffAccessToken;
      const rt = handoffRefreshToken;
      const it = handoffParams?.get('_it');
      const ic = handoffParams?.get('_ic');
      const pr = handoffParams?.get('_pr'); // optional profile relay

      if (at && rt) {
        // Clear hash immediately — tokens must not linger in browser history
        window.history.replaceState(null, '', window.location.pathname + window.location.search);

        // ── DB warm-up: fire a lightweight query NOW using the AT from the hash ──
        // The Supabase project may be hibernated (free tier sleeps after ~5 min of
        // inactivity).  The warm-up wakes it up in parallel with setSession() so
        // that by the time SIGNED_IN fires and page hooks run, the DB is already
        // alive.  We use a raw fetch with the AT directly to avoid any session state.
        const supabaseUrl: string = (import.meta as any).env?.VITE_SUPABASE_URL ?? "";
        const supabaseKey: string = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
        if (supabaseUrl && supabaseKey) {
          // Velocity — warm-up fire-and-forget con timeout 8s.
          // Senza timeout, una request bloccata (tipo DNS fallito sulla rete
          // del cantiere) potrebbe lasciare la connection aperta a tempo
          // indefinito consumando slot socket.
          fetch(`${supabaseUrl}/rest/v1/subscription_plans?select=id&limit=1`, {
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${at}`,
            },
            signal: AbortSignal.timeout(WARMUP_FETCH_TIMEOUT_MS),
          }).catch((err) => {
            // Warm-up è best-effort ma loggiamo per vedere se il cold-start è ricorrente.
            captureVelocityError("auth.warmup.handoff", err, { timeoutMs: WARMUP_FETCH_TIMEOUT_MS });
          });
          logger.info("DB warm-up query fired (cross-subdomain handoff)");
        }

        // Pre-populate profile cache from the relay so SIGNED_IN fires with cached data.
        // We decode the JWT payload (no signature check needed — setSession validates it)
        // to extract the user ID for the cache key.
        if (pr) {
          try {
            const relayData = JSON.parse(atob(pr.replace(/-/g, '+').replace(/_/g, '/')));
            // Decode user ID from JWT payload (base64url)
            const jwtPayload = JSON.parse(atob(at.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
            const userId = jwtPayload?.sub as string | undefined;
            if (userId && relayData?.role && relayData?.profile) {
              writeProfileCache(userId, relayData.profile, relayData.role as AppRole, relayData.company ?? null);
              logger.info("Cross-subdomain profile relay: cache pre-populated for instant render");
            }
          } catch {
            logger.warn("Cross-subdomain profile relay: could not decode _pr, will fall back to DB fetch");
          }
        }

        // setSession() will trigger onAuthStateChange(SIGNED_IN) which sets user state.
        // refreshAuth() is the fallback only on error — normal flow goes through SIGNED_IN.
        supabase.auth.setSession({ access_token: at, refresh_token: rt })
          .then(({ error }) => {
            if (error) {
              logger.error("Cross-subdomain session restore failed:", error);
              refreshAuth(); // Fallback
              return;
            }
            if (it && ic) {
              sessionStorage.setItem(IMP_TOKEN_KEY, it);
              sessionStorage.setItem(IMP_COMPANY_KEY, ic);
              setImpersonationToken(it);
              setImpersonatedCompanyId(ic);
            }
          })
          .catch(() => refreshAuth());

        return () => {
          window.clearTimeout(authBootstrapWatchdog);
          window.removeEventListener("unhandledrejection", handleUnhandledAuthError);
          subscription.unsubscribe();
        };
      }
    }

    // Normal flow: the INITIAL_SESSION event from onAuthStateChange above fires
    // immediately with the current session (or null) without acquiring Supabase's
    // internal storage lock. We rely on it instead of calling getSession() directly,
    // which can hang for 10+ seconds when the lock is held by autoRefreshToken.
    // refreshAuth() is intentionally NOT called here — it is still available for
    // programmatic use (e.g. after a setSession fallback failure).

    return () => {
      // Invalidate any in-flight fetch so setState is never called after unmount.
      window.clearTimeout(authBootstrapWatchdog);
      window.removeEventListener("unhandledrejection", handleUnhandledAuthError);
      authGenRef.current++;
      subscription.unsubscribe();
    };
  }, [fetchUserData, refreshAuth, recoverInvalidAuthSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    // Velocity — race su 25s (coerente con SUPABASE_REST_TIMEOUT_MS).
    // signInWithPassword fa un POST a /auth/v1/token, ma su Supabase free
    // tier in cold-start può prendere 10-20s. Prima race era 15s → scattava
    // PRIMA del timeout HTTP → utente vedeva "Email o password non validi"
    // anche con credenziali corrette. Al secondo click endpoint era caldo →
    // login OK in 200ms.
    // Inoltre: ritorniamo un errore tipizzato "Login timeout" così il
    // LoginForm può distinguerlo dal vero "Invalid credentials" e mostrare
    // un messaggio appropriato invece di accusare l'utente.
    let signInTimerId: ReturnType<typeof setTimeout> | undefined;
    try {
      const signInPromise = supabase.auth.signInWithPassword({ email, password });
      (signInPromise as unknown as Promise<unknown>).catch(() => {});
      // Memory-leak fix: cancella il timer di timeout quando signIn termina
      // (vinto o perso il race). Senza cleanup il setTimeout 25s continuava a
      // girare anche dopo login riuscito → timer pendenti accumulati nei
      // tentativi consecutivi.
      const { error } = await Promise.race([
        signInPromise.finally(() => { if (signInTimerId) clearTimeout(signInTimerId); }),
        new Promise<{ error: Error }>((_, reject) => {
          signInTimerId = setTimeout(() => {
            const timeoutErr = new Error("Login timeout — riprova");
            (timeoutErr as Error & { __isTimeout: boolean }).__isTimeout = true;
            reject(timeoutErr);
          }, 25_000);
        }),
      ]);
      return { error: error as Error | null };
    } catch (err) {
      if (signInTimerId) clearTimeout(signInTimerId);
      return { error: err as Error };
    }
  }, []);

  const signOut = useCallback(async () => {
    await endSession();
    sessionStorage.removeItem("quick_login_original_email");
    sessionStorage.removeItem("quick_login_original_name");
    clearMultiCompanySession();
    // v8.6.99 — clear session_started_at marker per useSessionTimeout
    try { localStorage.removeItem("eic_session_started_at"); } catch { /* ignore */ }
    await supabase.auth.signOut();
  }, []);

  

  const impersonateCompany = useCallback(async (companyId: string, permissions?: { can_manage_companies: boolean; allowed_company_ids: string[] | null }): Promise<string | null> => {
    if (state.role !== "super_admin") {
      logger.error("Only super_admin can impersonate companies");
      return null;
    }

    if (permissions) {
      if (!permissions.can_manage_companies) {
        logger.error("Missing can_manage_companies permission for impersonation");
        toast.error("Permesso negato", { description: "Non hai il permesso di accedere alle aziende." });
        // .catch difensivo: su iOS WKWebView una reject di functions.invoke
        // (CORS/cold-start) diventa unhandled rejection → PAGEERROR → ErrorBoundary.
        // È fire-and-forget (solo audit log), quindi assorbiamo l'errore.
        supabase.functions.invoke("log-unauthorized", {
          body: { action: "impersonation", targetId: companyId, reason: "missing_can_manage_companies" },
        }).catch(() => {});
        return null;
      }

      if (permissions.allowed_company_ids && !permissions.allowed_company_ids.includes(companyId)) {
        logger.error("Company not in allowed_company_ids for impersonation");
        toast.error("Accesso negato", { description: "Questa azienda non è nella tua lista di aziende permesse." });
        // .catch difensivo (vedi sopra): evita unhandled rejection → crash iOS.
        supabase.functions.invoke("log-unauthorized", {
          body: { action: "impersonation", targetId: companyId, reason: "company_not_allowed" },
        }).catch(() => {});
        return null;
      }
    }

    try {
      const { data, error } = await supabase.functions.invoke("secure-impersonation", {
        body: { action: "start", companyId },
      });

      if (error || !data?.token) {
        logger.error("Failed to start secure impersonation:", error);
        toast.error("Errore impersonazione", { description: "Impossibile avviare la sessione aziendale. Riprova." });
        return null;
      }

      setImpersonationToken(data.token);
      setImpersonatedCompanyId(companyId);
      // Wipe the entire React Query cache so the new company's pages always
      // fetch fresh data instead of showing stale results from the previous context.
      queryClient.clear();
      return data.token;
    } catch (err) {
      logger.error("Impersonation error:", err);
      return null;
    }
  }, [state.role, queryClient]);

  const exitImpersonation = useCallback(async () => {
    try {
      await supabase.functions.invoke("secure-impersonation", {
        body: { action: "end" },
      });
    } catch {
      // Non-blocking
    }
    setImpersonationToken(null);
    setImpersonatedCompanyId(null);
    setImpersonatedCompany(null);
    sessionStorage.removeItem(IMP_TOKEN_TS_KEY);
    // Resetta anche il view-as quando si esce dall'impersonazione
    setViewAsRoleState(null);
    setViewAsUserId(null);
    // Clear the cache so the admin panel doesn't show the impersonated
    // company's stale data after returning to the admin view.
    queryClient.clear();
  }, [queryClient]);

  // ── Supabase keepalive ─────────────────────────────────────────────────────
  // Free-tier Supabase projects hibernate after ~5 minutes of DB inactivity.
  // Pages that rely only on cached React Query data (staleTime 2-5 min) may
  // not issue any real queries for an extended period, causing the next
  // cross-subdomain navigation to hit a cold DB (10-15s delay).
  //
  // Every 4 minutes we fire a trivial SELECT to keep the project awake.
  // Only runs when a user is authenticated — stops immediately on sign-out.
  const authenticatedUserId = state.user?.id;

  useEffect(() => {
    if (!authenticatedUserId) return;
    const ping = () => {
      // v8.6.103 — skip keepalive su tab in background (no battery drain
      // né query inutili per utenti con 5-10 tab aperte)
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      void supabase
        .from("subscription_plans")
        .select("id")
        .limit(1)
        .then(() => undefined)
        .catch((err) => {
          captureVelocityError("auth.keepalive", err, { source: "subscription_plans" });
        });
    };
    ping();
    const id = setInterval(ping, 4 * 60 * 1000);
    // Riattiva subito quando tab torna in foreground
    const onVisible = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [authenticatedUserId]);

  // ── Velocity — Sentry user/tenant context ────────────────────────────────
  // Tagga ogni evento Sentry con user_id + role + tenant_id (company).
  // Serve a raggruppare error reports per tenant, per ruolo, e per capire
  // quale utente è impattato senza dover loggare PII nei singoli eventi.
  // No-op quando Sentry non è inizializzato (VITE_SENTRY_DSN vuota).
  useEffect(() => {
    if (!state.user) {
      setSentryUserContext(null);
      return;
    }
    const tenantId = multiCompanyState.selectedCompany?.id ?? state.company?.id ?? null;
    setSentryUserContext({
      id: state.user.id,
      role: state.role ?? null,
      tenantId,
      // Niente email di default: la decisione di sharare l'email con Sentry
      // è una scelta di policy (GDPR/privacy). Se vuoi attivarla, scommenta:
      // email: state.user.email,
    });
  }, [state.user, state.role, state.company?.id, multiCompanyState.selectedCompany?.id]);

  // ── Realtime: company_feature_overrides ──────────────────────────────────
  // Quando il SuperAdmin modifica un override (sblocca/blocca feature, cambia
  // limite o scadenza), il cambio deve riflettersi IMMEDIATAMENTE in Area
  // Azienda senza aspettare staleTime (60s in useFeatureAccess). Senza questo
  // listener, l'utente finale vedeva feature bloccate anche dopo che l'admin
  // le aveva sbloccate — fino a un refresh manuale o allo scadere del TTL.
  //
  // Sottoscriviamo un channel postgres_changes su company_feature_overrides
  // filtrato per company_id effettivo (reale, multi-company o impersonata),
  // e al trigger invalidiamo tutte le query che dipendono dal gating.
  //
  // La logica di derivazione di `effCompanyId` replica inline quella di
  // `effectiveCompany` (riga ~920) perché useEffect() si esegue PRIMA della
  // derivazione a fondo componente — non possiamo usare la variabile direttamente.
  useEffect(() => {
    const hasActiveImp = !!impersonatedCompanyId && !!impersonationToken;
    const isImp = (state.role === "super_admin" && !!impersonatedCompanyId) || hasActiveImp;
    const effCompanyId = isImp
      ? impersonatedCompanyId
      : multiCompanyState.selectedCompany && multiCompanyState.selectedId
        ? multiCompanyState.selectedId
        : state.company?.id ?? null;

    if (!effCompanyId || !state.user) return;

    // Topic UNIVOCO per istanza: le deps includono oggetti volatili
    // (state.user, multiCompanyState.selectedCompany, queryClient) che cambiano
    // senza cambiare effCompanyId → l'effect ri-gira e, con topic fisso, Supabase
    // riusava il canale già subscribed → ".on() after subscribe()" → crash app
    // globale. + try/catch: la realtime invalidation è best-effort.
    const chId = (typeof crypto !== "undefined" && "randomUUID" in crypto) ? crypto.randomUUID() : String(Math.random());
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
      .channel(`feature-overrides-${effCompanyId}-${chId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "company_feature_overrides",
          filter: `company_id=eq.${effCompanyId}`,
        },
        () => {
          // Invalida tutti i query-keys che consumano il gating per questa company.
          // Usiamo key prefix "feature-access" (non esposto via queryKeys factory,
          // ma definito inline in src/hooks/useFeatureAccess.ts) + i key del factory.
          queryClient.invalidateQueries({ queryKey: ["feature-access"] });
          queryClient.invalidateQueries({
            queryKey: queryKeys.featureFlags.companyResolved(effCompanyId),
          });
          queryClient.invalidateQueries({
            queryKey: queryKeys.featureFlags.companyOverrides(effCompanyId),
          });
          queryClient.invalidateQueries({
            queryKey: queryKeys.admin.companyFeatureOverrides(effCompanyId),
          });
          queryClient.invalidateQueries({
            queryKey: queryKeys.admin.featureOverrides,
          });
        },
      )
      .subscribe();
    } catch (e) {
      console.error("[AuthContext] realtime subscribe non riuscito (non-bloccante):", e);
    }

    return () => {
      if (channel) {
        try { void supabase.removeChannel(channel); } catch { /* canale già rimosso */ }
      }
    };
  }, [
    state.user?.id,
    state.role,
    state.company?.id,
    impersonatedCompanyId,
    impersonationToken,
    multiCompanyState.selectedId,
    multiCompanyState.selectedCompany,
    state.user,
    queryClient,
  ]);

  // ── Realtime: company_subscriptions ──────────────────────────────────────
  // Analogo al listener su company_feature_overrides: quando il SuperAdmin
  // cambia il piano di un'azienda (upgrade/downgrade/trial extension), la
  // risoluzione delle feature deve essere ri-eseguita subito. Senza questo
  // listener l'utente finale manteneva le feature del vecchio piano fino a
  // scadenza staleTime (60s) o refresh manuale.
  //
  // Il cambio di piano NON tocca la tabella company_feature_overrides (che è
  // il livello di priorità massima) — ma il plan_default della feature
  // dipende direttamente dal plan_id. Questo secondo channel copre quel caso.
  useEffect(() => {
    const hasActiveImp = !!impersonatedCompanyId && !!impersonationToken;
    const isImp = (state.role === "super_admin" && !!impersonatedCompanyId) || hasActiveImp;
    const effCompanyId = isImp
      ? impersonatedCompanyId
      : multiCompanyState.selectedCompany && multiCompanyState.selectedId
        ? multiCompanyState.selectedId
        : state.company?.id ?? null;

    if (!effCompanyId || !state.user) return;

    // Topic UNIVOCO per istanza (vedi nota sul channel feature-overrides sopra).
    const chId = (typeof crypto !== "undefined" && "randomUUID" in crypto) ? crypto.randomUUID() : String(Math.random());
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
      .channel(`company-subscriptions-${effCompanyId}-${chId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "company_subscriptions",
          filter: `company_id=eq.${effCompanyId}`,
        },
        () => {
          // Invalidation chain: feature-access dipende dal piano corrente via
          // plan_feature_defaults + platform_feature_flags.plans_included.
          // Invalidiamo anche le query di subscription/plan per riflettere il
          // nuovo piano in sidebar (module gate) e impostazioni abbonamento.
          queryClient.invalidateQueries({ queryKey: ["feature-access"] });
          queryClient.invalidateQueries({
            queryKey: queryKeys.featureFlags.companyResolved(effCompanyId),
          });
          queryClient.invalidateQueries({
            queryKey: queryKeys.featureFlags.companyOverrides(effCompanyId),
          });
          // 🛠️ 2026-05-10 cleanup: prima invalidavamo anche `["subscription-limits"]`
          // e `["current-plan"]` ma nessuna query nel codebase usa queste chiavi
          // (le subscription limits stanno in `["subscription-plan", planId]` e
          // `["order-count", companyId]` via queryKeys.subscriptionLimits).
          // Manteniamo `["company-subscription"]` come prefix-match: matcha tutte
          // le query `["company-subscription", *]` definite in
          // queryKeys.companySubscription.subscription(id).
          queryClient.invalidateQueries({ queryKey: ["company-subscription"] });
          queryClient.invalidateQueries({ queryKey: ["subscription-plan"] });
          queryClient.invalidateQueries({ queryKey: ["order-count", effCompanyId] });
          queryClient.invalidateQueries({ queryKey: ["user-count", effCompanyId] });
        },
      )
      .subscribe();
    } catch (e) {
      console.error("[AuthContext] realtime subscribe non riuscito (non-bloccante):", e);
    }

    return () => {
      if (channel) {
        try { void supabase.removeChannel(channel); } catch { /* canale già rimosso */ }
      }
    };
  }, [
    state.user?.id,
    state.role,
    state.company?.id,
    impersonatedCompanyId,
    impersonationToken,
    multiCompanyState.selectedId,
    multiCompanyState.selectedCompany,
    state.user,
    queryClient,
  ]);

  // Fetch multi-company accesses for any authenticated user. The table already
  // enforces user_id = auth.uid() via RLS, so a normal company_admin/staff with
  // multiple granted companies can switch tenants without needing a special
  // global role.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function fetchMultiCompanyAccesses() {
      if (state.isLoading) {
        return;
      }

      if (!state.user) {
        if (!cancelled) {
          clearMultiCompanySession();
          sessionStorage.removeItem(COMPANY_CHOSEN_KEY);
          setMultiCompanyState({ accesses: [], selectedId: null, selectedCompany: null });
          setMultiCompanyLoaded(false);
        }
        return;
      }

      const cachedAccesses = readMultiCompanyAccessCache();
      if (cachedAccesses?.userId && cachedAccesses.userId !== state.user.id) {
        clearMultiCompanySession();
        setMultiCompanyState({ accesses: [], selectedId: null, selectedCompany: null });
      }

      const { data, error } = await supabase
        .from("multi_company_access")
        .select("*, companies:company_id(*)")
        .eq("user_id", state.user.id)
        .abortSignal(controller.signal);

      if (cancelled) return;

      if (error) {
        if (!isAbortLikeError(error)) {
          logger.error("Error fetching multi-company accesses:", error);
          if (!cancelled) setMultiCompanyLoaded(true);
        }
        return;
      }

      type MultiCompanyAccessRow = MultiCompanyAccess & { companies?: Company | null };
      const fetchedAccesses = ((data || []) as MultiCompanyAccessRow[]).map((a) => ({
        ...a,
        company: a.companies ?? undefined,
      })) as MultiCompanyAccess[];

      // Fetch ANCHE le aziende delegate al commercialista (accountant_company_access)
      // così appaiono nel company switcher e effectiveCompany può essere settato a una di esse.
      // Approccio 2-step per evitare nested filter syntax fragile:
      //  (a) firm_ids dove l'utente è member attivo
      //  (b) accountant_company_access WHERE firm_id IN (firm_ids) AND status='active'
      //  (c) companies via select inline su access (visibili via RLS dedicata)
      // Narrowing locale: capturiamo state.user in const per evitare null-access
      // se lo stato cambia tra il primo check e il map.
      let accountantClientAccesses: MultiCompanyAccess[] = [];
      const currentUser = state.user;
      try {
        const { data: memberRows, error: memberError } = await supabase
          .from("accountant_firm_members")
          .select("firm_id")
          .eq("user_id", currentUser.id)
          .eq("status", "active")
          .abortSignal(controller.signal);

        if (cancelled) return;
        if (memberError && !isAbortLikeError(memberError)) {
          logger.warn("Error fetching accountant firm memberships:", memberError);
        } else if (memberRows && memberRows.length > 0) {
          const firmIds = memberRows
            .map((r: { firm_id: string | null }) => r.firm_id)
            .filter((id): id is string => !!id);
          if (firmIds.length > 0) {
            const { data: accData, error: accError } = await supabase
              .from("accountant_company_access")
              .select(`id, company_id, status, access_mode, created_at, companies:company_id(*)`)
              .in("firm_id", firmIds)
              .eq("status", "active")
              .abortSignal(controller.signal);

            if (cancelled) return;
            if (accError && !isAbortLikeError(accError)) {
              logger.warn("Error fetching accountant client accesses:", accError);
            } else if (accData) {
              accountantClientAccesses = (accData as Array<{
                id: string;
                company_id: string;
                created_at: string;
                companies: Company | null;
              }>).map((row) => ({
                id: `accountant-${row.id}`,
                user_id: currentUser.id,
                company_id: row.company_id,
                access_role: "accountant",
                granted_by: null,
                created_at: row.created_at,
                company: row.companies ?? undefined,
              }));
            }
          }
        }
      } catch (e) {
        if (!isAbortLikeError(e)) logger.warn("accountant_company_access fetch failed:", e);
      }

      const mergedFetched = [...fetchedAccesses, ...accountantClientAccesses];
      const accesses = mergeProfileCompanyAccess({
        accesses: mergedFetched,
        profileCompany: state.company,
        userId: state.user.id,
        globalRole: state.role,
        createdAt: state.profile?.created_at,
      });
      writeMultiCompanyAccessCache(state.user.id, accesses);

      setMultiCompanyState(prev => {
        const selected = resolveMultiCompanySelection({
          accesses,
          storedCompanyId: prev.selectedId,
          profileCompanyId: state.profile?.company_id,
        });

        if (selected.selectedId) {
          sessionStorage.setItem(MULTI_COMPANY_KEY, selected.selectedId);
        } else {
          sessionStorage.removeItem(MULTI_COMPANY_KEY);
        }

        return {
          accesses,
          selectedId: selected.selectedId,
          selectedCompany: selected.selectedCompany,
        };
      });
      if (!cancelled) setMultiCompanyLoaded(true);
    }

    fetchMultiCompanyAccesses();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [state.isLoading, state.role, state.user, state.profile?.company_id, state.profile?.created_at, state.company]);

  // Backstop di affidabilità: l'effect di fetch sopra si auto-aborta ad ogni cambio
  // di dipendenza durante l'inizializzazione auth, quindi il set di multiCompanyLoaded
  // può perdersi in una race a freddo. Qui garantiamo che, appena l'auth si è assestata
  // con un utente, il flag diventi true entro un breve timeout — così il selettore
  // d'ingresso non resta mai bloccato su "Caricamento".
  useEffect(() => {
    if (state.isLoading || !state.user) return;
    if (multiCompanyLoaded) return;
    const t = window.setTimeout(() => setMultiCompanyLoaded(true), 1200);
    return () => window.clearTimeout(t);
  }, [state.isLoading, state.user, multiCompanyLoaded]);

  const switchMultiCompany = useCallback(async (companyId: string) => {
    const found = multiCompanyAccesses.find(a => a.company_id === companyId);
    if (!found) {
      toast.error("Azienda non disponibile", {
        description: "Non risulta più tra gli accessi collegati al tuo account.",
      });
      return;
    }
    // Segna la scelta esplicita anche se si ri-seleziona la stessa azienda,
    // così il selettore d'ingresso non riappare.
    sessionStorage.setItem(COMPANY_CHOSEN_KEY, "1");
    if (companyId === selectedMultiCompanyId) return;

    sessionStorage.setItem(MULTI_COMPANY_KEY, companyId);
    if (state.user?.id) {
      writeMultiCompanyAccessCache(state.user.id, multiCompanyAccesses);
    }
    setViewAsRoleState(null);
    setViewAsUserId(null);
    setMultiCompanyState(prev => {
      return { ...prev, selectedId: companyId, selectedCompany: found?.company || null };
    });
    // Propaga la selezione al DB PRIMA di ripulire la cache: get_effective_company_id()
    // (usata nelle RLS) deve già puntare alla nuova azienda quando le query rifetchano,
    // altrimenti l'utente vedrebbe i dati dell'azienda precedente / schermate vuote.
    try {
      await supabase.rpc("set_active_company", { p_company_id: companyId });
    } catch (e) {
      console.error("[multi-company] set_active_company fallita", e);
    }
    queryClient.clear();
    toast.success("Azienda cambiata", {
      description: found.company?.name ?? "Il contesto aziendale è stato aggiornato.",
    });
  }, [multiCompanyAccesses, queryClient, selectedMultiCompanyId, state.user?.id]);

  // isImpersonating is true as soon as impersonatedCompanyId is set (not waiting for impersonatedCompany
  // to be fetched). This prevents the route guard from redirecting the superadmin to /admin
  // before fetchImpersonatedCompany has had a chance to load the company data.
  // We require the role to be confirmed as super_admin OR that both token+companyId are present
  // in session (the latter handles the transient window after setSession() where fetchUserData
  // may have failed and role is temporarily null).
  const hasActiveImpersonationSession = !!impersonatedCompanyId && !!impersonationToken;
  const isImpersonating = (state.role === "super_admin" && !!impersonatedCompanyId) || hasActiveImpersonationSession;

  // Effective company: impersonation > selected multi-company access > real company
  const effectiveCompany = isImpersonating
    ? impersonatedCompany
    : multiCompanyObj ?? state.company;

  // Sincronizza la selezione multi-azienda col DB al ripristino di sessione (reload,
  // nuova scheda): la selezione vive in sessionStorage lato client, ma get_effective_company_id()
  // (usata nelle RLS) legge active_company_selection. Alla prima disponibilità di utente+accessi
  // allineiamo il DB alla selezione ripristinata (o la azzeriamo → azienda primaria) e invalidiamo.
  const activeCompanySyncedRef = useRef(false);
  useEffect(() => {
    if (activeCompanySyncedRef.current) return;
    if (!state.user?.id || isImpersonating) return;
    if (multiCompanyAccesses.length === 0) return; // solo utenti realmente multi-azienda
    activeCompanySyncedRef.current = true;
    (async () => {
      try {
        await supabase.rpc("set_active_company", { p_company_id: selectedMultiCompanyId ?? null });
        queryClient.invalidateQueries();
      } catch (e) {
        console.error("[multi-company] sync selezione attiva fallita", e);
      }
    })();
  }, [state.user?.id, isImpersonating, multiCompanyAccesses.length, selectedMultiCompanyId, queryClient]);

  const contextValue = useMemo(
    () => ({
      ...state,
      signIn,
      signOut,
      refreshAuth,
      impersonatedCompanyId,
      impersonationToken,
      impersonatedCompany,
      isImpersonating,
      isImpersonationReady,
      impersonateCompany,
      exitImpersonation,
      effectiveCompany,
      multiCompanyAccesses,
      multiCompanyLoaded,
      selectedMultiCompanyId,
      switchMultiCompany,
      viewAsRole,
      viewAsUserId,
      setViewAsRole,
    }),
    [state, signIn, signOut, refreshAuth, impersonatedCompanyId, impersonationToken, impersonatedCompany, isImpersonating, isImpersonationReady, impersonateCompany, exitImpersonation, effectiveCompany, multiCompanyAccesses, multiCompanyLoaded, selectedMultiCompanyId, switchMultiCompany, viewAsRole, viewAsUserId, setViewAsRole]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Selector hook to prevent over-subscription
export function useAuthSelector<T>(selector: (ctx: AuthContextType) => T): T {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthSelector must be used within AuthProvider");
  return selector(ctx);
}

// Common selectors
export const useAuthUser = () => useAuthSelector(c => ({ user: c.user, role: c.role, isLoading: c.isLoading }));
export const useAuthCompany = () => useAuthSelector(c => ({ company: c.company, effectiveCompany: c.effectiveCompany }));
export const useAuthImpersonation = () => useAuthSelector(c => ({ isImpersonating: c.isImpersonating, impersonatedCompany: c.impersonatedCompany, exitImpersonation: c.exitImpersonation }));
export const useAuthActions = () => useAuthSelector(c => ({ signIn: c.signIn, signOut: c.signOut, refreshAuth: c.refreshAuth }));
