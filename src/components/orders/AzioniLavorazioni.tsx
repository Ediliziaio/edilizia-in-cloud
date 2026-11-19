import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FooterLavorazioni = createContext<HTMLDivElement | null>(null);
export function FooterLavorazioniProvider({ value, children }: { value: HTMLDivElement | null; children: ReactNode }) {
  return <FooterLavorazioni.Provider value={value}>{children}</FooterLavorazioni.Provider>;
}

export function AzioniLavorazioni({ children }: { children: ReactNode }) {
  const footer = useContext(FooterLavorazioni);
  return footer ? createPortal(children, footer) : children;
}
