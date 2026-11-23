/**
 * Lingua dell'area operai: contenitore, scelta salvata sul telefono, `t()` per tradurre.
 *
 * `t("Invia rapportino")` → la frase nella lingua scelta, o l'italiano se manca. Con valori:
 * `t("Rapportino del {data}", { data })`. Le traduzioni si caricano solo per la lingua scelta (import dinamico):
 * chi usa l'italiano non scarica niente in più.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LINGUE, linguaDa, type CodiceLingua, type Lingua } from "./lingue";

export type Dizionario = Readonly<Record<string, string>>;
type Valori = Readonly<Record<string, string | number>>;

const CARICA: Record<Exclude<CodiceLingua, "it">, () => Promise<{ default: Dizionario }>> = {
  ro: () => import("./dizionari/ro"),
  sq: () => import("./dizionari/sq"),
  "ar-MA": () => import("./dizionari/arMA"),
  "ar-EG": () => import("./dizionari/arEG"),
  de: () => import("./dizionari/de"),
  fr: () => import("./dizionari/fr"),
  en: () => import("./dizionari/en"),
  es: () => import("./dizionari/es"),
  "es-AR": () => import("./dizionari/esAR"),
  "es-PE": () => import("./dizionari/esPE"),
};

const CHIAVE = "campo-lingua";
/** La scelta salvata su questo telefono. Senza scelta si parte in italiano (regola del founder, 23/11/2026). */
const leggiScelta = (): CodiceLingua | null => {
  try { return linguaDa(localStorage.getItem(CHIAVE))?.codice ?? null; } catch { return null; }
};

export function sostituisci(testo: string, valori?: Valori): string {
  if (!valori) return testo;
  return testo.replace(/\{(\w+)\}/g, (tutto, nome: string) => (nome in valori ? String(valori[nome]) : tutto));
}

export function traduci(dizionario: Dizionario | null, testo: string, valori?: Valori): string {
  return sostituisci(dizionario?.[testo] ?? testo, valori);
}

interface StatoLingua {
  lingua: Lingua;
  scelta: boolean;
  t: (testo: string, valori?: Valori) => string;
  scegli: (codice: CodiceLingua) => void;
}

const ITALIANO = LINGUE[0];
const Contesto = createContext<StatoLingua>({
  lingua: ITALIANO,
  scelta: true,
  t: (testo, valori) => sostituisci(testo, valori),
  scegli: () => {},
});

export function LinguaCampoProvider({ children }: { children: ReactNode }) {
  const [codice, setCodice] = useState<CodiceLingua>(() => leggiScelta() ?? "it");
  const [scelta, setScelta] = useState(() => leggiScelta() !== null);
  const [dizionario, setDizionario] = useState<{ codice: CodiceLingua; voci: Dizionario } | null>(null);

  useEffect(() => {
    if (codice === "it") return;
    let attivo = true;
    void CARICA[codice]().then(m => { if (attivo) setDizionario({ codice, voci: m.default }); }).catch(() => { /* resta l'italiano */ });
    return () => { attivo = false; };
  }, [codice]);

  const lingua = linguaDa(codice) ?? ITALIANO;
  useEffect(() => {
    const radice = document.documentElement;
    const prima = { lang: radice.lang, dir: radice.dir };
    radice.lang = lingua.locale.split("-")[0];
    radice.dir = lingua.rtl ? "rtl" : "ltr";
    return () => { radice.lang = prima.lang; radice.dir = prima.dir; };
  }, [lingua]);

  const voci = codice !== "it" && dizionario?.codice === codice ? dizionario.voci : null;
  const t = useCallback((testo: string, valori?: Valori) => traduci(voci, testo, valori), [voci]);
  const scegli = useCallback((nuovo: CodiceLingua) => {
    try { localStorage.setItem(CHIAVE, nuovo); } catch { /* resta per questa sessione */ }
    setScelta(true);
    setCodice(nuovo);
  }, []);
  const valore = useMemo(() => ({ lingua, scelta, t, scegli }), [lingua, scelta, t, scegli]);
  return <Contesto.Provider value={valore}>{children}</Contesto.Provider>;
}

export const useLinguaCampo = () => useContext(Contesto);
/** Solo la funzione di traduzione. Fuori dal contenitore restituisce l'italiano. */
export const useT = () => useContext(Contesto).t;
