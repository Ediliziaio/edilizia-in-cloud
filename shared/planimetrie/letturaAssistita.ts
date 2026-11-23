import { zonaFotoValida, type ZonaFotoDocumento } from "./letturaTipi.ts";

export const TIPI_TAVOLA = ["muro", "porta", "finestra", "scala", "locale"] as const;
export type TipoTavola = (typeof TIPI_TAVOLA)[number];
export type PuntoTavola = { x: number; y: number };
export type TrattoTavola = { da: PuntoTavola; a: PuntoTavola; spessore: number };
export type ElementoLetturaTavola = {
  id: string;
  tipo: TipoTavola;
  zona: ZonaFotoDocumento;
  stato: "da_verificare" | "inserito" | "scartato";
  nome?: string;
  tratto?: TrattoTavola;
};

export type LetturaAssistita = { percorso: string; elementi: ElementoLetturaTavola[]; etichetteLette?: boolean };

const numeroNormalizzato = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
const puntoValido = (p: PuntoTavola | undefined) => !!p && numeroNormalizzato(p.x) && numeroNormalizzato(p.y);

export function letturaAssistitaValida(valore: unknown): valore is LetturaAssistita {
  if (!valore || typeof valore !== "object") return false;
  const { percorso, elementi, etichetteLette } = valore as LetturaAssistita;
  if (typeof percorso !== "string" || !/^[\w-]+\/ricalco\/[\w.-]+$/.test(percorso) || !Array.isArray(elementi) || elementi.length > 400
    || (etichetteLette !== undefined && typeof etichetteLette !== "boolean")) return false;
  const ids = new Set<string>();
  return elementi.every((elemento) => {
    if (!elemento || typeof elemento.id !== "string" || !/^[\w-]{1,80}$/.test(elemento.id) || ids.has(elemento.id)
      || !TIPI_TAVOLA.includes(elemento.tipo) || !zonaFotoValida(elemento.zona)
      || !["da_verificare", "inserito", "scartato"].includes(elemento.stato)) return false;
    if ((elemento.tipo === "locale" || elemento.nome !== undefined)
      && (typeof elemento.nome !== "string" || !elemento.nome.trim() || elemento.nome.length > 80)) return false;
    if (elemento.tipo !== "locale") {
      const t = elemento.tratto;
      if (!t || !puntoValido(t.da) || !puntoValido(t.a) || (t.da.x === t.a.x && t.da.y === t.a.y)
        || !numeroNormalizzato(t.spessore) || t.spessore <= 0) return false;
    }
    ids.add(elemento.id);
    return true;
  });
}
