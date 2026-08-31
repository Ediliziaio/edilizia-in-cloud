import { useAuth } from "@/contexts/AuthContext";
import { PLATFORM_ADMIN_COMPANY_ID } from "@/lib/adminConstants";

/**
 * true quando si sta lavorando dentro il CRM di piattaforma (AEDIX), non nel CRM
 * di un'azienda cliente.
 *
 * Serve perche' le pagine marketing dell'admin (/admin/marketing/*) RIUSANO gli
 * stessi componenti delle aziende, avvolti in <PlatformCompanyProvider> che
 * sovrascrive `effectiveCompany` con l'azienda di piattaforma. Le funzioni legate
 * ai servizi AEDIX (catalogo prodotti, clienti-servizio) hanno senso solo li' —
 * e le tabelle `aedix_*` hanno RLS super-admin, quindi a un'azienda cliente
 * darebbero comunque errore. Con questo hook restano invisibili ai tenant.
 */
export function useIsPlatformCrm(): boolean {
  const { effectiveCompany } = useAuth();
  return effectiveCompany?.id === PLATFORM_ADMIN_COMPANY_ID;
}
