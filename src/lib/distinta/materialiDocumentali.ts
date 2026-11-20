import type { RigaDistintaCalcolata, VoceComputo } from "./generaDistinta";
import { abacoDalComputo, riepilogoAbaco } from "./abacoComputo";

export interface DatiDocumentaliMateriale {
  versione: 1;
  quantita: "documentata" | "ricostruita" | "stimata";
  quantita_documento: number | null; unita_documento: string | null;
  fonti: { voce_id: string; numero: string; descrizione: string; quantita: number | null; unita: string | null }[];
  specifiche: string[];
  componenti_inclusi: { descrizione: string; quantita: number | null; unita: string }[];
  dati_mancanti: string[];
}
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const aPezzi = (u: string | null | undefined) => /^(?:cad\.?|cadauno|cadauna|pz|n\.?|nr\.?)$/i.test(u?.trim() ?? "");
const oggetto = (v: VoceComputo) => norm(v.descrizione_breve).replace(/^fornitura (?:e (?:posa|collocazione|collocamento|installazione)(?: in opera)? )?(?:di |dei |degli |delle )?/, "");

/** Una larghezza media dichiarata permette una geometria nominale, non un rilievo esecutivo. */
function geometriaSpallette(v: VoceComputo, voci: VoceComputo[]) {
  const misure = v.misure ?? [];
  const lineari = misure.filter(m => /spallett/.test(norm(m.descrizione ?? ""))).reduce((s, m) => s + Number(m.quantita ?? 0), 0);
  const somma = misure.reduce((s, m) => s + Number(m.quantita ?? 0), 0);
  if (!(lineari > 0) || Math.abs(somma - Number(v.quantita)) > 0.011) return null;
  const capitolo = (w: VoceComputo) => w.super_categoria ?? w.capitolo_nome ?? "";
  const candidati = voci.flatMap(w => {
    if (!/^spallett/.test(oggetto(w)) || !/^(?:m|ml)$/i.test(w.unita_misura ?? "")
      || capitolo(w) !== capitolo(v) || Math.abs(Number(w.quantita) - lineari) > 0.011) return [];
    const larg = /larghezza(?:\s+media)?\s*(?:di\s*)?(\d+(?:[.,]\d+)?)\s*(cm|mm|m)\b/i.exec(w.descrizione_breve);
    if (!larg) return [];
    const metri = Number(larg[1].replace(",", ".")) / (larg[2].toLowerCase() === "cm" ? 100 : larg[2].toLowerCase() === "mm" ? 1000 : 1);
    return metri > 0 ? [{ voce: w, metri }] : [];
  });
  if (candidati.length !== 1) return null;
  const { voce, metri } = candidati[0];
  return { voce, lineari, larghezza_cm: metri * 100, superficie_spallette: Math.round(lineari * metri * 100) / 100,
    superficie_nominale: Math.round((somma - lineari + lineari * metri) * 100) / 100 };
}

/** Un prodotto già definito nel documento precede le ricette generiche per punti e impianti. */
export function prodottoEsplicito(v: VoceComputo): { nome: string; specifiche: string; unita: string; nota: string } | null {
  const t = oggetto(v);
  const modelloEsplicito = /\bmod(?:ello)?[.\s]|[A-Z0-9]+[-_][A-Z0-9]{2,}/i.test(v.descrizione_breve);
  const apparecchioDefinito = /^(?:inverter|modulo fotovoltaico|pannello fotovoltaico)\b/.test(t) && modelloEsplicito;
  const quadroDefinito = /^quadro (?:di campo|elettrico)\b/.test(t) && /\b(?:dc|ac)\b|\d+\s*(?:stringhe|vdc|kw)/i.test(t);
  const quotaStruttura = /^struttura di fissaggio\b/.test(t) && v.unita_misura === "quota/modulo";
  if ((aPezzi(v.unita_misura) && (apparecchioDefinito || quadroDefinito)) || quotaStruttura) {
    return { nome: v.descrizione_breve.replace(/^fornitura (?:e posa )?(?:in opera )?(?:di )?/i, ""), specifiche: v.descrizione_breve,
      unita: quotaStruttura ? "quota/modulo" : "pz",
      nota: "Prodotto dal computo: apparecchio o sistema già definito nell'offerta; i componenti compresi e gli accessori generici non si aggiungono una seconda volta. Conferma la distinta del fornitore." };
  }
  if (/^tinteggiatura a tempera/.test(t) && /^(mq|m2|m²)$/i.test(v.unita_misura ?? "")) {
    return { nome: "Tempera per interni", specifiche: v.descrizione_breve, unita: "mq",
      nota: "Superficie da trattare; quantità del prodotto da calcolare con resa e confezione. Il documento esclude l'imprimitura: niente fissativo aggiunto dalla ricetta." };
  }
  const conteggioCassonetti = (v.misure ?? []).length === 1 && (v.misure ?? []).some(m =>
    /^(?:n[°.]?|numero|nr)\s*cassonetti\b/i.test(m.descrizione ?? "") && Number.isInteger(Number(m.quantita))
    && Number(m.quantita) === Number(v.quantita) && !m.larghezza && !m.altezza_peso && !m.lunghezza);
  if (/^cassonetto monoblocco isolante prefabbricato/.test(t) && (aPezzi(v.unita_misura) || conteggioCassonetti)) {
    return { nome: "Cassonetto monoblocco isolante prefabbricato", specifiche: v.descrizione_breve,
      unita: "pz", nota: "Numero di monoblocchi dalla misura «N° cassonetti»: la sezione 30×30 cm non è una superficie acquistabile. Completa l'abaco dei fori." };
  }
  if (!aPezzi(v.unita_misura)) return null;
  if (/^inverter\b/.test(t) && /\boff[ -]?grid\b|\bonda sinusoidale\b/.test(t)) {
    return { nome: v.descrizione_breve.replace(/^fornitura (?:e (?:posa|collocazione|collocamento|installazione)(?: in opera)? )?(?:di )?/i, ""),
      specifiche: v.descrizione_breve, unita: "pz",
      nota: "Apparecchio off-grid descritto e contato nell'offerta: la ricetta generica non aggiunge cavi, staffe o connettori senza un dettaglio proprio." };
  }
  if (/^accessori dei ventilconvettori/.test(t) && /pannello comando velocita.*termostato ambiente/.test(t)
    && Number.isInteger(v.quantita) && Number(v.quantita) > 0) {
    return { nome: "Pannello di comando con termostato per ventilconvettore", specifiche: v.descrizione_breve, unita: "pz",
      nota: "Comando contato separatamente dal ventilconvettore: non aggiungere un secondo comando dalla ricetta." };
  }
  if (/^cassetta di derivazione\b/.test(t) && /dimensioni/.test(t)) {
    return { nome: /^cassetta di derivazione da parete/.test(t) ? "Cassetta di derivazione da parete" : "Cassetta di derivazione",
      specifiche: v.descrizione_breve, unita: "pz", nota: "Prodotto esplicito: coperchio e viti compresi non diventano morsetti o altri accessori da comprare." };
  }
  if (/^(?:interruttor[ei] magnetotermic|interruttor[ei].*magnetotermic)/.test(t) && /differenzial/.test(t)) {
    return { nome: "Interruttore magnetotermico differenziale", specifiche: v.descrizione_breve, unita: "pz",
      nota: "Poli, potere di interruzione e tipo differenziale come da documento; corrente nominale esatta da schema." };
  }
  return null;
}

/** Solo componenti con conteggio esplicito; i tratti omessi del PDF non si ricostruiscono per ipotesi. */
export function componentiEspliciti(testo: string): DatiDocumentaliMateriale["componenti_inclusi"] {
  return [...testo.matchAll(/(?:^|:\s*|\s[-–]\s*)(\d+)\s*[x×]\s*([^]*?)(?=\s[-–]\s*\d+\s*[x×]|$)/gi)]
    .filter(m => !/\.{3}|…/.test(m[2]))
    .map(m => ({ quantita: Number(m[1]), unita: "pz", descrizione: m[2].trim() }));
}

export function dettagliLottoIncompleto(v: VoceComputo): string[] {
  const t = oggetto(v);
  if (/^massetto/.test(t) && /ritiro controllato/.test(t)) {
    const m = /spessore\s+non inferiore a\s+(\d+(?:[.,]\d+)?)\s*(cm|mm)/i.exec(v.descrizione_breve);
    if (m && /^(mq|m2|m²)$/i.test(v.unita_misura ?? "")) {
      const metri = Number(m[1].replace(",", ".")) / (m[2].toLowerCase() === "cm" ? 100 : 1000);
      return [`Volume minimo documentabile: ${Number(v.quantita)} m² × ${metri} m = ${Math.round(Number(v.quantita) * metri * 1000) / 1000} m³. È un minimo, non una quantità di sacchi.`,
        "Mancano spessore effettivo, prodotto/ciclo e resa kg/m³; il documento non autorizza una miscela generica sabbia-cemento."];
    }
  }
  if (/^manicotto.*fusiotherm/.test(t) && v.a_corpo) return [v.descrizione_breve,
    "Componenti nominati senza quantità individuali: il lotto a corpo non significa un pezzo di ogni raccordo. Servono conteggi e schema del collettore."];
  if (/^preparazione di superfici impermeabilizzate/.test(t)) return [
    `Superficie di preparazione: ${v.quantita} ${v.unita_misura}. Non è una nuova superficie di guaina da comprare.`,
    "Materiale di ripristino e resa dipendono dallo stato del supporto, dal rilievo e dal ciclo approvato."];
  return [];
}

export function completaMaterialiDaDocumenti(righe: RigaDistintaCalcolata[], voci: VoceComputo[], interpretate: VoceComputo[] = voci): RigaDistintaCalcolata[] {
  const perId = new Map(voci.map(v => [v.id, v]));
  const abaco = abacoDalComputo(voci);
  return righe.map(r => {
    if (r.origine !== "computo") return r;
    const fonti = [...new Map(r.origini.flatMap(o => o.tipo === "computo" && perId.has(o.voce_id) ? [[o.voce_id, perId.get(o.voce_id)!] as const] : [])).values()];
    const interpretazioni = interpretate.filter(v => r.origini.some(o => o.tipo === "computo" && o.voce_id === v.id && Math.abs(Number(v.quantita) - o.quantita_voce) < 0.001));
    const titolo = norm(r.descrizione), specifiche: string[] = [], mancanti: string[] = [];
    const riferimentiAggiunti: VoceComputo[] = [];
    const componenti: DatiDocumentaliMateriale["componenti_inclusi"] = [];
    let quantita: DatiDocumentaliMateriale["quantita"] = ["libreria_standard", "proposta_ai", "compreso", "scomposizione", "scomposizione_codice"].includes(r.fonte) ? "stimata" : "documentata";
    let quantita_documento: number | null = null, unita_documento: string | null = null;
    let spec = r.specifiche;
    let netta = r.quantita_netta, calcolata = r.quantita_calcolata;
    const note = [...r.note];
    mancanti.push(...interpretazioni.flatMap(v => v.avvisi_acquisto ?? []));
    for (const v of fonti) {
      const t = oggetto(v), testo = v.descrizione_breve;
      const prodotto = prodottoEsplicito(v);
      mancanti.push(...(v.avvisi_acquisto ?? []));
      if (/^profilo in alluminio/.test(t) && interpretazioni.some(w => w.id === v.id && w.avvisi_acquisto?.some(a => /^Unità contabile/.test(a)))) {
        quantita = "ricostruita"; quantita_documento = r.quantita_netta; unita_documento = r.unita_misura;
        specifiche.push(...interpretazioni.filter(w => w.id === v.id).flatMap(w => w.avvisi_acquisto ?? []));
      }
      if (/^ventilconvettore\b/.test(t) && /^ventilconvettore\b/.test(titolo)) {
        specifiche.push(testo);
        if (!/\b(?:marca|modello|codice prodotto)\b/i.test(testo)) mancanti.push("Marca/codice del ventilconvettore e verifica di attacchi e regolazione del modello offerto.");
        quantita = "documentata"; quantita_documento = (quantita_documento ?? 0) + Number(v.quantita); unita_documento = "pz";
      }
      if (/^inverter\b/.test(t) && /^inverter\b/.test(titolo)) {
        specifiche.push(testo, ...(v.misure ?? []).map(m => m.descrizione ?? "").filter(Boolean));
        mancanti.push("Modello, configurazione MPPT/stringhe, protezioni e compatibilità con l'eventuale accumulo da progetto/offerta.");
        quantita = interpretazioni.some(w => w.id === v.id && w.avvisi_acquisto?.length) ? "ricostruita" : "documentata";
        if (!prodotto) quantita_documento = (quantita_documento ?? 0) + Number(v.quantita);
        unita_documento = "pz";
      }
      if (prodotto) {
        specifiche.push(prodotto.specifiche); quantita = "documentata";
        quantita_documento = (quantita_documento ?? 0) + Number(v.quantita); unita_documento = prodotto.unita;
        if (/magnetotermic/.test(t)) mancanti.push("Corrente nominale esatta dell'interruttore: il documento indica un intervallo (0–32 A), serve lo schema elettrico.");
        if (/cassonetto monoblocco/.test(t)) mancanti.push("Larghezza e posizione di ciascun foro/monoblocco nell'abaco.");
        if (/^Pannello di comando/.test(prodotto.nome)) mancanti.push("Codice e compatibilità del comando con il ventilconvettore e la regolazione di progetto.");
      }
      const posizioni = abaco.filter(p => p.voce_id === v.id);
      if (posizioni.length) {
        const s = riepilogoAbaco(posizioni);
        specifiche.push(`${s.posizioni} righe di abaco; ${s.pezzi_ricostruiti} pezzi ricostruiti, ${s.posizioni_da_rilevare} righe senza dimensioni e ${s.posizioni_senza_conteggio} senza conteggio certo.`, testo);
        mancanti.push("Abaco finale per apertura, rilievo dei vani, verso di apertura e abbinamento ad avvolgibili/oscuranti/cassonetti.");
        quantita_documento = (quantita_documento ?? 0) + Number(v.quantita); unita_documento = v.unita_misura ?? "mq";
      }
      if (/^n\.?\s*\d+\s+deumidificatore/.test(t)) {
        specifiche.push(testo, ...(v.misure ?? []).map(m => m.descrizione ?? "").filter(Boolean));
        mancanti.push("Distinta completa VMC: il PDF tronca il tratto centrale della descrizione; manca il dettaglio degli accessori e delle portate.");
        if (/^tubo di distribuzione vmc/.test(titolo)) {
          spec = `${r.specifiche} · diametro esterno/interno 90/75 mm (dal documento); incluso nel lotto VMC.`;
          quantita_documento = r.quantita_netta; unita_documento = "bobina";
        } else { quantita_documento = r.quantita_netta; unita_documento = "pz"; }
        quantita = "documentata";
      }
      if (/^quadro elettrico interfaccia/.test(t)) {
        componenti.push(...componentiEspliciti(testo)); specifiche.push(testo);
        mancanti.push("Elenco completo del quadro e schema unifilare: nel PDF una parte della distinta è sostituita da puntini.");
      }
      if (/^controsoglia/.test(t)) {
        specifiche.push(testo, "Larghezza 15 cm nella descrizione, 30 cm nelle misure: sono dati discordanti.");
        mancanti.push("Profondità, sagome, numero di pezzi e lunghezze delle controsoglie dal rilievo.");
      }
      if (/^(?:pittura|idropittura|tempera|fondo impregnante|rivestimento|rasante|fissativo)/.test(titolo)) {
        specifiche.push(testo);
        mancanti.push("Scheda del prodotto: resa, numero di mani/strati e contenuto della confezione.");
        if (/spallett/.test((v.misure ?? []).map(m => norm(m.descrizione ?? "")).join(" "))) {
          const geometria = geometriaSpallette(v, voci);
          if (geometria) {
            const it = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 2 });
            riferimentiAggiunti.push(geometria.voce);
            specifiche.push(`Larghezza nominale documentata alla voce ${geometria.voce.numero_ordine ?? "collegata"}: ${it(geometria.larghezza_cm)} cm. Spallette: ${it(geometria.lineari)} m × ${it(geometria.larghezza_cm / 100)} m = ${it(geometria.superficie_spallette)} m².`,
              `Superficie geometrica nominale delle finiture: ${it(geometria.superficie_nominale)} m²; superficie contabile conservata: ${it(Number(v.quantita))} m².`);
            mancanti.push("Conferma superficie di applicazione e perimetro del ciclo: la larghezza media è documentata, ma la geometria nominale differisce dalla superficie contabile. Verifica le dimensioni effettive prima dell'ordine.");
          } else mancanti.push("Larghezza effettiva delle spallette: il computo somma metri lineari a superfici di finitura. Serve una voce collegata con larghezza documentata e non ambigua.");
        }
      }
      if (/^controsoffitto realizzato con lastre di cartongesso/.test(t) && /^lastra in cartongesso/.test(titolo)
        && fonti.length === 1 && /^(mq|m2|m²)$/.test(r.unita_misura)
        && !/doppia|due lastre|doppio strato|multistrato/.test(t)) {
        quantita_documento = Number(v.quantita); unita_documento = "mq"; quantita = "documentata";
        netta = Number(v.quantita);
        calcolata = Math.round(netta * (1 + (r.sfrido ?? 0) / 100) * 100) / 100;
        specifiche.push(testo);
        mancanti.push("Formato delle lastre e piano di taglio; sfrido proposto da confermare, struttura/pendini/viti/stucco da dettaglio esecutivo.");
        note.push(`Superficie netta ${netta} mq dal documento; eventuale sfrido applicato una sola volta, non già incorporato nella resa.`);
      }
      if (/^pannell[oi] isolant/.test(titolo)) {
        specifiche.push(testo, `Specifica del prodotto ricostruita: ${r.specifiche ?? "come da voce"}. Quantità netta della porzione: ${r.quantita_netta} mq.`); quantita_documento = r.quantita_netta; unita_documento = "mq";
        mancanti.push("Sfrido effettivo, formato/confezione e conferma del sistema isolante del fornitore.");
        quantita = "documentata";
      }
    }
    const correlate = interpretazioni.flatMap(v => [...(v.descrizione_estesa ?? "").matchAll(/sovrapprezzo\s*\(voce\s+(\d+)\)/g)]
      .flatMap(m => { const w = voci.find(w => w.numero_ordine === m[1]); return w ? [w] : []; }));
    for (const w of correlate) { specifiche.push(`Incremento documentale voce ${w.numero_ordine}: ${w.descrizione_breve}`); }
    if (/^staffa a parete|^cavo lato alternata|^kit raccordi|^detentore|^valvola a tre vie|^adesivo|^perni |^profilo a c|^pendino|^viti |^stucco|^collante|^tassello/.test(titolo) && quantita === "stimata") {
      mancanti.push("Quantità/accessorio da ricetta generica: dettaglio esecutivo o scheda del sistema necessari; il PDF non ne indica la resa.");
    }
    const dati: DatiDocumentaliMateriale = { versione: 1, quantita, quantita_documento, unita_documento,
      fonti: [...new Map([...fonti, ...correlate, ...riferimentiAggiunti].map(v => [v.id, v])).values()].map(v => ({ voce_id: v.id, numero: v.numero_ordine ?? v.codice_voce ?? "", descrizione: v.descrizione_breve, quantita: v.quantita ?? null, unita: v.unita_misura ?? null })),
      specifiche: [...new Set(specifiche)], componenti_inclusi: componenti, dati_mancanti: [...new Set(mancanti)] };
    return { ...r, specifiche: spec, quantita_netta: netta, quantita_calcolata: calcolata, note,
      dati_documentali: dati, origini: r.origini.map(o => o.tipo === "computo" ? { ...o, dati_documentali: dati } : o) };
  });
}
