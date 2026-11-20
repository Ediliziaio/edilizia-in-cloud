import type { RigaDistintaCalcolata, VoceComputo, OrigineRiga } from "./generaDistinta";

export interface VerificaAcquisto {
  stato: "da_verificare" | "confermata";
  motivi: string[];
  campi_mancanti: string[];
  confermata_il?: string;
  confermata_da?: string;
}

const testo = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/,/g, ".");
const numero = (s: string) => Number(s.replace(",", "."));
const pezzi = (u: string | null | undefined) => /^(?:pz|cad\.?|cadauno|n\.?|nr\.?)$/i.test(u?.trim() ?? "");

/** Interpreta le dimensioni senza modificare le quantità contabili conservate nel computo. */
export function preparaQuantitaAcquisto<T extends VoceComputo>(v: T): T {
  const t = testo(`${v.descrizione_breve} ${v.descrizione_estesa ?? ""}`);
  const avvisi = [...(v.avvisi_acquisto ?? [])];
  let quantita = v.quantita;
  const misure = v.misure ?? [];
  const lunghezza = /lunghezza\s+(?:pari a\s*)?(\d+(?:[.,]\d+)?)\s*mm/i.exec(v.descrizione_breve);
  if (pezzi(v.unita_misura) && /profil[oi].*alluminio/.test(t) && lunghezza && misure.length === 1) {
    const m = misure[0], metri = numero(lunghezza[1]) / 1000;
    if (Number(m.parti_uguali) > 0 && Number.isInteger(Number(m.parti_uguali)) && metri > 0
      && Math.abs(Number(m.lunghezza) - metri) < 0.0001
      && Math.abs(Number(v.quantita) - Number(m.parti_uguali) * metri) < 0.011) {
      quantita = Number(m.parti_uguali);
      avvisi.push(`Unità contabile da confermare: ${v.quantita} ${v.unita_misura} deriva da ${quantita} barre da ${metri} m. Verifica l'unità dell'offerta prima di ordinare.`);
    }
  }
  const noteMisure = misure.map(m => m.descrizione ?? "").join(" ");
  if (/^inverter\b/.test(t) && pezzi(v.unita_misura) && Number(v.quantita) > 0 && Number(v.quantita) < 1) {
    const positive = misure.filter(m => Number(m.quantita) > 0);
    if (positive.length === 1 && Number(positive[0].quantita) === 1 && /potenza nominale inverter per l.impianto/i.test(noteMisure)
      && misure.some(m => Number(m.quantita) < 0 && Number(m.quantita) > -1)) {
      quantita = 1;
      avvisi.push(`Coefficiente contabile ${v.quantita}: una macchina fisica. Conferma la taglia di progetto e la compatibilità prima dell'ordine.`);
    }
  }
  if (/^(?:cavo|fornitura.*cavo)/.test(t)) {
    const sezioni = new Set([...t.matchAll(/(\d+(?:\.\d+)?)\s*mm(?:q|²|2|l)(?:\b|[.)])/g)].map(m => m[1]));
    if (sezioni.size > 1) avvisi.push(`Sezioni del cavo discordanti (${[...sezioni].join(" / ")} mm²): conferma lo schema elettrico.`);
  }
  if (/^controsoglia/.test(t)) {
    const larg = /larghezza\s+(?:di\s*)?(\d+(?:\.\d+)?)\s*cm/.exec(t);
    if (larg && misure.some(m => Number(m.larghezza) > 0 && Math.abs(Number(m.larghezza) - Number(larg[1]) / 100) > 0.001)) {
      avvisi.push("Larghezza della controsoglia discordante fra descrizione e misure: completa rilievo, pezzi e sagome.");
    }
  }
  return { ...v, quantita, avvisi_acquisto: [...new Set(avvisi)] };
}

/** Gli avvisi sono dati persistenti, non soltanto testo della finestra di anteprima. */
export function completaVerificheAcquisto(righe: RigaDistintaCalcolata[], voci: VoceComputo[]): RigaDistintaCalcolata[] {
  const perId = new Map(voci.map(v => [v.id, v]));
  return righe.map(r => {
    const fonti = r.origini.flatMap(o => o.tipo === "computo" && perId.has(o.voce_id) ? [perId.get(o.voce_id)!] : []);
    const note = [...r.note, ...fonti.flatMap(v => v.avvisi_acquisto ?? [])];
    const motivi: string[] = [], campi: string[] = [];
    const richiedi = (motivo: string, ...c: string[]) => { motivi.push(motivo); campi.push(...c); };
    const descr = testo(r.descrizione);
    if (/^(?:interruttore magnetotermico differenziale|cassonetto monoblocco isolante)/.test(descr)) {
      for (const m of r.dati_documentali?.dati_mancanti ?? []) richiedi(m, /corrente nominale/i.test(m) ? "corrente_nominale" : "abaco");
    }
    if (r.proposta_ai) richiedi("Proposta AI: quantità, rese e specifiche non ancora validate.", "quantita", "unita", "specifiche");
    if (note.some(n => n.startsWith("Prodotto dal computo:"))) richiedi("Prodotto identificato dal documento: conferma modello, formato, unità commerciale e inclusioni della fornitura.", "specifiche", "modello", "unita");
    if (/^(?:Configurazione di ingressi|Prestazioni come da voce)/.test(r.specifiche ?? "")) richiedi("Quantità fisica letta dalla voce: conferma modello e compatibilità del prodotto, senza assumere i valori generici della ricetta.", "specifiche", "modello");
    if (fonti.some(v => v.avvisi_acquisto?.length)) richiedi(fonti.flatMap(v => v.avvisi_acquisto ?? []).join(" "), "quantita", "unita", "specifiche");
    if (r.verifica_acquisto?.stato === "confermata") return r;
    if (/^(?:serramento|finestra|portafinestra|avvolgibile|cassonetto|zanzariera|pannelli oscuranti)/.test(descr) && /^(mq|m2|m²)$/.test(r.unita_misura)) {
      richiedi("Superficie contabile: completa l'abaco dei vani con pezzi, misure e caratteristiche prima dell'acquisto.", "abaco", "quantita", "unita", "specifiche");
    }
    if (/^(?:pittura|idropittura|tempera|vernice|fondo impregnante|rivestimento acril|rasante)/.test(descr)
      && fonti.some(v => /^(mq|m2|m²)$/.test(v.unita_misura ?? ""))) {
      richiedi("Superficie applicata e quantità del prodotto sono distinte: conferma superficie, prodotto, resa, mani e confezione.", "quantita", "unita", "resa", "specifiche");
    }
    if (r.fonte === "libreria_standard") {
      const apparecchio = /^(?:ventilconvettore|inverter|modulo fotovoltaico)/.test(descr) && pezzi(r.unita_misura)
        && r.origini.every(o => o.tipo === "computo" && pezzi(o.unita_voce) && o.quantita === o.quantita_voce);
      if (!apparecchio) richiedi("Resa della libreria standard: conferma la quantità con il prodotto effettivo e la relativa scheda tecnica.", "quantita", "unita", "resa", "specifiche");
    }
    if (note.some(n => /lotto a corpo da completare|superficie netta dal computo/i.test(n))) {
      richiedi("Completa prodotto, distinta e specifiche prima dell'ordine.", "quantita", "unita", "specifiche");
    }
    if (note.some(n => /^Lotto VMC/i.test(n))) richiedi("Fornitura VMC composta: conferma distinta e inclusioni dell'affidamento prima di ordinare i singoli articoli.", "specifiche", "inclusioni");
    let specifiche = r.specifiche;
    if (fonti.some(v => /materiale vecchio di recupero/i.test(v.descrizione_breve)) && /coppi|canali in laterizio|laterizi/.test(descr)) {
      specifiche = [specifiche, "Materiale vecchio di recupero richiesto dal computo."].filter(Boolean).join(" · ");
    }
    const precisazioni = r.dati_documentali?.dati_mancanti ?? [];
    for (const motivo of precisazioni) richiedi(motivo, "specifiche");
    const verifica: VerificaAcquisto | undefined = motivi.length ? { stato: "da_verificare", motivi: [...new Set([...motivi, ...precisazioni])], campi_mancanti: [...new Set(campi)] } : undefined;
    return { ...r, specifiche, note: [...new Set([...note, ...motivi])], ...(verifica ? { verifica_acquisto: verifica } : {}),
      origini: r.origini.map(o => o.tipo === "computo" ? { ...o, ...(verifica ? { verifica_acquisto: verifica } : {}) } : o) };
  });
}

export function verificaDaOrigini(origini: unknown[] | null | undefined): VerificaAcquisto | undefined {
  const verifiche = (origini ?? []).flatMap(o => {
    if (!o || typeof o !== "object") return [];
    const origine = o as { verifica_acquisto?: VerificaAcquisto; dati_documentali?: { dati_mancanti?: unknown }; fonte?: string; ruolo?: string };
    const v = origine.verifica_acquisto;
    // Confermare il numero dalla tavola non approva prodotto, resa o inclusioni della ricetta.
    if (["riscontro_quantita", "riscontro_precedente"].includes(origine.ruolo ?? "") && v?.stato === "confermata") return [];
    if (v && ["da_verificare", "confermata"].includes(v.stato) && Array.isArray(v.motivi)) return [v];
    const mancanti = origine.dati_documentali?.dati_mancanti;
    if (Array.isArray(mancanti) && mancanti.some(m => typeof m === "string" && m.trim())) {
      return [{ stato: "da_verificare" as const, motivi: mancanti.filter((m): m is string => typeof m === "string" && !!m.trim()), campi_mancanti: ["specifiche"] }];
    }
    if (origine.fonte === "proposta_ai") return [{ stato: "da_verificare" as const, motivi: ["Proposta AI archiviata: completa e verifica quantità, resa e prodotto."], campi_mancanti: ["quantita", "unita", "specifiche"] }];
    return [];
  });
  if (!verifiche.length) return undefined;
  return { stato: verifiche.every(v => v.stato === "confermata") ? "confermata" : "da_verificare",
    motivi: [...new Set(verifiche.flatMap(v => v.motivi))], campi_mancanti: [...new Set(verifiche.flatMap(v => v.campi_mancanti ?? []))] };
}

/** Un solo criterio per elenco, revisione e piano, anche per proposte archiviate senza il nuovo flag. */
export function verificaDelMateriale(m: { name?: string | null; origini?: OrigineRiga[] | null }): VerificaAcquisto | undefined {
  const salvata = verificaDaOrigini(m.origini);
  if (salvata || !m.origini?.length) return salvata;
  const standard = m.origini.some(o => o.tipo === "computo" && o.fonte === "libreria_standard");
  const note = m.origini.flatMap(o => o.tipo === "computo" ? o.note ?? [] : []);
  const descrizione = m.name ?? "";
  const incompleta = /^(?:pittura|idropittura|vernice|rasante|fondo impregnante|rivestimento acril)/i.test(descrizione)
    || (standard && !/^(?:ventilconvettore|inverter|modulo fotovoltaico)/i.test(descrizione))
    || note.some(n => /da (?:confermare|controllare|verificare|definire)|ipotesi|dati mancanti|resa /i.test(n));
  return incompleta ? { stato: "da_verificare", motivi: ["Quantità o confezione proposte: confermale con il prodotto effettivo prima dell'acquisto."],
    campi_mancanti: ["quantita", "unita", "specifiche"] } : undefined;
}
