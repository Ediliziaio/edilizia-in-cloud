import { supabase } from "@/integrations/supabase/client";
import type { FonteUrbanistica } from "../../../shared/planimetrie/urbanistica.ts";
import comuni from "./comuniUrbanistica.json";
import {
  ELENCO_COMUNI_ISTAT, GEOROMA, GEOROMA_CATALOGO, IDROGEO, riferimentoCatastale,
  INDICE_PA, NTA_ROMA_COORDINATE, PGT_LOMBARDIA, PRG_ROMA, PTPR_LAZIO, RICERCA_RNDT, ROMA_ISTAT, SITAP,
  TESTO_UNICO_EDILIZIA, VINCOLI_LOMBARDIA,
} from "./riferimentiUrbanistici";

export { ROMA_ISTAT, GEOPORTALE_CATASTALE, PRG_ROMA } from "./riferimentiUrbanistici";
export const REGIONI_URBANISTICA = Object.keys(comuni).sort((a, b) => a.localeCompare(b, "it"));
export const oggiUrbanistica = () => new Date().toLocaleDateString("sv-SE",{timeZone:"Europe/Rome"});

// ISTAT per i codici e AgID/IndicePA per i siti degli enti (CC BY 4.0).
const normale = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("it")
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const COMUNI = Object.entries(comuni).flatMap(([regione, righe]) => righe.map(([codiceIstat, comune, provincia, codiceCatastale, sito]) => ({
  codiceIstat, comune, provincia, codiceCatastale, regione, sito,
  // Anche senza l'articolo eliso («Aquila» per «L'Aquila») e tutto attaccato
  // («santangelo» per «Sant'Angelo»): 23/11/2026.
  nomi: [...new Set(comune.split("/").map(normale).flatMap((n) => [n, n.replace(/^(?:l|la|lo|le|il|i) /, ""), n.replace(/ /g, "")]))],
  ricerca: normale(`${comune} ${provincia} ${regione} ${codiceIstat} ${codiceCatastale}`),
})));
const perCodice = new Map(COMUNI.map(c => [c.codiceIstat, c]));
export type ComuneUrbanistica = typeof COMUNI[number];
export function comuneNelRegistro(codiceIstat: string) {
  return perCodice.get(codiceIstat);
}
export function corrispondeNomeComune(c: ComuneUrbanistica, nome: string) {
  const chiave = normale(nome);
  return c.nomi.includes(chiave) || normale(c.comune) === chiave
    || normale(`${c.comune} (${c.provincia})`) === chiave
    || (c.codiceIstat === ROMA_ISTAT && chiave === "roma capitale");
}
export function suggerisciComuniUrbanistica(testo: string): ComuneUrbanistica[] {
  const trovati = cercaComuni(testo);
  if (trovati.length) return trovati;
  // Un indirizzo incollato («Via Garibaldi 26, 21100 Varese (VA)») o un nome con il CAP:
  // si riprova con l'ultimo pezzo dopo la virgola, senza numeri né sigla della provincia.
  const ultimo = (testo.split(",").pop() ?? "").replace(/\([A-Za-z]{2}\)/g, " ").replace(/\d+/g, " ").trim();
  return ultimo && normale(ultimo) !== normale(testo) ? cercaComuni(ultimo) : [];
}

function cercaComuni(testo: string): ComuneUrbanistica[] {
  const chiave = normale(testo);
  if (chiave.length < 2) return [];
  const parole = chiave.split(" ");
  const attaccata = chiave.replace(/ /g, "");
  const esatti: ComuneUrbanistica[] = [];
  const prefissi: ComuneUrbanistica[] = [];
  const altri: ComuneUrbanistica[] = [];
  for (const c of COMUNI) {
    if (c.codiceIstat === chiave || c.codiceCatastale?.toLowerCase() === chiave
      || c.nomi.some(n => n === chiave || n === attaccata || n + " " + c.provincia?.toLowerCase() === chiave)) esatti.push(c);
    else if (c.nomi.some(n => n.startsWith(chiave) || (attaccata.length > 3 && n.startsWith(attaccata)))) prefissi.push(c);
    else if (parole.every(p => c.ricerca.includes(p))) altri.push(c);
  }
  return [...esatti, ...prefissi, ...altri].slice(0, 16);
}

/** Il registro offre i punti di accesso ufficiali. Sono distinti dagli atti puntuali verificati. */
export function fontiNelRegistro(regione: string, codiceIstat: string, data = oggiUrbanistica()): FonteUrbanistica[] {
  const fonte = (id: string, ente: string, titolo: string, url: string, tipo: FonteUrbanistica["tipo"] = "archivio"): FonteUrbanistica =>
    ({ id, ente, titolo, url, tipo, stato:"da_verificare", acquisitaIl:data });
  const comune = comuneNelRegistro(codiceIstat);
  const comunali = comune?.sito
    ? [fonte("sito-comunale", `Comune di ${comune.comune}`, `Sito istituzionale · ${comune.comune}`, comune.sito)]
    : [fonte("indicepa", "AgID", "IndicePA · Cerca il Comune", INDICE_PA)];
  const catasto = riferimentoCatastale(codiceIstat);
  const nazionali = [
    fonte("catasto",comune?.provincia === "BZ" || comune?.provincia === "TN" ? "Provincia autonoma" : "Agenzia delle Entrate",catasto.nome,catasto.url),
    fonte("tue","Normattiva","Testo unico dell’edilizia · DPR 380/2001",TESTO_UNICO_EDILIZIA),
    fonte("sitap","Ministero della Cultura","SITAP · Vincoli paesaggistici",SITAP),
    fonte("idrogeo","ISPRA","IdroGEO · Frane e alluvioni",IDROGEO),
    fonte("istat","ISTAT","Elenco e codici dei Comuni",ELENCO_COMUNI_ISTAT),
    fonte("rndt","AgID","RNDT · Cerca piani e tavole territoriali",RICERCA_RNDT),
  ];
  if (regione === "Lombardia") {
    return [
      fonte("pgtweb","Regione Lombardia","PGTWEB / MULTIPLAN · PGT e varianti","https://www.regione.lombardia.it/ambiente-e-territorio/pianificazione-territoriale/pianificazione-comunale-e-provinciale/pgtweb-archivio-documentale-pgt"),
      fonte("burl","Regione Lombardia","BURL · Avvisi di pubblicazione","https://www.consultazioniburl.servizirl.it/","bollettino"),
      fonte("geo-lombardia","Regione Lombardia","Tavola delle previsioni di piano · Geoportale",PGT_LOMBARDIA),
      fonte("siba","Regione Lombardia","Vincoli e tutele · Geoportale",VINCOLI_LOMBARDIA),
      ...(codiceIstat === "015146" ? [
        fonte("comune-015146","Comune di Milano","PGT Milano · Piano vigente e aggiornamenti","https://pgt.comune.milano.it/"),
        fonte("regolamento-milano","Comune di Milano","Regolamento edilizio · Testo e aggiornamenti","https://www.comune.milano.it/argomenti/edilizia/regolamento-edilizio","norme"),
      ] : []),
      ...comunali,
      ...nazionali,
    ];
  }
  if (codiceIstat === ROMA_ISTAT) return [
    fonte("prg-roma","Roma Capitale","PRG di Roma · Norme tecniche, tavole e aggiornamenti",PRG_ROMA),
    fonte("nta-roma","Roma Capitale","PRG di Roma · Norme tecniche di attuazione, testo coordinato",NTA_ROMA_COORDINATE,"norme"),
    fonte("geo-roma","Roma Capitale","GeoRoma · Tavole del PRG e Carta per la Qualità",GEOROMA),
    fonte("catalogo-roma","Roma Capitale","GeoRoma · Catalogo degli strati consultabili",GEOROMA_CATALOGO),
    fonte("regolamento-roma","Roma Capitale","Regolamento edilizio · Deliberazione 90/2026","https://www.comune.roma.it/web-resources/cms/documents/Assemblea_Capitolina_90_2026_1.pdf"),
    fonte("ptpr-lazio","Regione Lazio","PTPR Lazio · Tavole B dei beni paesaggistici e rettifiche",PTPR_LAZIO),
    ...comunali,
    ...nazionali,
  ];
  if (regione === "Lazio") return [...comunali,fonte("ptpr-lazio","Regione Lazio","PTPR Lazio · Tavole B dei beni paesaggistici e rettifiche",PTPR_LAZIO),...nazionali];
  if (regione === "Veneto") return [...comunali,fonte("geo-veneto","Regione Veneto","Geoportale del Veneto","https://idt2.regione.veneto.it/"),...nazionali];
  if (regione === "Emilia-Romagna") return [...comunali,fonte("moka-pug","Regione Emilia-Romagna","Moka PUG / SIATER","https://www.regione.emilia-romagna.it/siater/elenco-applicazioni/applicazione-pug-piani-urbanistici-generali"),...nazionali];
  return [...comunali,...nazionali];
}

export async function caricaElaboratoUrbanistico(companyId: string, piantaId: string, file: File) {
  if (file.type !== "application/pdf" || file.size > 15 * 1024 * 1024 || !file.size) throw new Error("Scegli un PDF di massimo 15 MB.");
  const percorso = `${companyId}/urbanistica/${piantaId}/${crypto.randomUUID()}.pdf`;
  const { error } = await supabase.storage.from("planimetrie").upload(percorso,file,{contentType:"application/pdf",upsert:false});
  if (error) throw new Error("Il PDF non è stato caricato.");
  return { percorso, nome:file.name.slice(0,240) };
}

export async function eliminaElaboratiNonSalvati(percorsi: string[]) {
  if (percorsi.length) await supabase.storage.from("planimetrie").remove(percorsi);
}

export async function apriElaboratoUrbanistico(companyId: string, piantaId: string, percorso: string) {
  if (!percorso.startsWith(`${companyId}/urbanistica/${piantaId}/`)) throw new Error("Allegato non disponibile per questa planimetria.");
  const { data,error } = await supabase.storage.from("planimetrie").createSignedUrl(percorso,600);
  if (error || !data?.signedUrl) throw new Error("L’elaborato non è disponibile.");
  return data.signedUrl;
}
