/**
 * Lingua dell'area operai: contenitore, scelta della persona, `t()` per tradurre, formati di date e numeri.
 *
 * `t("Invia rapportino")` → la frase nella lingua scelta, o l'italiano se manca. Con valori:
 * `t("Rapportino del {data}", { data })`. Le traduzioni si caricano solo per la lingua scelta (import dinamico):
 * chi usa l'italiano non scarica niente in più.
 *
 * Dove sta la scelta (piano 2026-11-23-lingua-piattaforma): sul PROFILO (`profiles.lingua`, vale su ogni
 * dispositivo), con una copia su questo dispositivo per partire subito e lavorare senza rete. Regole in
 * `sceltaLingua.ts`. Senza scelta si parte in italiano, mai dalla lingua del telefono (regola del founder).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Locale } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { LINGUE, linguaDa, type CodiceLingua, type Lingua } from "./lingue";
import { decidiLingua, leggiSceltaDispositivo, scriviSceltaDispositivo, type ProfiloLingua } from "./sceltaLingua";
import { caricaLocaleDateFns, DATE_FNS_ITALIANO, formatiPer, localeIntl, type Formati } from "./formati";
// Arabo da destra a sinistra: margini e frecce girati solo sotto [dir="rtl"] (vedi il file).
import "./rtlCampo.css";

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

/**
 * Mette i valori al loro posto. `isola` (lingue da destra a sinistra): ogni valore è chiuso tra i segni
 * invisibili di isolamento (U+2068 … U+2069), così «7h 30» o «ORD-2026-001» dentro una frase araba restano
 * interi e nel loro verso, invece di diventare «30 7h».
 */
export function sostituisci(testo: string, valori?: Valori, isola = false): string {
  if (!valori) return testo;
  return testo.replace(/\{(\w+)\}/g, (tutto, nome: string) =>
    nome in valori ? (isola ? `\u2068${String(valori[nome])}\u2069` : String(valori[nome])) : tutto);
}

export function traduci(dizionario: Dizionario | null, testo: string, valori?: Valori, isola = false): string {
  return sostituisci(dizionario?.[testo] ?? testo, valori, isola);
}

interface StatoLingua {
  lingua: Lingua;
  /** La persona ha scelto una lingua (sul profilo o su questo dispositivo). */
  scelta: boolean;
  t: (testo: string, valori?: Valori) => string;
  scegli: (codice: CodiceLingua) => void;
  /** Date, ore, numeri, euro nella lingua scelta. */
  formati: Formati;
  /** Calendario di date-fns della lingua (l'italiano finché l'altro non è arrivato). */
  localeDateFns: Locale;
}

const ITALIANO = LINGUE[0];
const FORMATI_ITALIANI = formatiPer(ITALIANO);
const Contesto = createContext<StatoLingua>({
  lingua: ITALIANO,
  scelta: true,
  t: (testo, valori) => sostituisci(testo, valori),
  scegli: () => {},
  formati: FORMATI_ITALIANI,
  localeDateFns: DATE_FNS_ITALIANO,
});

/**
 * La lingua attuale per chi formatta date e numeri FUORI da un hook (funzioni di modulo, righe lunghe):
 * `format(d, "d MMM", { locale: dateFnsCampo() })`, `n.toLocaleString(intlCampo())`.
 * Si aggiorna quando la lingua cambia, prima che le schermate si ridisegnino: chi la legge mentre disegna vede
 * sempre quella giusta. Fuori dall'area operai resta l'italiano.
 */
const attuale: { codice: CodiceLingua; intl: string; dateFns: Locale } = (() => {
  const l = linguaDa(leggiSceltaDispositivo()?.codice) ?? ITALIANO;
  return { codice: l.codice, intl: localeIntl(l), dateFns: DATE_FNS_ITALIANO };
})();
const calendariCaricati = new Map<CodiceLingua, Locale>([["it", DATE_FNS_ITALIANO]]);
function aggiornaAttuale(codice: CodiceLingua) {
  const l = linguaDa(codice) ?? ITALIANO;
  attuale.codice = l.codice;
  attuale.intl = localeIntl(l);
  attuale.dateFns = calendariCaricati.get(l.codice) ?? DATE_FNS_ITALIANO;
}
/** Calendario di date-fns della lingua dell'operaio (italiano finché quello giusto non è arrivato). */
export const dateFnsCampo = (): Locale => attuale.dateFns;
/** Codice Intl della lingua dell'operaio (con cifre 0–9 per l'arabo), per toLocaleString / Intl. */
export const intlCampo = (): string => attuale.intl;

async function salvaSulProfilo(idProfilo: string, codice: CodiceLingua): Promise<boolean> {
  try {
    const { error } = await supabase.from("profiles").update({ lingua: codice }).eq("id", idProfilo);
    return !error;
  } catch {
    return false;
  }
}

export function LinguaCampoProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const profilo = (profile as ProfiloLingua | null) ?? null;
  const idProfilo = profilo?.id ?? null;
  const linguaProfilo = profilo?.lingua ?? null;
  const aggiornatoProfilo = profilo?.updated_at ?? null;

  /** Cambia a ogni scelta o salvataggio: fa ricalcolare la decisione (la scelta sul dispositivo non è uno stato React). */
  const [giro, setGiro] = useState(0);
  const [dizionario, setDizionario] = useState<{ codice: CodiceLingua; voci: Dizionario } | null>(null);
  const [calendario, setCalendario] = useState<{ codice: CodiceLingua; locale: Locale } | null>(null);
  const inSalvataggio = useRef<string | null>(null);

  // Profilo ↔ dispositivo: quale lingua mostrare. Calcolata qui, non copiata in uno stato: cambia nello
  // stesso disegno in cui cambiano profilo o scelta.
  const decisione = useMemo(() => {
    void giro;
    const profiloOra: ProfiloLingua | null = idProfilo ? { id: idProfilo, lingua: linguaProfilo, updated_at: aggiornatoProfilo } : null;
    const locale = leggiSceltaDispositivo();
    const d = decidiLingua(profiloOra, locale);
    // Le funzioni di modulo (dateFnsCampo/intlCampo) devono essere giuste PRIMA che i figli si disegnino.
    aggiornaAttuale(d.codice);
    return { ...d, scelta: Boolean(linguaProfilo) || locale !== null };
  }, [idProfilo, linguaProfilo, aggiornatoProfilo, giro]);
  const { codice, scelta } = decisione;

  // Effetti della decisione: copia sul dispositivo e salvataggio sul profilo (riprovato quando torna la rete).
  useEffect(() => {
    if (decisione.dispositivo) scriviSceltaDispositivo(decisione.dispositivo);
    const daSalvare = decisione.daSalvare;
    if (!idProfilo || !daSalvare) return;
    const chiave = `${idProfilo}:${daSalvare}:${giro}`;
    if (inSalvataggio.current === chiave) return;
    inSalvataggio.current = chiave;
    let attivo = true;
    const prova = () => {
      void salvaSulProfilo(idProfilo, daSalvare).then(ok => {
        if (!ok || !attivo) return;
        scriviSceltaDispositivo({ codice: daSalvare, utente: idProfilo, quando: new Date().toISOString(), salvata: true });
        setGiro(g => g + 1);
      });
    };
    prova();
    window.addEventListener("online", prova);
    return () => { attivo = false; window.removeEventListener("online", prova); };
  }, [decisione, idProfilo, giro]);

  useEffect(() => {
    if (codice === "it") return;
    let attivo = true;
    void CARICA[codice]().then(m => { if (attivo) setDizionario({ codice, voci: m.default }); }).catch(() => { /* resta l'italiano */ });
    void caricaLocaleDateFns(codice).then(locale => {
      calendariCaricati.set(codice, locale);
      if (!attivo) return;
      if (attuale.codice === codice) attuale.dateFns = locale;
      setCalendario({ codice, locale });
    }).catch(() => { /* resta l'italiano */ });
    return () => { attivo = false; };
  }, [codice]);

  // Uscendo dall'area operai le funzioni di modulo tornano all'italiano (e ritornano giuste se si rientra).
  useEffect(() => {
    aggiornaAttuale(codice);
    return () => aggiornaAttuale("it");
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
  const rtl = Boolean(lingua.rtl);
  const t = useCallback((testo: string, valori?: Valori) => {
    // Solo in sviluppo: annota le frasi senza traduzione (anche quelle passate come variabile, che i test non vedono).
    // In console: [...window.__frasiSenzaTraduzione]. In produzione questo ramo non esiste.
    if (import.meta.env.DEV && voci && testo && !(testo in voci)) {
      const g = globalThis as { __frasiSenzaTraduzione?: Set<string> };
      const insieme = (g.__frasiSenzaTraduzione ??= new Set());
      if (!insieme.has(testo)) {
        insieme.add(testo);
        // Anche nella memoria del browser, così si accumulano pagina dopo pagina (chiave «sviluppo-frasi-senza-traduzione»).
        try {
          const prima = JSON.parse(localStorage.getItem("sviluppo-frasi-senza-traduzione") ?? "[]") as string[];
          if (!prima.includes(testo)) localStorage.setItem("sviluppo-frasi-senza-traduzione", JSON.stringify([...prima, testo]));
        } catch { /* niente: è solo un aiuto in sviluppo */ }
      }
    }
    return traduci(voci, testo, valori, rtl);
  }, [voci, rtl]);
  const scegli = useCallback((nuovo: CodiceLingua) => {
    // Subito sul dispositivo (vale anche senza rete); la decisione si ricalcola e porta la scelta sul profilo.
    scriviSceltaDispositivo({ codice: nuovo, utente: idProfilo, quando: new Date().toISOString(), salvata: false });
    setGiro(g => g + 1);
  }, [idProfilo]);
  const formati = useMemo(() => (codice === "it" ? FORMATI_ITALIANI : formatiPer(lingua)), [codice, lingua]);
  const localeDateFns = codice !== "it" && calendario?.codice === codice ? calendario.locale : DATE_FNS_ITALIANO;
  const valore = useMemo(
    () => ({ lingua, scelta, t, scegli, formati, localeDateFns }),
    [lingua, scelta, t, scegli, formati, localeDateFns],
  );
  return <Contesto.Provider value={valore}>{children}</Contesto.Provider>;
}

export const useLinguaCampo = () => useContext(Contesto);
/** Solo la funzione di traduzione. Fuori dal contenitore restituisce l'italiano. */
export const useT = () => useContext(Contesto).t;
/** Date, ore, numeri ed euro nella lingua dell'operaio. Fuori dal contenitore: italiano. */
export const useFormatiCampo = () => useContext(Contesto).formati;
