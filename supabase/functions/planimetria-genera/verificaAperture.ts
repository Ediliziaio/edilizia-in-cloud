import type { PiantaGenerata } from "./generazione.ts";
import type { ChiamaModello, Messaggio, RichiestaGenerazione, Tentativo } from "./genera.ts";
import { estraiJson } from "./rispostaAI.ts";
import { conRegoleDocumento } from "../_shared/documentoNonFidato.ts";
import { vincoliDellaStanza } from "../../../shared/render-planimetria/vincoli.ts";

/** Il revisore vede il documento originale e i segmenti candidati, mai la precedente risposta AI.
 * Può solo confermare o escludere: non può spostare, ridimensionare o aggiungere un'apertura. */
export function messaggiVerificaAperture(g: PiantaGenerata, req: RichiestaGenerazione): Messaggio[] {
  const file = req.file!;
  if ((g.generazione.aperture_sorgente ?? []).every((a) => a.sistema === "immagine")) return [
    { role: "system", content: conRegoleDocumento(`Leggi SOLO le porte e le finestre effettivamente disegnate nel documento originale. Non conosci le ipotesi della prima lettura e non devi completare la casa. Restituisci esclusivamente i vani riconoscibili fra stipiti: interruzione del muro, anta/arco della porta, serramento dentro lo spessore. TV, mobili, docce, lavabi, radiatori, quote e linee parallele a un muro continuo NON sono aperture. Non dedurre un ingresso o una finestra necessaria per illuminare una stanza. Nel dubbio ometti il vano.
Coordinate x e y da 0 a 1000 su tutta l'immagine allegata (margini compresi), origine in alto a sinistra, senza ruotare o ritagliare. Per ciascun vano indica il segmento esatto fra gli stipiti sul muro, non l'arco o il riquadro dell'arredo. Mantieni il lato reale: una finestra sulla parete destra deve avere il segmento verticale, mai sulla parete in alto.
Rispondi SOLO JSON: {"aperture":[{"tipo":"porta|finestra|portafinestra|varco","da":[x,y],"a":[x,y],"evidenza":"vano_interrotto|simbolo_porta|simbolo_finestra"}]}. Se nessun vano è leggibile restituisci aperture vuoto. Non aggiungere spiegazioni.`) },
    { role: "user", content: [{ type: "text", text: "Rileva i vani visibili su questo documento, senza inventarne o aggiungerne." }, file.mime === "application/pdf" ? { type: "file", file: { filename: file.nome ?? "pianta.pdf", file_data: file.dataUrl } } : { type: "image_url", image_url: { url: file.dataUrl } }] },
  ];
  const contesto = g.planimetria.livelli.flatMap((l) => l.fatto.locali.map((c) => {
    const v = vincoliDellaStanza(g.planimetria, { livello_id: l.id, ambito: "fatto", locale_id: c.id });
    return { piano: l.nome, stanza: c.nome, aperture: v?.aperture.map((a) => ({ id: a.id, parete: a.parete, da_inizio_parete_cm: a.da_inizio_parete_cm })) ?? [] };
  }));
  return [
    { role: "system", content: conRegoleDocumento(`Controlli esclusivamente porte e finestre su una planimetria. Le aperture elencate sono IPOTESI, anche sbagliate: non fidarti del tipo né del loro numero. Per ogni id guarda il segmento da–a sul documento ORIGINALE. Con sistema "immagine" le coordinate x e y vanno da 0 a 1000 sui due assi dell'intera immagine, senza ruotarla. Con sistema "metri" sono uno schema dello schizzo (x verso destra, y verso il basso), NON pixel: identifica il vano dalla stanza e dal lato corrispondenti sul foglio, senza pretendere che lo schizzo sia in scala. Se non puoi riconoscere quella posizione sul foglio, rispondi incerta.
Conferma solo un vano realmente riconoscibile fra gli stipiti: interruzione del muro, simbolo di porta con anta/arco, oppure simbolo di serramento inserito nello spessore del muro. TV, mobili, divani, lavabi, docce, radiatori, retini, quote, cartigli e frecce NON sono aperture. Una linea parallela a un muro continuo non prova una finestra. Non dedurre una porta per collegare stanze, né una finestra perché la stanza dovrebbe avere luce.
Se un simbolo non è leggibile, il tipo non coincide o il vano è su un altro lato, esito "incerta" o "assente". Nel dubbio NON confermare. Non aggiungere id, non correggere coordinate e non completare parti fuori immagine. Rispondi SOLO JSON: {"verifiche":[{"id":"a1","esito":"visibile|assente|incerta","evidenza":"vano_interrotto|simbolo_porta|simbolo_finestra|nessuna"}]}. Una verifica per ogni id.`) },
    { role: "user", content: [
      { type: "text", text: `Confronta queste ipotesi con il file allegato: ${JSON.stringify(g.generazione.aperture_sorgente ?? [])}\nStanze toccate dai candidati (pareti numerate lungo il contorno): ${JSON.stringify(contesto)}` },
      file.mime === "application/pdf" ? { type: "file", file: { filename: file.nome ?? "pianta.pdf", file_data: file.dataUrl } } : { type: "image_url", image_url: { url: file.dataUrl } },
    ] },
  ];
}

/** Due letture indipendenti devono coincidere anche nella posizione sul foglio.
 * Il revisore non riceve segmenti o conteggi candidati; ogni riscontro conferma al massimo un vano. */
export function confrontaRilievoAperture(g: PiantaGenerata, risposta: unknown): unknown {
  const record = risposta && typeof risposta === "object" ? risposta as Record<string, unknown> : {};
  if (!Array.isArray(record.aperture) || record.aperture.length > 250) return null;
  const coppia = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1000);
  const rilievi = record.aperture.filter((v): v is { tipo: string; da: [number, number]; a: [number, number]; evidenza: string } => {
    if (!v || typeof v !== "object") return false;
    const a = v as Record<string, unknown>;
    return typeof a.tipo === "string" && ["porta", "finestra", "portafinestra", "varco"].includes(a.tipo) && coppia(a.da) && coppia(a.a)
      && (a.evidenza === "vano_interrotto" || (a.tipo === "porta" && a.evidenza === "simbolo_porta") || (["finestra", "portafinestra"].includes(a.tipo) && a.evidenza === "simbolo_finestra"));
  });
  const sorgenti = g.generazione.aperture_sorgente ?? [];
  const distanza = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const corrisponde = (a: typeof sorgenti[number], b: typeof rilievi[number]) => {
    if (a.sistema !== "immagine" || a.tipo !== b.tipo) return false;
    const la = distanza(a.da, a.a), lb = distanza(b.da, b.a);
    if (la < 1 || lb < 1 || lb / la < 0.6 || lb / la > 1.6) return false;
    const paralleli = Math.abs(((a.a[0] - a.da[0]) * (b.a[0] - b.da[0]) + (a.a[1] - a.da[1]) * (b.a[1] - b.da[1])) / (la * lb));
    return paralleli >= 0.97 && Math.min(Math.max(distanza(a.da, b.da), distanza(a.a, b.a)), Math.max(distanza(a.da, b.a), distanza(a.a, b.da))) <= 25;
  };
  const abbinamenti = sorgenti.map((a) => rilievi.flatMap((b, i) => corrisponde(a, b) ? [i] : []));
  return { verifiche: sorgenti.map((a, i) => {
    const match = abbinamenti[i];
    const unico = match.length === 1 && abbinamenti.filter((m) => m.includes(match[0])).length === 1;
    return { id: a.id, esito: unico ? "visibile" : match.length ? "incerta" : "assente", evidenza: unico ? rilievi[match[0]].evidenza : "nessuna" };
  }) };
}

/** Un risultato mancante, incompleto, contraddittorio o senza evidenza non autorizza un foro. */
export function applicaVerificaAperture(g: PiantaGenerata, risposta: unknown, controllate: boolean): PiantaGenerata {
  const record = risposta && typeof risposta === "object" ? risposta as Record<string, unknown> : {};
  const verifiche = Array.isArray(record.verifiche) ? record.verifiche : [];
  const accettate = new Set<string>();
  let escluse = 0, dubbie = 0;
  for (const livello of g.planimetria.livelli) for (const a of livello.fatto.aperture) {
    const righe = verifiche.filter((v): v is Record<string, unknown> => !!v && typeof v === "object" && (v as Record<string, unknown>).id === a.id);
    const v = righe.length === 1 ? righe[0] : null;
    const prova = v?.evidenza === "vano_interrotto" || (a.tipo === "porta" && v?.evidenza === "simbolo_porta") || (["finestra", "portafinestra"].includes(a.tipo) && v?.evidenza === "simbolo_finestra");
    if (controllate && v?.esito === "visibile" && prova) accettate.add(a.id);
    else if (controllate && v?.esito === "assente") escluse++;
    else dubbie++;
  }
  const avvisi = [...g.generazione.avvisi];
  if (escluse || dubbie) avvisi.push(`${escluse + dubbie} possibil${escluse + dubbie === 1 ? "e apertura non è stata inserita" : "i aperture non sono state inserite"}: ${controllate ? "non confermate dal confronto con il documento" : "il controllo sul documento non è disponibile"}. Confronta porte e finestre con l'originale e aggiungi nell'editor solo quelle riconoscibili.`);
  return { ...g,
    planimetria: { ...g.planimetria, livelli: g.planimetria.livelli.map((l) => ({ ...l, fatto: { ...l.fatto, aperture: l.fatto.aperture.filter((a) => accettate.has(a.id)) } })) },
    generazione: { ...g.generazione, avvisi, verifica_aperture: { controllate, confermate: accettate.size, escluse, dubbie } },
  };
}

export async function verificaApertureDocumento(g: PiantaGenerata, req: RichiestaGenerazione, chiama: ChiamaModello, tempoRestanteMs: number, ora: () => number): Promise<{ pianta: PiantaGenerata; tentativo?: Tentativo }> {
  if (!["documento", "schizzo"].includes(req.ingresso)) return { pianta: g };
  const aperture = g.planimetria.livelli.flatMap((l) => l.fatto.aperture);
  if (!aperture.length) return { pianta: g };
  const sorgenti = g.generazione.aperture_sorgente ?? [];
  const leggibili = req.file && sorgenti.length === aperture.length && sorgenti.every((a) => [...a.da, ...a.a].every((n) => Number.isFinite(n) && (a.sistema === "metri" || (n >= 0 && n <= 1000))));
  if (!leggibili || tempoRestanteMs < 20_000) return { pianta: applicaVerificaAperture(g, null, false) };
  const inizio = ora();
  try {
    const r = await chiama(messaggiVerificaAperture(g, req), 3);
    const letta = estraiJson(r.testo);
    const risposta = sorgenti.every((a) => a.sistema === "immagine") ? confrontaRilievoAperture(g, letta) : letta;
    const controllate = !!risposta && typeof risposta === "object" && Array.isArray((risposta as Record<string, unknown>).verifiche);
    return { pianta: applicaVerificaAperture(g, risposta, controllate), tentativo: { modello: r.modello, durataMs: ora() - inizio, costoUsd: r.costoUsd ?? 0, errori: controllate ? [] : ["verifica_aperture_non_leggibile"] } };
  } catch {
    return { pianta: applicaVerificaAperture(g, null, false), tentativo: { modello: "verifica_aperture", durataMs: ora() - inizio, costoUsd: 0, errori: ["verifica_aperture_non_disponibile"] } };
  }
}
