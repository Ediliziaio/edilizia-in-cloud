/**
 * Hook per verificare se l'utente corrente ha un ruolo campo
 * (operaio interno o subappaltatore).
 */
import { useAuth } from "@/contexts/AuthContext";
import { resolveRouteAccessRole } from "@/lib/auth/multiCompany";

export function useIsCampo() {
  const { role, profile, user, multiCompanyAccesses, selectedMultiCompanyId } = useAuth();
  const currentRole = resolveRouteAccessRole({
    globalRole: role,
    accesses: multiCompanyAccesses,
    selectedCompanyId: selectedMultiCompanyId,
  });

  const isOperaio = currentRole === "employee";
  const isSubappaltatore = currentRole === "subcontractor";
  const isCampo = isOperaio || isSubappaltatore;

  return { isCampo, isOperaio, isSubappaltatore, role: currentRole, profile, user };
}
