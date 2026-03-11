import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole, Profile, Company, AuthState } from "@/types/auth";
import { logger } from "@/utils/logger";

interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  // Impersonation
  impersonatedCompanyId: string | null;
  impersonatedCompany: Company | null;
  isImpersonating: boolean;
  impersonateCompany: (companyId: string, permissions?: { can_manage_companies: boolean; allowed_company_ids: string[] | null }) => Promise<void>;
  exitImpersonation: () => Promise<void>;
  // Effective company (real or impersonated)
  effectiveCompany: Company | null;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Impersonation is now in-memory only (no sessionStorage) to prevent manipulation
const SESSION_ID_KEY = "user_session_id";

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

async function startSession() {
  try {
    const info = getBrowserInfo();
    const { data } = await supabase.functions.invoke("track-user-session", {
      body: { action: "start", ...info },
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
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    role: null,
    company: null,
    isLoading: true,
  });

  const [impersonatedCompanyId, setImpersonatedCompanyId] = useState<string | null>(null);
  const [impersonatedCompany, setImpersonatedCompany] = useState<Company | null>(null);

  const fetchUserData = useCallback(async (userId: string) => {
    try {
      // Fetch profile
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (profileError) {
        logger.error("Error fetching profile:", profileError);
        return { profile: null, role: null, company: null };
      }

      // Fetch all roles for priority resolution
      const { data: rolesData, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if (roleError) {
        logger.error("Error fetching roles:", roleError);
      }

      // Determine effective role with priority: salesperson > call_center > company_admin > company_staff
      const rolePriority: AppRole[] = ["salesperson", "call_center", "company_admin", "company_staff"];
      const userRoles = (rolesData || []).map(r => r.role as AppRole);
      const effectiveRole = rolePriority.find(r => userRoles.includes(r)) || userRoles[0] || null;

      // Fetch company if profile has company_id
      let company: Company | null = null;
      if (profileData?.company_id) {
        const { data: companyData, error: companyError } = await supabase
          .from("companies")
          .select("*")
          .eq("id", profileData.company_id)
          .maybeSingle();

        if (companyError) {
          logger.error("Error fetching company:", companyError);
        } else {
          company = companyData as Company;
        }
      }

      return {
        profile: profileData as Profile | null,
        role: effectiveRole,
        company,
      };
    } catch (error) {
      logger.error("Error in fetchUserData:", error);
      return { profile: null, role: null, company: null };
    }
  }, []);

  const refreshAuth = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      const userData = await fetchUserData(user.id);
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
  }, [fetchUserData]);

  // Fetch impersonated company data when impersonatedCompanyId changes
  useEffect(() => {
    async function fetchImpersonatedCompany() {
      if (!impersonatedCompanyId) {
        setImpersonatedCompany(null);
        return;
      }

      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("id", impersonatedCompanyId)
        .maybeSingle();

      if (error) {
        logger.error("Error fetching impersonated company:", error);
        setImpersonatedCompany(null);
        setImpersonatedCompanyId(null);
      } else {
        setImpersonatedCompany(data as Company);
      }
    }

    fetchImpersonatedCompany();
  }, [impersonatedCompanyId]);

  useEffect(() => {
    // Set up auth state listener BEFORE checking initial session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_IN" && session?.user) {
          // Use setTimeout to avoid potential race conditions
          setTimeout(async () => {
            const userData = await fetchUserData(session.user.id);
            setState({
              user: session.user,
              ...userData,
              isLoading: false,
            });
            // Start session tracking (fire-and-forget)
            if (!sessionStorage.getItem(SESSION_ID_KEY)) {
              startSession();
            }
          }, 0);
        } else if (event === "SIGNED_OUT") {
          setState({
            user: null,
            profile: null,
            role: null,
            company: null,
            isLoading: false,
          });
          // Clear impersonation on logout
          setImpersonatedCompanyId(null);
          setImpersonatedCompany(null);
        }
      }
    );

    // Check initial session
    refreshAuth();

    return () => {
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

  const [impersonationToken, setImpersonationToken] = useState<string | null>(null);

  const impersonateCompany = useCallback(async (companyId: string, permissions?: { can_manage_companies: boolean; allowed_company_ids: string[] | null }) => {
    if (state.role !== "super_admin") {
      logger.error("Only super_admin can impersonate companies");
      return;
    }

    if (permissions) {
      if (!permissions.can_manage_companies) {
        logger.error("Missing can_manage_companies permission for impersonation");
        supabase.functions.invoke("log-unauthorized", {
          body: { action: "impersonation", targetId: companyId, reason: "missing_can_manage_companies" },
        });
        return;
      }

      if (permissions.allowed_company_ids && !permissions.allowed_company_ids.includes(companyId)) {
        logger.error("Company not in allowed_company_ids for impersonation");
        supabase.functions.invoke("log-unauthorized", {
          body: { action: "impersonation", targetId: companyId, reason: "company_not_allowed" },
        });
        return;
      }
    }

    try {
      const { data, error } = await supabase.functions.invoke("secure-impersonation", {
        body: { action: "start", companyId },
      });

      if (error || !data?.token) {
        logger.error("Failed to start secure impersonation:", error);
        return;
      }

      setImpersonationToken(data.token);
      setImpersonatedCompanyId(companyId);
    } catch (err) {
      console.error("Impersonation error:", err);
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
  }, []);

  const isImpersonating = state.role === "super_admin" && !!impersonatedCompanyId && !!impersonatedCompany;
  
  // Effective company is the impersonated one when impersonating, otherwise the real one
  const effectiveCompany = isImpersonating ? impersonatedCompany : state.company;

  const contextValue = useMemo(
    () => ({
      ...state,
      signIn,
      signOut,
      refreshAuth,
      impersonatedCompanyId,
      impersonatedCompany,
      isImpersonating,
      impersonateCompany,
      exitImpersonation,
      effectiveCompany,
    }),
    [state, signIn, signOut, refreshAuth, impersonatedCompanyId, impersonatedCompany, isImpersonating, impersonateCompany, exitImpersonation, effectiveCompany]
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
