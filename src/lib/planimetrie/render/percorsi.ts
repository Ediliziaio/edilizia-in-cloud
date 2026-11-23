/**
 * Planimetrie è uno spazio autonomo, collegato ai render delle sue stanze.
 *
 * Un solo posto per gli ingressi che portano ad altre fasi: «Disegna» apre l'editor
 * (fase 2, `RenderPlanimetriaNuova` e `RenderPlanimetriaModifica`), «Carica PDF o foto» e
 * «Descrivi a parole» la generazione con l'AI (fase 3) e poi l'editor.
 */
import { isRenderDetailPath, renderArchiveReturn } from "@/lib/render/renderNavigation";
export type ModoNuovaPianta = "disegno" | "documento" | "testo" | "sopralluogo";

const BASE = "/azienda/planimetrie";
const BASE_LEGACY = "/azienda/render/planimetrie";

export function ritornoProgettoValido(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/azienda/")) return null;
  try {
    const u = new URL(value, "https://app.invalid");
    const uuid = "[0-9a-fA-F-]{36}";
    const scheda = new RegExp(`^/azienda/(?:clienti|ordini|sopralluoghi)/${uuid}$|^/azienda/marketing/(?:preventivi|contatti)/${uuid}$`).test(u.pathname);
    const computo = u.pathname === "/azienda/marketing/preventivi/computo" && /^[0-9a-f-]{36}$/i.test(u.searchParams.get("bozza") ?? "") && u.searchParams.get("esistente") === "1";
    const simulatore = u.pathname === "/azienda/ordini/simulatore" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(u.searchParams.get("ipotesi") ?? "");
    return u.origin === "https://app.invalid" && (scheda || computo || simulatore || isRenderDetailPath(u.pathname) || u.pathname === BASE || !!renderArchiveReturn(value, "")) ? `${u.pathname}${u.search}${u.hash}` : null;
  } catch { return null; }
}

export function percorsoProgettoAssociato(id: string, torna?: string, fascicolo = false): string {
  const q = new URLSearchParams();
  const ritorno = ritornoProgettoValido(torna);
  if (ritorno) q.set("torna", ritorno);
  if (fascicolo) q.set("esporta", "fascicolo");
  return `${BASE}/${id}${q.size ? `?${q}` : ""}`;
}

export function percorsoVariantePlanimetria(
  fonte: {planimetriaId:string;versione:number;varianteId:string},
  opzioni: {livello?:string;studio?:boolean;torna?:string;fascicolo?:"urbanistica"|"pratiche"|"verifiche"|"tavole";unita?:string;esporta?:"pdf"} = {},
): string {
  const q = new URLSearchParams({versione:String(fonte.versione),ambito:fonte.varianteId ? `progetto:${fonte.varianteId}` : "fatto"});
  if (opzioni.livello) q.set("livello",opzioni.livello);
  if (opzioni.studio) q.set("studio","1");
  if (opzioni.fascicolo) q.set("fascicolo",opzioni.fascicolo);
  if (opzioni.unita) q.set("unita",opzioni.unita);
  if (opzioni.esporta) q.set("esporta",opzioni.esporta);
  const torna = ritornoProgettoValido(opzioni.torna);
  if (torna) q.set("torna",torna);
  return `${BASE}/${fonte.planimetriaId}?${q}`;
}

/** Mantiene preferiti, PDF e link già inviati, compresi piano, variante e stanza. */
export function percorsoPlanimetriaAttuale(pathname: string, search = "", hash = ""): string {
  const path = pathname === BASE_LEGACY || pathname.startsWith(`${BASE_LEGACY}/`) ? BASE + pathname.slice(BASE_LEGACY.length) : BASE;
  return `${path}${search}${hash}`;
}

function contestoPianta(livello?: string, ambito?: string, muro?: string) {
  const q = new URLSearchParams();
  if (livello) q.set("livello", livello);
  if (ambito?.startsWith("progetto:")) q.set("ambito", ambito);
  if (muro) q.set("muro", muro);
  return q.size ? `?${q}` : "";
}

export const percorsiPlanimetrie = {
  elenco: BASE,
  pianta: (id: string, livello?: string, ambito?: string) => `${BASE}/${id}${contestoPianta(livello, ambito)}`,
  /** Editor della fase 2 sulla pianta già creata. */
  modifica: (id: string, livello?: string, ambito?: string, muro?: string) => `${BASE}/${id}/modifica${contestoPianta(livello, ambito, muro)}`,
  /** Apre la scelta dell'origine o il percorso compatibile già selezionato. */
  nuova: (modo?: ModoNuovaPianta, per?: { commessa: string; titolo: string; torna: string }) => {
    const q = new URLSearchParams();
    if (modo) q.set("da", modo);
    if (per) { q.set("commessa", per.commessa); q.set("titolo", per.titolo); q.set("torna", per.torna); }
    return `${BASE}/nuova${q.size ? `?${q}` : ""}`;
  },
  dalSopralluogo: (id: string, orderId?: string | null) => {
    const q = new URLSearchParams({ da: "sopralluogo", sopralluogo: id, torna: `/azienda/sopralluoghi/${id}` });
    if (orderId) q.set("commessa", orderId);
    return `${BASE}/nuova?${q}`;
  },
  /** Render di una stanza della pianta. */
  renderStanza: (id: string, localeId: string, scelta: { livelloId: string; ambito: string; materialiAmbito?: string; versione?: number; torna?: string | null }) => {
    const q = new URLSearchParams({livello:scelta.livelloId,ambito:scelta.ambito});
    if (scelta.materialiAmbito && scelta.materialiAmbito !== scelta.ambito) q.set("materiali_ambito",scelta.materialiAmbito);
    if (scelta.versione) q.set("versione",String(scelta.versione));
    const torna = ritornoProgettoValido(scelta.torna);
    if (torna) q.set("torna",torna);
    return `${BASE}/${id}/stanza/${encodeURIComponent(localeId)}?${q}`;
  },
};
