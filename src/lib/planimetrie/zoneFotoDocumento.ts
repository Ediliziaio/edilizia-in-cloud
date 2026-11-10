import type { Planimetria } from "../../../shared/planimetrie/modello.ts";
import { zonaFotoValida, type ZonaFotoDocumento } from "../../../shared/planimetrie/letturaTipi.ts";
import { verificheDelDocumento } from "../../../shared/planimetrie/verificaDocumento.ts";

export function impostaZoneFoto(documento: Planimetria, id: string, zone: ZonaFotoDocumento[]): Planimetria {
  if (!documento.letturaDocumento || zone.length > 8 || !zone.every(zonaFotoValida)) throw new Error("La zona deve restare dentro la foto originale.");
  const verifiche = verificheDelDocumento(documento);
  if (!verifiche.some((v) => v.id === id)) throw new Error("Controllo non trovato.");
  return { ...documento, letturaDocumento: { ...documento.letturaDocumento, verifiche: verifiche.map((v) => v.id === id ? { ...v, zoneFoto: zone } : v) } };
}
