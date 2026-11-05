/**
 * Dentro la commessa bolle, ordini e richieste d'offerta si aprono in un popup: si resta sulla commessa.
 * Il contesto dice alle pagine dei documenti che sono in un popup, e porta i loro «vai a» nel popup invece che fuori.
 */
import { createContext, useCallback, useContext } from "react";
import { useNavigate, type NavigateOptions, type To } from "react-router-dom";

export type DocumentoPopup = { tipo: "ddt" | "oda" | "rdo" | "documento"; id: string; percorso: string };

/** Il documento di un indirizzo, se è uno di quelli che si aprono in popup. */
export function documentoDaPercorso(percorso: string): DocumentoPopup | null {
  // Un documento emesso, per esempio il DDT al cliente: solo con un id vero, «documenti/fatture-ricevute» è una pagina.
  const emesso = /^\/azienda\/documenti\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?(?:[?#].*)?$/i.exec(percorso);
  if (emesso) return { tipo: "documento", id: emesso[1], percorso: `/azienda/documenti/${emesso[1]}/dettaglio` };
  const m = /^\/azienda\/(ddt|ordini-acquisto|richieste-offerta)\/([^/?#]+)\/?(?:[?#].*)?$/.exec(percorso);
  if (!m) return null;
  const tipo = ({ ddt: "ddt", "ordini-acquisto": "oda", "richieste-offerta": "rdo" } as const)[m[1] as "ddt" | "ordini-acquisto" | "richieste-offerta"];
  return { tipo, id: m[2], percorso: `/azienda/${m[1]}/${m[2]}` };
}

/** Le liste generali e la commessa stessa: dal popup vuol dire «chiudi», non «esci». */
export function chiudeIlPopup(percorso: string, orderId: string): boolean {
  return percorso.startsWith("/azienda/ordini?") || percorso === "/azienda/ordini" || percorso.split(/[?#]/)[0] === `/azienda/ordini/${orderId}`;
}

export interface ContestoPopup { vai: (percorso: string) => boolean; dentroIlPopup: boolean; idDocumento?: string }
const Contesto = createContext<ContestoPopup | null>(null);
export const ContestoDocumentoPopup = Contesto.Provider;
export const useDentroPopupDocumento = () => !!useContext(Contesto)?.dentroIlPopup;
/** L'id del documento: nel popup l'indirizzo resta quello della commessa, quindi lo dice il popup. */
export const useIdDocumento = (dallIndirizzo: string | undefined) => {
  const contesto = useContext(Contesto);
  return contesto?.dentroIlPopup ? contesto.idDocumento : dallIndirizzo;
};

/** Come useNavigate: dentro la commessa i documenti si aprono nel popup, tutto il resto va dove deve. */
export function useNavigaDocumento() {
  const naviga = useNavigate();
  const contesto = useContext(Contesto);
  return useCallback((a: To | number, opzioni?: NavigateOptions) => {
    if (typeof a === "number") { naviga(a); return; }
    if (typeof a === "string" && contesto?.vai(a)) return;
    if (opzioni) naviga(a, opzioni); else naviga(a);
  }, [naviga, contesto]);
}
