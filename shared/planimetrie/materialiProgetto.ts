import type { Planimetria, StatoPianta } from "./modello.ts";
import type { ConfigPavimentoStanza } from "../render-room/floorSelection.ts";
import { PAVIMENTI_STANZA } from "./finiture.ts";

export const PROFILI_PROGETTO = { pvc: "PVC", alluminio: "Alluminio", minimal: "Alluminio minimale", legno: "Legno", legno_alluminio: "Legno e alluminio" } as const;
export const COLORI_INFISSI_PROGETTO = { bianco: { nome: "Bianco RAL 9010", hex: "#F1F1EE" }, antracite: { nome: "Antracite RAL 7016", hex: "#3B4046" }, legno: { nome: "Rovere naturale", hex: "#8A6A4B" }, verde: { nome: "Verde", hex: "#3F5B49" }, grigio: { nome: "Grigio", hex: "#8D949A" } } as const;
export interface InfissiProgetto { profilo: keyof typeof PROFILI_PROGETTO; colore: keyof typeof COLORI_INFISSI_PROGETTO }
export interface MaterialiProgetto { pavimento?: ConfigPavimentoStanza; infissi?: InfissiProgetto }
export interface EccezioniMateriali { pavimento?: boolean; infissi?: boolean }

/** Scelte del progetto, condivise tra piani. Mai preferenze globali del browser. */
export function materialiDelProgetto(doc: Planimetria, ambito: string): MaterialiProgetto {
  return doc.materialiProgetto?.[ambito] ?? {};
}

/** Un piano senza opere nuove conserva il disegno esistente e i materiali del progetto. */
export function ambitoGeometriaDelPiano(doc: Planimetria, livelloId: string, ambito: string): string {
  return ambito === "fatto" || doc.livelli.find((l) => l.id === livelloId)?.proposte.some((p) => `progetto:${p.id}` === ambito) ? ambito : "fatto";
}

export function materialiProgettoValidi(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([ambito, raw]) => {
    if (!(ambito === "fatto" || ambito.startsWith("progetto:")) || !raw || typeof raw !== "object" || Array.isArray(raw)) return false;
    const m = raw as MaterialiProgetto;
    if (m.infissi && (!(m.infissi.profilo in PROFILI_PROGETTO) || !(m.infissi.colore in COLORI_INFISSI_PROGETTO))) return false;
    return m.pavimento === undefined || (typeof m.pavimento === "object" && !Array.isArray(m.pavimento) && m.pavimento !== null && typeof m.pavimento.attivo === "boolean" && typeof m.pavimento.tipo === "string");
  });
}

/** Gli stili pronti non possono cambiare i materiali comuni senza un'eccezione esplicita. */
export function applicaMaterialiProgetto<T extends { pavimento?: ConfigPavimentoStanza; eccezioni_materiali_progetto?: EccezioniMateriali }>(config: T, materiali: MaterialiProgetto): T & { infissi_progetto?: InfissiProgetto } {
  const eccezioni = config.eccezioni_materiali_progetto;
  return { ...config,
    ...(materiali.pavimento && !eccezioni?.pavimento ? { pavimento: { ...materiali.pavimento, attivo: true } } : {}),
    ...(materiali.infissi && !eccezioni?.infissi ? { infissi_progetto: { ...materiali.infissi } } : { infissi_progetto: undefined }),
  };
}

export function descrizionePavimento(p: ConfigPavimentoStanza): string {
  const clean = (s: string | undefined) => (s ?? "").replace(/_/g, " ");
  const nome = p.colore_nome || clean(p.tipo);
  const essenza = clean(p.essenza_legno);
  return [nome, essenza && !nome.toLowerCase().includes(essenza) ? essenza : "", (p.formato_piastrella ?? p.dimensione) ? `${p.formato_piastrella ?? p.dimensione} cm` : "", clean(p.pattern), clean(p.finitura)].filter(Boolean).join(" · ");
}

/** Un formato in centimetri aggiorna anche le misure dei listoni in millimetri. */
export function cambiaFormatoPavimento(p: ConfigPavimentoStanza, formato: string): ConfigPavimentoStanza {
  const parsed = formato.trim().replace(/,/g, ".").match(/^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)$/i);
  const parquet = p.tipo?.startsWith("parquet_");
  return { ...p, formato_piastrella: formato, ...(parquet && parsed && Number(parsed[1]) > 0 && Number(parsed[2]) > 0 ? { larghezza_listello_mm: Number(parsed[1]) * 10, lunghezza_listello_mm: Number(parsed[2]) * 10 } : {}) };
}

export function statoConMateriali(s: StatoPianta, materiali: MaterialiProgetto): StatoPianta {
  return materiali.pavimento ? { ...s, locali: s.locali.map((l) => ({ ...l, finiture: { ...l.finiture, pavimento: descrizionePavimento(materiali.pavimento!) } })) } : s;
}

export function vincoloInfissiProgetto(infissi: InfissiProgetto | undefined): string {
  if (!infissi) return "";
  return `PROJECT WINDOW MATERIAL SCHEDULE — apply identically in every room and every exterior view: ${PROFILI_PROGETTO[infissi.profilo]}, ${COLORI_INFISSI_PROGETTO[infissi.colore].nome} (${COLORI_INFISSI_PROGETTO[infissi.colore].hex}). Change only frame material/finish. Preserve EACH opening's original dimensions, sill height, location, shape, sash count and opening mechanism. A common profile never means common window dimensions. Never copy the geometry of a reference product photo. Keep shutters and entrance/internal doors unchanged unless explicitly selected elsewhere.`;
}

export function pavimentoDaCampione(id: string): ConfigPavimentoStanza {
  const c = PAVIMENTI_STANZA.find((x) => x.id === id) ?? PAVIMENTI_STANZA[0];
  const wood = ["rovere", "noce", "gres_legno"].includes(c.id);
  return { attivo: true, tipo: c.id === "noce" || c.id === "rovere" ? "parquet_legno" : c.id === "marmo" ? "marmo" : c.id === "pietra" ? "pietra_naturale" : c.id === "cotto" ? "cotto" : "gres_porcellanato", effetto_visivo: wood ? "legno" : c.id === "cemento" ? "cemento" : c.id === "marmo" ? "marmo" : c.id === "pietra" ? "pietra" : c.id === "cotto" ? "cotto" : "pietra", ...(wood ? { essenza_legno: c.id === "noce" ? "noce" : "rovere_naturale", larghezza_listello_mm: 180, lunghezza_listello_mm: 1200 } : {}), colore_nome: c.nome, colore_hex: c.colore === "#ffffff" ? (wood ? c.id === "noce" ? "#876548" : "#C4A882" : "#F2F0EA") : c.colore, pattern: "dritto", formato_piastrella: ["rovere", "noce"].includes(c.id) ? "18x120" : wood ? "20x120" : c.id === "cotto" ? "30x30" : "60x60", finitura: c.id === "marmo" ? "levigato" : "opaco", fuga_larghezza_mm: 2, fuga_colore: "tono_su_tono", battiscopa_azione: "mantieni" };
}
