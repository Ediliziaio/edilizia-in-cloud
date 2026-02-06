import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole, Profile, Company, AuthState } from "@/types/auth";

interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  // Impersonation
  impersonatedCompanyId: string | null;
  impersonatedCompany: Company | null;
  isImpersonating: boolean;
  impersonateCompany: (companyId: string) => Promise<void>;
  exitImpersonation: () => void;
  // Effective company (real or impersonated)
  effectiveCompany: Company | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const IMPERSONATION_KEY = "impersonated_company_id";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    role: null,
    company: null,
    isLoading: true,
  });

  const [impersonatedCompanyId, setImpersonatedCompanyId] = useState<string | null>(() => {
    return sessionStorage.getItem(IMPERSONATION_KEY);
  });
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
        console.error("Error fetching profile:", profileError);
        return { profile: null, role: null, company: null };
      }

      // Fetch role
      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      if (roleError) {
        console.error("Error fetching role:", roleError);
      }

      // Fetch company if profile has company_id
      let company: Company | null = null;
      if (profileData?.company_id) {
        const { data: companyData, error: companyError } = await supabase
          .from("companies")
          .select("*")
          .eq("id", profileData.company_id)
          .maybeSingle();

        if (companyError) {
          console.error("Error fetching company:", companyError);
        } else {
          company = companyData as Company;
        }
      }

      return {
        profile: profileData as Profile | null,
        role: (roleData?.role as AppRole) || null,
        company,
      };
    } catch (error) {
      console.error("Error in fetchUserData:", error);
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
        console.error("Error fetching impersonated company:", error);
        setImpersonatedCompany(null);
        sessionStorage.removeItem(IMPERSONATION_KEY);
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
          sessionStorage.removeItem(IMPERSONATION_KEY);
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

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const impersonateCompany = async (companyId: string) => {
    // Only super_admin can impersonate
    if (state.role !== "super_admin") {
      console.error("Only super_admin can impersonate companies");
      return;
    }

    sessionStorage.setItem(IMPERSONATION_KEY, companyId);
    setImpersonatedCompanyId(companyId);
  };

  const exitImpersonation = () => {
    sessionStorage.removeItem(IMPERSONATION_KEY);
    setImpersonatedCompanyId(null);
    setImpersonatedCompany(null);
  };

  const isImpersonating = state.role === "super_admin" && !!impersonatedCompanyId && !!impersonatedCompany;
  
  // Effective company is the impersonated one when impersonating, otherwise the real one
  const effectiveCompany = isImpersonating ? impersonatedCompany : state.company;

  return (
    <AuthContext.Provider
      value={{
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
      }}
    >
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
