/** Controlli del rilievo, salvati nella versione della pianta. Nessuna scelta dell'AI è una conferma. */
export interface RiferimentoVerifica {
  livelloId: string;
  tipo: "locale" | "apertura";
  oggettoId: string;
  campo: "larghezza" | "profondita" | "altezza" | "verso" | "posizione" | "contorno";
}

export interface VerificaLettura {
  id: string;
  tipo: "quota" | "geometria" | "aperture" | "elementi" | "nota";
  descrizione: string;
  riferimento?: RiferimentoVerifica;
  valoriLettiCm?: number[];
  /** Zone indicate sulla foto salvata: coordinate 0–1, indipendenti dallo zoom. Non sono conferme della quota. */
  zoneFoto?: ZonaFotoDocumento[];
  conferma?: { firma: string; quando: string; nota?: string; valoreCm?: number };
}

export interface ZonaFotoDocumento { x: number; y: number; larghezza: number; altezza: number }

export function zonaFotoValida(v: unknown): v is ZonaFotoDocumento {
  if (!v || typeof v !== "object") return false;
  const r = v as ZonaFotoDocumento;
  return [r.x, r.y, r.larghezza, r.altezza].every((n) => typeof n === "number" && Number.isFinite(n))
    && r.x >= 0 && r.y >= 0 && r.larghezza >= 0.002 && r.altezza >= 0.002
    && r.x + r.larghezza <= 1.000001 && r.y + r.altezza <= 1.000001;
}

export interface LetturaDocumento {
  /** Attivato dall'editor che supporta il confronto e le conferme. */
  protocolloVerifica?: 1;
  avvisiIniziali: string[];
  superficiScritteMq: Record<string, number>;
  /** Percorso privato nel bucket planimetrie, mai un URL firmato o un blob URL. */
  sorgente?: { percorso: string; nome: string };
  verifiche?: VerificaLettura[];
}

export function verificheLetturaValide(v: unknown): v is VerificaLettura[] {
  if (!Array.isArray(v) || v.length > 500) return false;
  const ids = new Set<string>();
  return v.every((r) => {
    if (!r || typeof r !== "object" || typeof r.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(r.id) || ids.has(r.id)) return false;
    ids.add(r.id);
    if (!["quota", "geometria", "aperture", "elementi", "nota"].includes(r.tipo) || typeof r.descrizione !== "string" || !r.descrizione.trim() || r.descrizione.length > 4000) return false;
    if (r.valoriLettiCm !== undefined && (!Array.isArray(r.valoriLettiCm) || r.valoriLettiCm.length > 20 || !r.valoriLettiCm.every((n: unknown) => typeof n === "number" && Number.isFinite(n) && n > 0 && n <= 100000))) return false;
    if (r.zoneFoto !== undefined && (!Array.isArray(r.zoneFoto) || r.zoneFoto.length > 8 || !r.zoneFoto.every(zonaFotoValida))) return false;
    if (r.riferimento !== undefined) {
      const a = r.riferimento;
      if (!a || typeof a !== "object" || ![a.livelloId, a.oggettoId].every((s) => typeof s === "string" && /^[a-zA-Z0-9_-]{1,150}$/.test(s)) || !["locale", "apertura"].includes(a.tipo) || !["larghezza", "profondita", "altezza", "verso", "posizione", "contorno"].includes(a.campo)) return false;
    }
    if (r.conferma !== undefined) {
      const c = r.conferma;
      if (!c || typeof c !== "object" || typeof c.firma !== "string" || !/^[a-zA-Z0-9:_-]{1,100}$/.test(c.firma) || typeof c.quando !== "string" || c.quando.length > 40 || !Number.isFinite(Date.parse(c.quando))) return false;
      if (c.nota !== undefined && (typeof c.nota !== "string" || c.nota.length > 1000)) return false;
      if (c.valoreCm !== undefined && !(typeof c.valoreCm === "number" && Number.isFinite(c.valoreCm) && c.valoreCm > 0 && c.valoreCm <= 100000)) return false;
    }
    return true;
  });
}
