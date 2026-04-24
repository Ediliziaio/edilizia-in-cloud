import { useLocation } from "react-router-dom";

/**
 * Base path dinamico per i link interni al modulo Agenti AI.
 *
 * Motivazione:
 * Il modulo Agenti AI è montato in due posti con nome diverso:
 *   - `/azienda/agenti-ai` (lato azienda cliente)
 *   - `/admin/marketing/agenti-ai` (lato super-admin, tramite
 *     `AdminMarketingAgents` wrapper + `PlatformCompanyProvider`)
 *
 * Hardcoding dei link a `/azienda/agenti-ai/…` — come si trova in
 * `AgentiTab.tsx` e altri componenti — porta fuori contesto: un super-admin
 * che clicca "apri agente" viene sbalzato dentro la sezione azienda.
 *
 * Questo hook ispeziona il pathname corrente e restituisce il prefix
 * appropriato. Le pagine dei moduli/componenti usano questo valore per
 * costruire i link di navigazione interna.
 *
 * Esempio:
 *   const base = useAiAgentsBasePath();     // "/admin/marketing/agenti-ai"
 *   navigate(`${base}/${agentId}`);         // /admin/marketing/agenti-ai/<id>
 */
export function useAiAgentsBasePath(): string {
  const { pathname } = useLocation();
  if (pathname.startsWith("/admin/marketing/agenti-ai")) return "/admin/marketing/agenti-ai";
  return "/azienda/agenti-ai";
}
