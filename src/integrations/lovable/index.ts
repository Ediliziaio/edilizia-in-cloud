// OAuth via Supabase Auth nativo — Lovable Cloud Auth rimosso
// Mantiene la stessa interfaccia pubblica per compatibilità con LoginForm.tsx

import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

export const lovable = {
  auth: {
    signInWithOAuth: async (provider: "google" | "apple", opts?: SignInOptions) => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: opts?.redirect_uri ?? window.location.origin,
          queryParams: opts?.extraParams,
        },
      });
      if (error) return { error };
      // Supabase OAuth redirects the browser, no token to set manually
      return { redirected: true };
    },
  },
};
