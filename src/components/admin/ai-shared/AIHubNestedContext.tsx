/**
 * AIHubNestedContext — segnala alle sub-pagine AI (Config/Monitor/Operate/Memoria)
 * che sono renderizzate **all'interno** di AdminAIHub.
 *
 * Quando le sub-pagine sono nested, devono:
 *   - nascondere il proprio AIPageHeader (c'è già AdminHeroHeader outer)
 *   - rimuovere il padding/max-width esterno (handled dal hub)
 *   - sostituire i quickLinks "Configurazione / Monitor / Operate" con cambi
 *     di `section` interna invece di Navigation legacy
 *
 * Default: false → comportamento legacy preservato.
 */
import { createContext, useContext } from "react";

interface AIHubNestedContextValue {
  /** True quando la sub-pagina è renderizzata dentro AdminAIHub. */
  isNested: boolean;
  /** Cambia la section del hub (operate/monitor/config/memoria) preservando sub-tab. */
  navigateToSection?: (section: "operate" | "monitor" | "config" | "memoria") => void;
}

const AIHubNestedContext = createContext<AIHubNestedContextValue>({
  isNested: false,
});

export function AIHubNestedProvider({
  children,
  navigateToSection,
}: {
  children: React.ReactNode;
  navigateToSection: AIHubNestedContextValue["navigateToSection"];
}) {
  return (
    <AIHubNestedContext.Provider value={{ isNested: true, navigateToSection }}>
      {children}
    </AIHubNestedContext.Provider>
  );
}

export function useAIHubNested(): AIHubNestedContextValue {
  return useContext(AIHubNestedContext);
}
