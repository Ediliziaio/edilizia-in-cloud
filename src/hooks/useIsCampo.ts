/**
 * Hook per verificare se l'utente corrente ha un ruolo campo
 * (operaio interno o subappaltatore).
 */
import { useAuth } from "@/contexts/AuthContext";
import { resolveRouteAccessRole } from "@/lib/auth/multiCompany";
import { CAMPO_TECNICI_ROLES } from "@/types/auth";

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
  const isTecnico = !!currentRole && CAMPO_TECNICI_ROLES.includes(currentRole);

  return { isCampo, isOperaio, isSubappaltatore, isTecnico, role: currentRole, profile, user };
}
