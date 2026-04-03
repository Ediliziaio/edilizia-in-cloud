import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole, Profile, Company, AuthState, MultiCompanyAccess } from "@/types/auth";
import { logger } from "@/utils/logger";
import { toast } from "sonner";

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
  selectedMultiCompanyId: string | null;
  switchMultiCompany: (companyId: string) => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Impersonation persisted in sessionStorage (tab-scoped), validated server-side on restore
const SESSION_ID_KEY = "user_session_id";
const IMP_COMPANY_KEY = "imp_company_id";
const IMP_TOKEN_KEY = "imp_token";
// Timestamp (ms) of when the impersonation token was created — used to skip redundant
// remote validation for freshly-minted tokens (avoids an edge-function cold-start per load).
const IMP_TOKEN_TS_KEY = "imp_token_ts";

// Profile/role/company cache in sessionStorage.
// After the first successful fetchUserData, we persist {profile, role, company} so that
// subsequent page refreshes can render the UI immediately while re-validating in background.
// Keyed by Supabase user ID — automatically invalidated on sign-in as a different user.
const AUTH_PROFILE_CACHE_KEY = "auth_profile_v1";
const AUTH_PROFILE_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function readProfileCache(userId: string): { profile: Profile | null; role: AppRole | null; company: Company | null } | null {
  try {
    const raw = sessionStorage.getItem(AUTH_PROFILE_CACHE_KEY);
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
    sessionStorage.setItem(AUTH_PROFILE_CACHE_KEY, JSON.stringify({ userId, profile, role, company, cachedAt: Date.now() }));
  } catch {
    // sessionStorage full or unavailable — skip silently
  }
}

function clearProfileCache() {
  try { sessionStorage.removeItem(AUTH_PROFILE_CACHE_KEY); } catch { /* storage non disponibile — silenzioso */ }
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

  // Multi-company state (combined to reduce re-renders)
  const MULTI_COMPANY_KEY = "multi_company_selected";
  const [multiCompanyState, setMultiCompanyState] = useState({
    accesses: [] as MultiCompanyAccess[],
    selectedId: sessionStorage.getItem(MULTI_COMPANY_KEY),
    selectedCompany: null as Company | null,
  });
  const multiCompanyAccesses = multiCompanyState.accesses;
  const selectedMultiCompanyId = multiCompanyState.selectedId;
  const multiCompanyObj = multiCompanyState.selectedCompany;

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
    async function validateImpersonation() {
      const savedToken = sessionStorage.getItem(IMP_TOKEN_KEY);
      const savedCompanyId = sessionStorage.getItem(IMP_COMPANY_KEY);

      if (!savedToken || !savedCompanyId) return;

      // Safety: if the resolved role is a non-admin role (role is set but not super_admin),
      // immediately clear the impersonation to prevent a leftover session from a previous
      // super_admin login persisting for a different user.
      if (state.role !== null && state.role !== "super_admin") {
        logger.info("Non-admin role detected with active impersonation session — clearing");
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
  }, [state.role]);

  const fetchUserData = useCallback(async (userId: string) => {
    try {
      // Fetch profile (with company JOIN) and roles in PARALLEL — 2 DB round-trips total.
      // Previously: profiles → wait → companies (sequential, +300-600ms per load).
      // Now: profiles+companies join and user_roles fire simultaneously.
      const [profileResult, rolesResult] = await Promise.all([
        supabase.from("profiles").select("*, company:companies(*)").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);

      const { data: rawProfile, error: profileError } = profileResult;
      const { data: rolesData, error: roleError } = rolesResult;

      if (profileError) {
        // Log but continue — roles are fetched independently so super_admin
        // role is not lost if the profile row is temporarily unreachable.
        logger.error("Error fetching profile:", profileError);
      }

      if (roleError) {
        logger.error("Error fetching roles:", roleError);
      }

      // Separate company from the joined profile row so the Profile type stays clean
      const company: Company | null = rawProfile ? ((rawProfile as any).company as Company | null) ?? null : null;
      const profileData: Profile | null = rawProfile
        ? (() => { const { company: _c, ...rest } = rawProfile as any; return rest as Profile; })()
        : null;

      // Determine effective role with priority: highest privilege first
      const rolePriority: AppRole[] = [
        "super_admin",
        "platform_manager",
        "platform_sales",
        "platform_support",
        "platform_marketing",
        "platform_implementation",
        "multi_company_user",
        "referrer",
        "salesperson",
        "call_center",
        "company_admin",
        "company_staff",
        "employee",
        "customer",
      ];
      const userRoles = (rolesData || []).map(r => r.role as AppRole);
      const effectiveRole = rolePriority.find(r => userRoles.includes(r)) || userRoles[0] || null;

      return {
        profile: profileData,
        role: effectiveRole,
        company,
      };
    } catch (error) {
      logger.error("Error in fetchUserData:", error);
      return { profile: null, role: null, company: null };
    }
  }, []);

  const refreshAuth = useCallback(async () => {
    // Claim a generation slot so we can detect if SIGNED_IN fires while we wait.
    const myGen = ++authGenRef.current;
    try {
      // Race getSession against a 10s timeout to avoid infinite spinner
      // when the auto-refresh network request hangs (e.g. expired token + flaky network).
      const sessionResult = await Promise.race([
        supabase.auth.getSession(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("getSession timeout")), 10_000)
        ),
      ]);

      // If a SIGNED_IN / TOKEN_REFRESHED event fired while we were waiting,
      // that handler already set the correct state — do not override it.
      if (myGen !== authGenRef.current) return;

      const user = sessionResult.data.session?.user ?? null;

      if (user) {
        const userData = await fetchUserData(user.id);
        if (myGen !== authGenRef.current) return;
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
  }, [fetchUserData]);

  // Fetch impersonated company data when impersonatedCompanyId or the authenticated user changes.
  // We wait for state.user to be non-null so that the Supabase client has a valid session
  // (e.g. after setSession() completes from the cross-subdomain hash handoff) before querying.
  // On error we do NOT clear impersonatedCompanyId — that would permanently lose the
  // impersonation context if the query races with session setup. We just retry on next render.
  useEffect(() => {
    async function fetchImpersonatedCompany() {
      if (!impersonatedCompanyId) {
        setImpersonatedCompany(null);
        return;
      }
      // Wait for a valid authenticated session before querying
      if (!state.user) return;

      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("id", impersonatedCompanyId)
        .maybeSingle();

      if (error) {
        logger.error("Error fetching impersonated company:", error);
        // Do NOT clear impersonatedCompanyId — keep it so we can retry on next auth change.
        setImpersonatedCompany(null);
      } else {
        setImpersonatedCompany(data as Company);
      }
    }

    fetchImpersonatedCompany();
  // impersonationToken is included so that clicking "Accedi" for the SAME company
  // a second time (when impersonatedCompanyId hasn't changed) still re-triggers
  // this effect and re-fetches the company data.
  }, [impersonatedCompanyId, impersonationToken, state.user]);

  useEffect(() => {
    // Set up auth state listener BEFORE checking initial session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Keep the module-level token cache fresh — allows getCachedTokens() to
        // return the current tokens WITHOUT acquiring the Supabase storage lock.
        if (session?.access_token) {
          _cachedAccessToken = session.access_token;
          _cachedRefreshToken = session.refresh_token ?? null;
        } else if (event === "SIGNED_OUT") {
          _cachedAccessToken = null;
          _cachedRefreshToken = null;
        }

        if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session?.user) {
          // Claim a generation slot. Any concurrent or previous fetch whose
          // generation no longer matches will be silently discarded.
          const myGen = ++authGenRef.current;

          // ── Fast path: serve cached profile/role/company from sessionStorage ──
          // On page refresh the user already has a valid session, but fetchUserData
          // must hit the DB (potentially cold, 10-15s on free tier).  If we have a
          // fresh cache entry for this user we render the UI immediately and let
          // the DB re-validation happen in the background.
          const cached = readProfileCache(session.user.id);
          if (cached && cached.role !== null) {
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
          try {
            userData = await Promise.race([
              fetchUserData(session.user.id),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("fetchUserData timeout")), 12_000)
              ),
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
            return;
          }

          // Another auth event fired while we were fetching — bail out.
          if (myGen !== authGenRef.current) return;

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
          // Access token renewed in the background.
          // If the role was already resolved (happy path), just update the User object
          // to hold the fresh JWT — no DB queries needed (role/company don't change on refresh).
          // If role is still null (initial fetchUserData failed/timed-out), do a full retry.
          if (resolvedRoleRef.current !== null) {
            // Fast path — only update the user token, skip all DB queries
            setState(prev => ({ ...prev, user: session.user }));
          } else {
            // Slow path — role was never resolved; use TOKEN_REFRESHED as a retry opportunity
            const myGen = ++authGenRef.current;
            let userData: { profile: Profile | null; role: AppRole | null; company: Company | null };
            try {
              userData = await Promise.race([
                fetchUserData(session.user.id),
                new Promise<never>((_, reject) =>
                  setTimeout(() => reject(new Error("fetchUserData timeout")), 12_000)
                ),
              ]);
            } catch {
              // fetchUserData failed during TOKEN_REFRESHED retry (timeout or network error).
              // The user's session JWT is still valid — do NOT wipe role/company from state.
              // Keep the existing auth state intact; the next token refresh will retry.
              // Blanking role here causes the sidebar to disappear until the page is reloaded.
              logger.warn("[auth] TOKEN_REFRESHED: fetchUserData retry failed — keeping existing state");
              return;
            }
            if (myGen !== authGenRef.current) return;
            resolvedRoleRef.current = userData.role;
            setState({ user: session.user, ...userData, isLoading: false });
          }
        } else if (event === "SIGNED_OUT" || (event === "INITIAL_SESSION" && !session?.user)) {
          // When navigating via cross-subdomain handoff (hash contains _at=), INITIAL_SESSION
          // fires with session=null BEFORE setSession() completes.  If we set user:null here
          // ProtectedRoute would redirect to /login instantly (blank page flash).
          // Guard: keep isLoading:true and wait for the SIGNED_IN that setSession() will fire.
          if (event === "INITIAL_SESSION" && isCrossSubdomainHandoff) {
            logger.info("INITIAL_SESSION null during cross-subdomain handoff — keeping isLoading:true, waiting for SIGNED_IN");
            return;
          }
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
    const hash = window.location.hash;
    const isCrossSubdomainHandoff = !!(hash && hash.includes('_at='));

    if (isCrossSubdomainHandoff) {
      const params = new URLSearchParams(hash.slice(1));
      const at = params.get('_at');
      const rt = params.get('_rt');
      const it = params.get('_it');
      const ic = params.get('_ic');
      const pr = params.get('_pr'); // optional profile relay

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
          fetch(`${supabaseUrl}/rest/v1/subscription_plans?select=id&limit=1`, {
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${at}`,
            },
          }).catch(() => {});
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

        return () => subscription.unsubscribe();
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
      authGenRef.current++;
      subscription.unsubscribe();
    };
  }, [fetchUserData, refreshAuth]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error as Error | null };
  }, []);

  const signOut = useCallback(async () => {
    await endSession();
    sessionStorage.removeItem("quick_login_original_email");
    sessionStorage.removeItem("quick_login_original_name");
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
        supabase.functions.invoke("log-unauthorized", {
          body: { action: "impersonation", targetId: companyId, reason: "missing_can_manage_companies" },
        });
        return null;
      }

      if (permissions.allowed_company_ids && !permissions.allowed_company_ids.includes(companyId)) {
        logger.error("Company not in allowed_company_ids for impersonation");
        toast.error("Accesso negato", { description: "Questa azienda non è nella tua lista di aziende permesse." });
        supabase.functions.invoke("log-unauthorized", {
          body: { action: "impersonation", targetId: companyId, reason: "company_not_allowed" },
        });
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
  }, [state.role]);

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
  useEffect(() => {
    if (!state.user) return;
    const ping = () => {
      supabase.from("subscription_plans").select("id").limit(1).catch(() => {});
    };
    const id = setInterval(ping, 4 * 60 * 1000);
    return () => clearInterval(id);
  }, [state.user?.id]);

  // Fetch multi-company accesses for multi_company_user and platform roles
  useEffect(() => {
    async function fetchMultiCompanyAccesses() {
      const platformRoles: string[] = [
        "multi_company_user",
        "platform_manager",
        "platform_sales",
        "platform_support",
        "platform_marketing",
        "platform_implementation",
      ];
      if (!state.user || !state.role || !platformRoles.includes(state.role)) {
        setMultiCompanyState(prev => ({ ...prev, accesses: [] }));
        return;
      }

      const { data, error } = await supabase
        .from("multi_company_access")
        .select("*, companies:company_id(*)")
        .eq("user_id", state.user.id);

      if (error) {
        logger.error("Error fetching multi-company accesses:", error);
        return;
      }

      const accesses = (data || []).map((a: any) => ({
        ...a,
        company: a.companies as Company,
      })) as MultiCompanyAccess[];

      // Auto-select first company if none selected
      setMultiCompanyState(prev => {
        const currentSelectedId = prev.selectedId;
        if (!currentSelectedId && accesses.length > 0) {
          const firstId = accesses[0].company_id;
          sessionStorage.setItem(MULTI_COMPANY_KEY, firstId);
          return { accesses, selectedId: firstId, selectedCompany: accesses[0].company || null };
        } else if (currentSelectedId) {
          const found = accesses.find(a => a.company_id === currentSelectedId);
          return { accesses, selectedId: currentSelectedId, selectedCompany: found?.company || null };
        }
        return { ...prev, accesses };
      });
    }

    fetchMultiCompanyAccesses();
  }, [state.role, state.user?.id]);

  const switchMultiCompany = useCallback((companyId: string) => {
    sessionStorage.setItem(MULTI_COMPANY_KEY, companyId);
    setMultiCompanyState(prev => {
      const found = prev.accesses.find(a => a.company_id === companyId);
      return { ...prev, selectedId: companyId, selectedCompany: found?.company || null };
    });
  }, []);

  // isImpersonating is true as soon as impersonatedCompanyId is set (not waiting for impersonatedCompany
  // to be fetched). This prevents the route guard from redirecting the superadmin to /admin
  // before fetchImpersonatedCompany has had a chance to load the company data.
  // We require the role to be confirmed as super_admin OR that both token+companyId are present
  // in session (the latter handles the transient window after setSession() where fetchUserData
  // may have failed and role is temporarily null).
  const hasActiveImpersonationSession = !!impersonatedCompanyId && !!impersonationToken;
  const isImpersonating = (state.role === "super_admin" && !!impersonatedCompanyId) || hasActiveImpersonationSession;

  // Effective company: impersonation > multi-company (including platform_* roles) > real company
  const isPlatformRole = state.role?.startsWith("platform_") ?? false;
  const effectiveCompany = isImpersonating
    ? impersonatedCompany
    : (state.role === "multi_company_user" || isPlatformRole) && multiCompanyObj
      ? multiCompanyObj
      : state.company;

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
      selectedMultiCompanyId,
      switchMultiCompany,
    }),
    [state, signIn, signOut, refreshAuth, impersonatedCompanyId, impersonationToken, impersonatedCompany, isImpersonating, isImpersonationReady, impersonateCompany, exitImpersonation, effectiveCompany, multiCompanyState, switchMultiCompany]
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
