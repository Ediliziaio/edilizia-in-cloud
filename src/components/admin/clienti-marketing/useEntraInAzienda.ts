/**
 * «Entra nell'azienda» dalla console clienti: lo stesso flusso canonico di
 * CompanyQuickEnterPopover e CompaniesList — token di impersonazione più
 * sessione passati nell'hash all'app azienda, che li ricostruisce di là dal
 * sottodominio. L'ingresso generico atterra su Attività (regola fissa del
 * progetto); le azioni mirate della console («apri i lead fermi», «ricollega
 * Meta») passano la pagina su cui atterrare.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth, getCachedTokens } from "@/contexts/AuthContext";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { getSubdomainUrl, navigateToSubdomain } from "@/utils/subdomainNav";
import { safeRedirect } from "@/utils/safeRedirect";
import { logger } from "@/utils/logger";

export const PAGINA_ATTIVITA = "/azienda/attivita";

export function useEntraInAzienda() {
  const { impersonateCompany, profile, role, company: adminCompany } = useAuth();
  const { permissions } = useSuperAdminPermissions();
  const navigate = useNavigate();
  const [inCorso, setInCorso] = useState<string | null>(null);

  const entra = async (companyId: string, pagina: string = PAGINA_ATTIVITA) => {
    if (!permissions?.impersonation) {
      toast.error("Non hai il permesso di entrare nelle aziende");
      return;
    }
    if (permissions.allowed_company_ids?.length && !permissions.allowed_company_ids.includes(companyId)) {
      toast.error("Permesso negato", { description: "Questa azienda non rientra nel tuo perimetro." });
      return;
    }
    // Solo percorsi interni all'app azienda: niente URL esterni nel redirect.
    const destinazione = pagina.startsWith("/azienda/") ? pagina : PAGINA_ATTIVITA;
    setInCorso(companyId);
    try {
      const impToken = await impersonateCompany(companyId, permissions ?? undefined);
      if (impToken) {
        const { accessToken, refreshToken } = getCachedTokens();
        if (accessToken && refreshToken) {
          let pr: string | undefined;
          if (profile && role) {
            try {
              pr = btoa(JSON.stringify({ profile, role, company: adminCompany ?? null })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
            } catch { /* senza relay l'app ricostruisce comunque la sessione */ }
          }
          const params = new URLSearchParams({ _at: accessToken, _rt: refreshToken, _it: impToken, _ic: companyId, ...(pr ? { _pr: pr } : {}) });
          safeRedirect(getSubdomainUrl(`${destinazione}#${params.toString()}`, "app"));
          return;
        }
      }
      navigateToSubdomain(destinazione, "app", (path) => navigate(path, { replace: true }));
    } catch (err) {
      logger.error("Enter company error:", err);
      toast.error("Impossibile entrare nell'azienda");
    } finally {
      setInCorso(null);
    }
  };

  return { entra, inCorso, permesso: !!permissions?.impersonation };
}
