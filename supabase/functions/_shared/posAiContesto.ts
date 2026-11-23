import { lavorazioniDaRispostaAi } from "./posAi.ts";
import type { ComputoPerPos, FasePerPos, PscPerPos } from "./posAiFonti.ts";
import { normalizzaFontiSchedaPos } from "./posFontiScheda.ts";
import { applicaValutazione, programmaDemolizioniVuoto, titoloDemolizionePos, type Lavorazione } from "./posModello.ts";
import { rischioTecnicoVuoto, tecnicaPosVuota } from "./posTecnica.ts";
import { suggerisciSchedePos, testoRicercaSchedePos, VERSIONE_SCHEDE_POS } from "./posSchedeStandard.ts";

const MAX_VOCI_PROMPT = 200;
const MAX_CARATTERI_PSC_PROMPT = 18_000;
const oggetto = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const lista = (v: unknown, max: number): unknown[] => Array.isArray(v) ? v.slice(0, max) : [];
const testo = (v: unknown, max: number) => typeof v === "string" ? v.trim().slice(0, max) : "";
const appiattisci = (v: string) => v.normalize("NFC").replace(/\s+/g, " ").trim();

export function capitoliComputoPos(computo: ComputoPerPos, fasi: FasePerPos[]) {
  const conteggi = new Map<string, number>();
  for (const voce of computo.voci) conteggi.set(voce.capitolo, (conteggi.get(voce.capitolo) ?? 0) + 1);
  return [...conteggi].map(([nome, voci]) => {
    const chiave = testoRicercaSchedePos(nome);
    const corrispondenze = chiave ? fasi.filter(f => testoRicercaSchedePos(f.name) === chiave) : [];
    return { nome, voci, fase: corrispondenze.length === 1 ? corrispondenze[0] : null };
  });
}

export function preparaContestoAiPos(dati: {
  fasi: FasePerPos[];
  ambito: string;
  descrizione: string;
  computo: ComputoPerPos | null;
  psc: PscPerPos | null;
  limitaAlPerimetro: boolean;
  capitoli?: string[];
}) {
  const perimetro = [dati.ambito, ...dati.fasi.map(f => f.name)].join(" ");
  const compatibili = new Set(suggerisciSchedePos(perimetro).map(s => s.id));
  const ricerca = testoRicercaSchedePos(perimetro);
  const voci = dati.computo?.voci.filter(v => {
    if (dati.capitoli?.length) return dati.capitoli.includes(v.capitolo);
    if (!dati.limitaAlPerimetro) return true;
    const voce = v.titolo + " " + v.capitolo;
    const codiciEspliciti = testoRicercaSchedePos(v.codice);
    const capitolo = testoRicercaSchedePos(v.capitolo);
    return (codiciEspliciti.length >= 4 && (" " + ricerca + " ").includes(" " + codiciEspliciti + " "))
      || (capitolo.length > 4 && ricerca.includes(capitolo))
      || suggerisciSchedePos(voce).some(s => compatibili.has(s.id));
  }) ?? [];
  const avvisi: string[] = [];
  if (voci.length > MAX_VOCI_PROMPT) avvisi.push(`Il computo ha ${voci.length} voci pertinenti. La proposta usa le prime ${MAX_VOCI_PROMPT}; scegli un gruppo di fasi per approfondire.`);
  if (dati.limitaAlPerimetro && dati.computo && !voci.length) avvisi.push("Nessuna voce del computo abbinata al perimetro indicato.");
  // Una voce che il perimetro non aggancia per parole chiave resta fuori dalla proposta: va detto, e con il nome.
  // Senza questo avviso «Movimentazione dei materiali al piano» spariva accanto alle fasi dei serramenti (23/11/2026).
  const vociNonAbbinate = dati.limitaAlPerimetro && !dati.capitoli?.length && voci.length
    ? (dati.computo?.voci ?? []).filter(v => !voci.includes(v)) : [];
  if (vociNonAbbinate.length) {
    const nomi = vociNonAbbinate.slice(0, 5).map(v => `«${[v.codice, v.titolo.slice(0, 80)].filter(Boolean).join(" ")}»`).join(", ");
    const altre = vociNonAbbinate.length > 5 ? ` e altre ${vociNonAbbinate.length - 5}` : "";
    avvisi.push(vociNonAbbinate.length === 1
      ? `Una voce del computo non è abbinata alle fasi scelte e la proposta non l’ha considerata: ${nomi}. Se la esegue la tua impresa, aggiungi la sua fase al perimetro o scegli i capitoli del computo.`
      : `${vociNonAbbinate.length} voci del computo non sono abbinate alle fasi scelte e la proposta non le ha considerate: ${nomi}${altre}. Se le esegue la tua impresa, aggiungi le loro fasi al perimetro o scegli i capitoli del computo.`);
  }
  if (dati.computo?.stato === "bozza" && voci.length) avvisi.push("Il computo collegato è ancora in bozza: verifica voci e quantità.");
  const vociRidotte = voci.slice(0, MAX_VOCI_PROMPT);
  const schede = suggerisciSchedePos([
    perimetro, dati.descrizione,
    ...vociRidotte.map(v => v.capitolo + " " + v.titolo.slice(0, 100)),
  ].join(" "));
  const ricercaPsc = new Set(testoRicercaSchedePos([perimetro, ...schede.map(s => s.titolo)].join(" "))
    .split(" ").filter(k => k.length > 4));
  const paginePsc: NonNullable<PscPerPos["pagine"]> = [];
  let dimensionePsc = 0;
  const pagineOrdinate = (dati.psc?.pagine ?? []).map(p => {
    const contenuto = testoRicercaSchedePos(p.testo);
    const punti = [...ricercaPsc].filter(k => contenuto.includes(k)).length
      + (/interferenze|prescrizioni|coordinamento/.test(contenuto) ? 2 : 0);
    return { ...p, punti };
  }).sort((a, b) => (dati.psc?.letturaIntegrale ? 0 : Number(b.metodo === "ocr") - Number(a.metodo === "ocr")) || b.punti - a.punti || a.pagina - b.pagina);
  for (const p of pagineOrdinate) {
    if (dimensionePsc >= MAX_CARATTERI_PSC_PROMPT) break;
    const testoPagina = p.testo.slice(0, Math.min(5000, MAX_CARATTERI_PSC_PROMPT - dimensionePsc));
    paginePsc.push({ pagina: p.pagina, testo: testoPagina, ...(p.metodo ? { metodo: p.metodo } : {}) });
    dimensionePsc += testoPagina.length;
  }
  if (paginePsc.length < pagineOrdinate.length || pagineOrdinate.some(p => p.testo.length > 5000) ||
      dimensionePsc < pagineOrdinate.reduce((somma, p) => somma + p.testo.length, 0)) {
    avvisi.push(`La proposta usa estratti da ${paginePsc.length} pagine del PSC. Consulta l’originale per il riesame.`);
  }
  return {
    avvisi,
    fasi: dati.fasi,
    computo: dati.computo && vociRidotte.length ? { ...dati.computo, voci: vociRidotte } : null,
    psc: dati.psc && paginePsc.length ? { riferimento: dati.psc.riferimento, pagine: paginePsc } : null,
    schede,
  };
}

export type ContestoAiPos = ReturnType<typeof preparaContestoAiPos>;

export function applicaFontiProposteAiPos(elenco: unknown[], base: string, contesto: ContestoAiPos, opzioni: {
  perimetroEsplicito: boolean; inSubappalto: boolean; subappaltatori: string[];
  richiediVociComputo?: boolean;
}): Lavorazione[] {
  const voci = new Map(contesto.computo?.voci.map((v, i) => ["C" + (i + 1), v]));
  const pagine = new Map(contesto.psc?.pagine.map(p => [p.pagina, { testo: appiattisci(p.testo), metodo: p.metodo }]));
  const fasi = new Set(contesto.fasi.map(f => f.id));
  const esistenti = new Set<string>();
  return elenco.slice(0, 30).flatMap((raw, i) => {
    const o = oggetto(raw);
    const ids = new Set(lista(o.riferimenti_computo, 20));
    const riferimentiComputo = [...ids].flatMap(id => typeof id === "string" && voci.has(id) ? [voci.get(id)!] : []);
    if (opzioni.richiediVociComputo && !riferimentiComputo.length) return [];
    const [l] = lavorazioniDaRispostaAi([o], `${base}-${i}`);
    if (!l) return [];
    const fase = testo(o.fase_id, 64);
    if (opzioni.perimetroEsplicito && fasi.size && !fasi.has(fase)) return [];
    if (fasi.has(fase)) l.fase_id = fase;
    if (opzioni.inSubappalto || !opzioni.subappaltatori.includes(l.svolgimento_con)) {
      l.svolgimento = "diretto";
      l.svolgimento_con = "";
    }
    const intensita = testoRicercaSchedePos(l.titolo || l.descrizione);
    const chiave = (l.fase_id ?? "") + ":" + intensita;
    if (esistenti.has(chiave)) return [];
    esistenti.add(chiave);
    const standard = contesto.schede.find(s => s.id === o.standard_id)
      ?? suggerisciSchedePos(l.titolo).find(s => contesto.schede.includes(s));
    const estratti = lista(o.riferimenti_psc, 8).flatMap(v => {
      const r = oggetto(v);
      const p = typeof r.pagina === "number" ? r.pagina : 0;
      const frase = appiattisci(testo(r.testo, 450));
      const fonte = pagine.get(p);
      return frase.length >= 24 && fonte?.testo.includes(frase)
        ? [{ pagina: p, testo: frase, ...(fonte.metodo === "ocr" ? { metodo: "ocr", confermato: false } : {}) }] : [];
    });
    const domande = [...new Set([...(standard?.quesiti ?? []), ...lista(o.quesiti, 4).map(q => testo(q, 260)).filter(Boolean)])];
    const fonti = normalizzaFontiSchedaPos({
      ...(standard ? { standard: { id: standard.id, versione: VERSIONE_SCHEDE_POS } } : {}),
      ...(contesto.computo ? { computo: { id: contesto.computo.id, titolo: contesto.computo.titolo, voci: riferimentiComputo } } : {}),
      ...(contesto.psc ? { psc: { ...contesto.psc.riferimento, estratti } } : {}),
      quesiti: domande.map(domanda => ({ domanda, risposta: "" })),
    });
    if (fonti) l.fonti_scheda = fonti;
    if (standard?.id === "demolizioni" || titoloDemolizionePos(intensita)) l.programma_demolizioni = programmaDemolizioniVuoto();
    const rischi = lista(o.rischi_misure, 12).flatMap(v => {
      const r = oggetto(v);
      const rischio = testo(r.rischio, 350), misure = testo(r.misure, 750), dpi = testo(r.dpi, 350);
      return rischio && misure ? [{ rischio, misure, dpi, residuo: "" as const }] : [];
    });
    const righe = rischi.length ? rischi : standard && !l.rischi.trim()
      ? standard.rischi.map(([rischio, misure]) => ({ rischio, misure, dpi: "", residuo: "" as const })) : [];
    if (righe.length) applicaValutazione(l, { righe, misure_comuni: "", dpi_comuni: "" });
    const tecnica = oggetto(o.dettaglio_tecnico);
    l.tecnica = {
      ...tecnicaPosVuota(),
      area: testo(tecnica.area, 450),
      interferenze: testo(tecnica.interferenze, 900),
      condizioni_avvio: testo(tecnica.condizioni_avvio, 650),
      sospensione: testo(tecnica.sospensione, 650),
      emergenze: testo(tecnica.emergenze, 650),
      prima: testo(tecnica.prima, 650) || standard?.prima || "",
      durante: testo(tecnica.durante, 650) || standard?.durante || l.modalita,
      dopo: testo(tecnica.dopo, 650) || standard?.dopo || "",
      rischi: righe.map((r, ri) => ({
        ...rischioTecnicoVuoto(`${l.id}-r${ri + 1}`),
        pericolo: r.rischio, misure_organizzative: r.misure, dpi: r.dpi,
      })),
    };
    return [l];
  });
}
