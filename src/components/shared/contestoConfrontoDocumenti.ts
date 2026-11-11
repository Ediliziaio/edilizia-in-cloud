import { createContext, useContext } from "react";

export const ComandiDocumentoContext = createContext<{ target: HTMLDivElement | null } | null>(null);

export function useDocumentoAffiancato() {
  return useContext(ComandiDocumentoContext) !== null;
}
