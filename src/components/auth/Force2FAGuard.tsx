/**
 * Force2FAGuard — v8.6.92
 *
 * Per i ruoli definiti come "high-privilege" (default: super_admin) richiede
 * obbligatoriamente l'attivazione 2FA. Se l'utente non ha 2FA attivo viene
 * mostrato un dialog full-screen non dismissibile con il setup.
 *
 * Configurabile da super-admin via platform_settings:
 *   - force_2fa_super_admin: "true" (default) | "false"
 *   - force_2fa_company_admin: "false" (default) | "true" (per esigenze enterprise)
 *
 * Bypass: solo durante impersonation di super_admin → no enforcement
 * (l'admin sta visualizzando, non operando come quell'utente).
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldAlert } from "lucide-react";
import { TwoFactorSetup } from "./TwoFactorSetup";

const POLICIES = ["force_2fa_super_admin", "force_2fa_company_admin"] as const;

export function Force2FAGuard({ children }: { children: React.ReactNode }) {
  const { user, role, isImpersonating } = useAuth();
  const [hasMFA, setHasMFA] = useState<boolean | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);

  // 1. Politiche attive (cache 30min).
  // v8.6.96 — enabled solo se utente autenticato (evita query a platform_settings
  // su pagine pubbliche tipo landing/login con conseguente 401 logspam).
  const { data: policies } = useQuery({
    queryKey: ["2fa-policies"],
    staleTime: 30 * 60 * 1000,
    retry: false,
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", [...POLICIES]);
      // Errore (RLS, network) → fail-open per non bloccare l'app
      if (error) return { forceSuperAdmin: false, forceCompanyAdmin: false };
      const map = new Map((data ?? []).map((r) => [r.key, r.value]));
      return {
        forceSuperAdmin: map.get("force_2fa_super_admin") === "true",
        forceCompanyAdmin: map.get("force_2fa_company_admin") === "true",
      };
    },
  });

  // 2. Verifica fattori MFA attivi.
  // v8.6.96 — l'app usa custom TOTP via edge function `manage-totp` (tabella
  // proprietaria), NON il MFA nativo Supabase. Quindi chiamiamo l'edge fn.
  // v8.6.103 — timeout esplicito 6s + cleanup robusto: se l'edge fn è in
  // cold-start (Supabase free tier ~10-30s), evita guard pending per 60s.
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    // Sicurezza: timeout esteso a 15s per coprire i cold-start dell'edge fn.
    // A 6s si faceva fail-open troppo presto, lasciando passare admin che
    // DEVONO avere il 2FA. Con 15s nella stragrande maggioranza dei casi si
    // ottiene lo stato 2FA REALE (enforce corretto). La app resta usabile
    // durante il check (children sono già renderizzati), quindi nessun blocco
    // percepito. Fail-open residuo solo se l'edge resta irraggiungibile >15s.
    const timeoutId = window.setTimeout(() => {
      if (alive) setHasMFA(true);
    }, 15000);
    void supabase.functions
      .invoke("manage-totp", { body: { action: "status" } })
      .then(({ data, error }) => {
        if (!alive) return;
        window.clearTimeout(timeoutId);
        if (error) {
          setHasMFA(true);
          return;
        }
        const enabled = !!(data as { enabled?: boolean } | null | undefined)?.enabled;
        setHasMFA(enabled);
      })
      .catch(() => {
        if (!alive) return;
        window.clearTimeout(timeoutId);
        setHasMFA(true);
      });
    return () => {
      alive = false;
      window.clearTimeout(timeoutId);
    };
  }, [user?.id]);

  const mustForce =
    !!policies &&
    !isImpersonating &&
    ((role === "super_admin" && policies.forceSuperAdmin) ||
      (role === "company_admin" && policies.forceCompanyAdmin));

  const shouldShowSetup = mustForce && hasMFA === false;

  useEffect(() => {
    if (shouldShowSetup) setSetupOpen(true);
  }, [shouldShowSetup]);

  return (
    <>
      {children}
      <Dialog
        open={setupOpen}
        onOpenChange={(v) => {
          // Permette chiusura solo se 2FA è attivo. Se hasMFA è null
          // (errore di rete) lascia chiudere per non bloccare l'utente.
          if (!v && hasMFA === false) return;
          setSetupOpen(v);
        }}
      >
        <DialogContent
          className="max-w-md"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              Autenticazione a due fattori obbligatoria
            </DialogTitle>
            <DialogDescription>
              Per il tuo ruolo è richiesta l&apos;autenticazione a due fattori (2FA).
              Configurala ora per continuare a usare la piattaforma in sicurezza.
            </DialogDescription>
          </DialogHeader>

          <Alert>
            <AlertDescription className="text-sm">
              Usa un&apos;app Authenticator (Google Authenticator, Authy, 1Password) per
              scansionare il QR code e inserire il codice di verifica.
            </AlertDescription>
          </Alert>

          <TwoFactorSetup />
          <p className="text-xs text-center text-muted-foreground mt-2">
            Una volta completato il setup, ricarica la pagina per continuare.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
