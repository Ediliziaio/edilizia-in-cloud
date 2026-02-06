import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole, Profile, Company, AuthState } from "@/types/auth";

interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    role: null,
    company: null,
    isLoading: true,
  });

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

  return (
    <AuthContext.Provider
      value={{
        ...state,
        signIn,
        signOut,
        refreshAuth,
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
