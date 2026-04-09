import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PortaleCliente {
  cliente_id: string;
  company_id: string;
  first_name: string;
  last_name: string;
  email: string;
  company_name: string;
  expires_at: string;
}

interface PortaleAuthState {
  loading: boolean;
  valido: boolean;
  cliente: PortaleCliente | null;
  error: string | null;
}

export function usePortaleAuth(token: string | undefined): PortaleAuthState {
  const [state, setState] = useState<PortaleAuthState>({
    loading: true,
    valido: false,
    cliente: null,
    error: null,
  });

  useEffect(() => {
    if (!token) {
      setState({ loading: false, valido: false, cliente: null, error: "Token mancante" });
      return;
    }

    let cancelled = false;

    async function validateToken() {
      setState({ loading: true, valido: false, cliente: null, error: null });

      try {
        const { data, error } = await (supabase as any).rpc("valida_portale_token", {
          p_token: token,
        });

        if (cancelled) return;

      if (error) {
        setState({
          loading: false,
          valido: false,
          cliente: null,
          error: error.message ?? "Errore nella validazione del token",
        });
        return;
      }

      if (!data || !data.valido) {
        setState({
          loading: false,
          valido: false,
          cliente: null,
          error: "Token non valido o scaduto",
        });
        return;
      }

      setState({
        loading: false,
        valido: true,
        cliente: {
          cliente_id: data.cliente_id,
          company_id: data.company_id,
          first_name: data.first_name,
          last_name: data.last_name,
          email: data.email,
          company_name: data.company_name,
          expires_at: data.expires_at,
        },
        error: null,
      });
      } catch (err) {
        if (cancelled) return;
        setState({
          loading: false,
          valido: false,
          cliente: null,
          error: err instanceof Error ? err.message : "Errore di rete durante la validazione",
        });
      }
    }

    validateToken();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return state;
}
