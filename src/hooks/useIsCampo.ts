/**
 * Hook per verificare se l'utente corrente ha un ruolo campo
 * (operaio interno o subappaltatore).
 */
import { useAuth } from "@/contexts/AuthContext";

export function useIsCampo() {
  const { role, profile, user } = useAuth();

  const isOperaio = role === "employee";
  const isSubappaltatore = role === "subcontractor";
  const isCampo = isOperaio || isSubappaltatore;

  return { isCampo, isOperaio, isSubappaltatore, role, profile, user };
}
