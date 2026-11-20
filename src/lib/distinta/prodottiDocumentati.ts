import type { VoceComputo } from "./generaDistinta";
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
/** Prodotti già nominati nel computo. Nessuna resa, accessorio o dimensione viene aggiunta. */
export function prodottoDaVoceDocumentata(v: VoceComputo): { nome: string; nota: string } | null {
  const t = norm(v.descrizione_breve).replace(/^fornitura(?: e (?:posa|installazione|collocazione)(?: in opera)?)?(?: in opera)?(?: di)?\s+/, "");
  const u = (v.unita_misura ?? "").toLowerCase().replace(/\.$/, "");
  if (!/^(?:cad|cadauno|pz|n|nr|m|ml|mq|m2|m²|mc|m3|m³|kg|ton|t|q|100\s*kg)$/.test(u)) return null;
  const pezzi = /^(?:cad|cadauno|pz|n|nr)$/.test(u);
  if (pezzi && (!Number.isInteger(v.quantita) || Number(v.quantita) <= 0)) return null;
  const radici = /^(?:discendent|canali di gronda|bocchettone sifonato|zoccolino battiscopa|struttura metallica di sostegno|invetrat|cristallo float|vetro stratificat|vetrata isolante|soglie lisce|controtelaio|masselli di calcestruzzo|acciaio ad alta duttilita|carpenteria metallica|gruppo miscelatore|corrimano|bollitore|termoaccumulatore|defangatore|filtro (?:dosatore|meccanico)|riduttore di pressione|elettropompa|pozzetto (?:in cemento|in resina)|circolatore|dosatore idrodinamico|fermo elettromagnetico|sirena elettronica|corda flessibile|puntazza|antenna di ricezione|contatore in corrente|contattore|temporizzatore|vaschetta di cacciata|sedile con coperchio|piletta|sifone|specchi|presa a tenuta stagna|centralino pre.?cablato)\b/;
  const prodottoInTesta = radici.test(t);
  const stradale = /^(?:fondazione stradale in misto cementato|strato di fondazione in misto granulare|formazione di massicciata stradale|conglomerato bituminoso|tout.?venant bitumato|pavimentazione in asfalto|cordoli in cls|cordoni per marciapiedi|pavimentazione in masselli autobloccanti|pavimentazioni in elementi di calcestruzzo|parapetti ferro tubolari|guard rail stradale|accessi carrai in pietra|ferri per c\.?a\.?|chiusini|tubo corrugato flessibile|tubi o manufatti per il drenaggio|materiale per strato anticapillare)\b/.test(t);
  const produttoreConCodice = pezzi && !!(v.codice_voce || v.codice_prezzario || v.codice_tariffa)
    && !/^(?:impianto|circuito|sistema|punto|allaccio|collegamento|posa|montaggio|manodopera|installazione)/.test(t)
    && /\b(?:bollitore|termoaccumulatore|sonda temperatura|valvola deviatrice|mensole per montaggio|pompa di calore)\b/.test(t);
  const apparecchioModulare = pezzi && /^apparecchi modulari da inserire su quadro elettrico/.test(t)
    && /interruttore|sezionatore|gemma luminosa|rele/.test(t);
  const accessorioDefinito = pezzi && /^accessori per centrali/.test(t) && /scheda di espansione/.test(t);
  if (prodottoInTesta || stradale || produttoreConCodice || apparecchioModulare || accessorioDefinito) {
    return { nome: v.descrizione_breve.trim().split(/\s+(?:compres[oaie]|comprensiv[oaie])\b/i)[0].slice(0, 260),
      nota: "Prodotto dal computo: quantità nell'unità indicata, senza aggiungere accessori. Modello, formato e compatibilità da confermare prima dell'ordine." };
  }
  if (/^strato di fondazione in misto cementato/.test(t) && /^(mc|m3|m³)$/.test(u)) return { nome: "Misto cementato per strato di fondazione", nota: "Prodotto dal computo: volume in opera; miscela, fornitura e conversione nell'unità commerciale da confermare." };
  if (/^strato di zavorramento/.test(t) && /ghiaia/.test(t) && /^(mc|m3|m³)$/.test(u)) return { nome: "Ghiaia per zavorramento", nota: "Prodotto dal computo: volume documentato, senza inventare densità o peso da acquistare." };
  return null;
}
