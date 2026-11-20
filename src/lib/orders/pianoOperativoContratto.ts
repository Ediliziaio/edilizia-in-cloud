import { articoliDalContratto, type ContractExtract, type ContractExtractWorkPhase } from "./contractExtract";
import type { FaseModello } from "./modelliFasi";
import { generaDistinta, normalizzaTesto, type RigaDistintaCalcolata } from "@/lib/distinta/generaDistinta";
import { catalogoComeScomposizioni } from "@/lib/distinta/scomposizioniStandard";
import { collegaMateriali, type MaterialeCollegato } from "@/lib/distinta/collegaArticoli";
import { faseOperativaDalTesto } from "../../../supabase/functions/_shared/computoFasiOperative";

export interface LavorazioneContratto {
  riferimento: string;
  descrizione: string;
  quantita: number | null;
  unita: string | null;
  articolo_riferimenti: string[];
}
export interface FaseOperativaContratto {
  riferimento: string;
  nome: string;
  origine: "documento" | "proposta_operativa";
  giorni: number | null;
  lavorazioni: LavorazioneContratto[];
}
export interface MaterialeContratto extends MaterialeCollegato {
  riferimento: string;
  larghezza_mm: number | null;
  altezza_mm: number | null;
  verifiche: string[];
}
export interface PianoOperativoContratto {
  riferimento: string;
  fasi: FaseOperativaContratto[];
  materiali: MaterialeContratto[];
  avvisi: string[];
  vociDaScomporre: number;
}

/** Identità locale stabile; le chiavi del database si calcolano poi con SHA-256. */
function impronta(t: string): string {
  let a = 2166136261, b = 2246822519;
  for (let i = 0; i < t.length; i++) { a = Math.imul(a ^ t.charCodeAt(i), 16777619); b = Math.imul(b ^ t.charCodeAt(i), 3266489917); }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}
const nome = (s: string) => normalizzaTesto(s);
const chiaveCapitolo = (s: string) => nome(s).replace(/[^a-z0-9]/g, " ").split(/\s+/)
  .filter(p => p && !["di", "del", "della", "dei", "e", "in", "opere", "lavori", "lavorazioni", "distribuzione"].includes(p)).sort().join("|");
const capitoloGenerico = (s: string) => /^(?:lavori? a (?:misura|corpo)|lavori|computo metrico(?: estimativo)?|eco|sisma)$/i.test(s.trim());
const quantita = (q: unknown): number | null => typeof q === "number" && Number.isFinite(q) && q > 0 ? q : null;
const OGGETTO_CONTABILE_A_PEZZI = /^(?:regolator[ei] di carica|concentrator[ei]\b|inverter\b|batteri[ae]\b|modul[oi] fotovoltaic|pannell[oi] fotovoltaic|serrament[oi]\b|finestr[ae]\b|port[ae][ -]?finestr[ae]\b|zanzarier[ae]\b|valvol[ae]\b|quadro (?:di campo|elettrico)|sistema di commutazione.*batteri)/i;
function senzaCodice(s: string, codice?: string | null): string {
  const senzaDichiarato = codice && s.toLowerCase().startsWith(codice.toLowerCase())
    ? s.slice(codice.length).replace(/^[\s:–—-]+/, "") : s;
  const t = senzaDichiarato.replace(/^nr\.?\s*\d+\s*[-–:]\s*/i, "").replace(/^[a-z]{2,8}[_ ]\d+(?:\.\d+)+\s*(?:[-–—:]\s*)?/i, "")
    .replace(/^\d{1,4}\s+(?=rimozione|demolizione|spicconatura|fornitura|posa|massetto|intonaco|pittura|tinteggiatura)/i, "").trim();
  const sku = /^([a-z0-9][a-z0-9._/]*(?:\s+[a-z0-9._/]+){0,3})\s+[-–—]\s+(.+)$/i.exec(t);
  if (sku && /\d/.test(sku[1]) && OGGETTO_CONTABILE_A_PEZZI.test(sku[2])) return sku[2].trim();
  // Il preventivo può anteporre un codice commerciale lungo alla descrizione tecnica.
  const commerciale = /^.{1,110}\s+[-–—]\s+(fornitura\b.+|quadro (?:di campo|elettrico)\b.+)$/i.exec(t);
  return commerciale ? commerciale[1].trim() : t;
}

/** Le annotazioni sono dati letti; l'unità naturale di un oggetto senza U.M. resta una proposta. */
function unitaDellaVoce(v: ContractExtract["voci"][number], descrizione: string) {
  if (v.unita?.trim()) return { unita: v.unita, proposta: false };
  const annotazione = /[([]\s*(mq\.?|m²|m2|mc\.?|m³|m3|ml|metri|m|cad\.?\/?me|cad\.?|pz|pezzi|n\.?|nr\.?|kg|l|h\.?|ore?|a\.?c\.?|a corpo)\s*[)\]]\s*$/i.exec(v.descrizione);
  if (annotazione) return { unita: annotazione[1], proposta: false };
  const famiglia = /^(pannell|modul|batteri|serrament|finestr|zanzarier)/i.exec(descrizione)?.[1].toLowerCase();
  const conteggioDiverso = famiglia && [...descrizione.matchAll(/\b(\d+)\s+(pannell\w*|modul\w*|batteri\w*|serrament\w*|finestr\w*|zanzarier\w*)\b/gi)]
    .some(m => m[2].toLowerCase().startsWith(famiglia) && Number(m[1]) !== v.quantita);
  const oggetto = descrizione.replace(/^fornitura(?: e posa)?(?: in opera)?(?: di)?\s+/i, "");
  if (/^struttura di fissaggio\b/i.test(oggetto) && /fotovoltaic|moduli/i.test(descrizione) && !v.quantita_da_confermare && Number.isInteger(v.quantita) && v.quantita > 0) {
    return { unita: "quota/modulo", proposta: true };
  }
  if (!conteggioDiverso && !/\ba corpo\b|\blotto\b/i.test(descrizione) && !v.quantita_da_confermare && Number.isInteger(v.quantita) && v.quantita > 0 && OGGETTO_CONTABILE_A_PEZZI.test(oggetto)) return { unita: "pz", proposta: true };
  return { unita: null, proposta: false };
}

export function riferimentoContratto(e: ContractExtract): string {
  if (e.riferimento_piano) return e.riferimento_piano;
  return `contratto:${impronta(JSON.stringify([e.cliente.nome_completo, e.data_documento, e.importo_totale_eur,
    e.posizioni_allegato?.map(p => [p.codice, p.quantita, p.dimensioni]), e.voci.map(v => [v.codice, v.descrizione, v.quantita, v.unita])]))}`;
}

function famigliaPosizione(s: string): { key: string; nome: string } | null {
  const n = nome(s);
  if (/zanzarier/.test(n)) return { key: "zanzariere", nome: "Installazione zanzariere" };
  if (/tapparell|avvolgibil|persian|scur[io]\b/.test(n)) return { key: "oscuranti", nome: "Installazione oscuranti" };
  if (/finestr|port[ae]\b|portoncin|serrament|infiss/.test(n)) return { key: "serramenti", nome: "Installazione serramenti" };
  return null;
}

function rigaPosizione(riferimento: string, descrizione: string, specifiche: string | null, q: number): RigaDistintaCalcolata {
  return { chiave: riferimento, descrizione, specifiche, unita_misura: "pz", quantita_netta: q, quantita_calcolata: q,
    sfrido: 0, origine: "computo", origini: [], computo_voce_id: null, scomposizione_id: null,
    planimetria_documento_id: null, planimetria_documento: null, locale: null, categoria: null,
    article_template_id: null, supplier_id: null, phase_id: null, fonte: "fornitura", affidabilita: 1, proposta_ai: false, note: [] };
}

/** Una sola lettura alimenta lavoro e fabbisogno. Non riserva merce e non pianifica date. */
export function pianoOperativoContratto(e: ContractExtract): PianoOperativoContratto {
  const riferimento = riferimentoContratto(e);
  const avvisi: string[] = [];
  const fasi: FaseOperativaContratto[] = [];
  const materiali: MaterialeContratto[] = [];
  const perFase = new Map<string, FaseOperativaContratto>();
  const fase = (key: string, titolo: string, origine: FaseOperativaContratto["origine"] = "documento") => {
    let f = perFase.get(key) ?? fasi.find(f => nome(f.nome) === nome(titolo));
    if (f) perFase.set(key, f);
    if (!f) { f = { riferimento: key, nome: titolo, origine, giorni: null, lavorazioni: [] }; perFase.set(key, f); fasi.push(f); }
    return f;
  };
  const capitoliDichiarati = [...new Set(e.voci.map(v => v.capitolo?.trim()).filter((c): c is string => !!c && !capitoloGenerico(c)))];
  const usaCapitoli = e.voci.length > 0 && e.voci.every(v => v.capitolo?.trim()) && !e.riferimento_piano
    && !(e.fasi_lavoro ?? []).some(f => f.riferimento || Array.isArray(f.lavorazioni));
  // Gli stessi capitoli rinominati dall'AI non aggiungono una seconda lista di fasi.
  const fasiIniziali = usaCapitoli ? capitoliDichiarati.map(c => {
    const f = e.fasi_lavoro?.find(f => chiaveCapitolo(f.nome) === chiaveCapitolo(c));
    return { ...f, nome: c, giorni: f?.giorni ?? null, sottofasi: f?.sottofasi ?? [] };
  }) : (e.fasi_lavoro ?? []).filter(f => f.riferimento || !capitoloGenerico(f.nome));
  for (const f of fasiIniziali) {
    const key = f.riferimento ?? `fase:${nome(f.nome)}`;
    const nuova = fase(key, f.nome, f.origine ?? "documento"); nuova.giorni = f.giorni;
    if (f.lavorazioni?.length) nuova.lavorazioni = f.lavorazioni.map(l => ({ ...l, articolo_riferimenti: [...l.articolo_riferimenti] }));
  }
  const haDettaglioOperativo = (e.fasi_lavoro ?? []).some(f => Array.isArray(f.lavorazioni));
  const aggiungiMateriale = (r: RigaDistintaCalcolata, ref: string, misure?: { larghezza_mm: number | null; altezza_mm: number | null }, verifiche: string[] = []) => {
    const origini: RigaDistintaCalcolata["origini"] = r.origini.length ? r.origini.map(o => o.tipo === "computo"
      ? { tipo: "contratto" as const, documento_ref: riferimento, posizione_ref: o.voce_id, descrizione: o.descrizione, quantita: o.quantita, unita_materiale: r.unita_misura,
        ...(r.verifica_acquisto ?? o.verifica_acquisto ? { verifica_acquisto: r.verifica_acquisto ?? o.verifica_acquisto } : {}),
        ...(r.dati_documentali ?? o.dati_documentali ? { dati_documentali: r.dati_documentali ?? o.dati_documentali } : {}) } : o)
      : [{ tipo: "contratto", documento_ref: riferimento, posizione_ref: r.chiave, descrizione: ref, quantita: r.quantita_calcolata, unita_materiale: r.unita_misura }];
    const collegata = collegaMateriali([{ ...r, origini }], { articoli: [], listini: [], giaUsati: [] })[0];
    materiali.push({ ...collegata, riferimento: ref, larghezza_mm: misure?.larghezza_mm ?? null, altezza_mm: misure?.altezza_mm ?? null, verifiche });
  };

  if (e.posizioni_allegato?.length) {
    const articoli = articoliDalContratto(e).posizioni;
    const posa = e.voci.some(v => /\b(pos[ae]|montaggio|installazione)\b/i.test(senzaCodice(v.descrizione)) && v.natura !== "sconto")
      || /fornitura e posa|fornitura in opera|installazione|montaggio incluso/i.test(e.descrizione_lavori);
    const misto = e.voci.some(v => /sola fornitura|senza (?:posa|montaggio)/i.test(v.descrizione)) && posa;
    if (misto) avvisi.push("Il documento indica sia sola fornitura sia posa compresa: il piano di installazione è una proposta da confermare.");
    const viste = new Set<string>();
    for (const p of articoli) {
      const ref = `${riferimento}:pos:${nome(p.riferimento)}`;
      if (viste.has(ref)) { avvisi.push(`Posizione duplicata da verificare: ${p.riferimento}`); continue; }
      viste.add(ref);
      const famiglia = famigliaPosizione(p.nome);
      const f = e.lavorazioni_escluse ? null : haDettaglioOperativo
        ? fasi.find(f => f.lavorazioni.some(l => l.riferimento === ref)) ?? null
        : posa && famiglia ? fasi.find(f => famigliaPosizione(f.nome)?.key === famiglia.key && /\b(?:posa|installazione|montaggio)\b/i.test(f.nome))
          ?? fase(`posa:${famiglia.key}`, famiglia.nome, "proposta_operativa") : null;
      const note = (e.note_a_mano ?? []).filter(n => !n.riferimento || nome(n.riferimento) === nome(p.riferimento));
      const verifiche = [...(!p.larghezza_mm || !p.altezza_mm ? ["Misure e abbinamento ai vani da confermare"] : []),
        ...note.filter(n => n.contraddice).map(n => `Confermare: ${n.testo}`)];
      const specifiche = note.map(n => n.testo).filter(Boolean).join(" · ") || null;
      const r = { ...rigaPosizione(ref, p.nome, specifiche, p.quantita), phase_id: f?.riferimento ?? null };
      aggiungiMateriale(r, p.riferimento, p, verifiche);
      if (f && !haDettaglioOperativo) f.lavorazioni.push({ riferimento: ref, descrizione: `Posa ${p.nome}`.slice(0, 160), quantita: p.quantita, unita: "pz", articolo_riferimenti: [ref] });
      else if (f) {
        const l = f.lavorazioni.find(l => l.riferimento === ref)!;
        l.quantita = p.quantita; l.unita = "pz"; l.articolo_riferimenti = [ref];
      }
    }
    if (!posa && !haDettaglioOperativo) avvisi.push("L'allegato descrive forniture: la posa non è dichiarata, non sono proposte installazioni automatiche.");
    for (const f of fasi) if (!f.lavorazioni.length) {
      const originale = e.fasi_lavoro?.find(o => nome(o.nome) === nome(f.nome));
      f.lavorazioni = (originale?.sottofasi ?? []).map((s,i): LavorazioneContratto => ({ riferimento: `${riferimento}:${f.riferimento}:${i}`, descrizione: s, quantita: null, unita: null, articolo_riferimenti: [] }));
    }
    return { riferimento, fasi: e.lavorazioni_escluse ? [] : fasi.filter(f => f.lavorazioni.length || !f.riferimento.startsWith("posa:")), materiali, avvisi, vociDaScomporre: 0 };
  }

  const faseVoce = new Map<string, string>();
  const faseUnicaDichiarata = fasiIniziali.length === 1 ? nome(fasiIniziali[0].nome) : null;
  const voci = e.voci.map((v, i) => {
    const codice = v.codice ?? /^([a-z]{2,8}[_ ]\d+(?:\.\d+)+)\b/i.exec(v.descrizione)?.[1] ?? null;
    const ref = `${riferimento}:voce:${codice ? nome(codice) + ":" : ""}${i}`;
    const descrizione = senzaCodice(v.descrizione, v.codice);
    const { unita, proposta: unitaProposta } = unitaDellaVoce(v, descrizione);
    let f = haDettaglioOperativo ? fasi.find(f => f.lavorazioni.some(l => l.riferimento === ref)) ?? null
      : v.capitolo && !capitoloGenerico(v.capitolo) ? fasi.find(f => nome(f.nome) === nome(v.capitolo!) || chiaveCapitolo(f.nome) === chiaveCapitolo(v.capitolo!)) ?? fase(`fase:${nome(v.capitolo)}`, v.capitolo) : null;
    if (!f && !haDettaglioOperativo && faseUnicaDichiarata) f = fasi.find(f => nome(f.nome) === faseUnicaDichiarata) ?? null;
    if (!f && !haDettaglioOperativo && v.natura !== "sconto" && !/^lavoro in economia|tariffa oraria/i.test(descrizione)) {
      const famiglia = famigliaPosizione(descrizione);
      const fotovoltaico = /fotovolt/i.test(e.descrizione_lavori) && /regolator[ei] di carica|concentrator[ei].*batteri|batteri[ae]|commutazione|installazione e collaudo/i.test(descrizione);
      const proposta = fotovoltaico ? "Fotovoltaico, accumulo e ricarica" : faseOperativaDalTesto(descrizione);
      f = famiglia && /\b(?:posa|installazione|montaggio|rimontaggio)\b/i.test(descrizione)
        ? fase(`posa:${famiglia.key}`, famiglia.nome, "proposta_operativa")
        : proposta ? fase(`fase:proposta:${nome(proposta)}`, proposta, "proposta_operativa")
        : fase("fase:da-organizzare", "Lavorazioni da organizzare", "proposta_operativa");
    }
    if (f) faseVoce.set(ref, f.riferimento);
    if (f && !haDettaglioOperativo) f.lavorazioni.push({ riferimento: ref, descrizione: v.descrizione.slice(0, 160), quantita: v.quantita_da_confermare ? null : quantita(v.quantita), unita, articolo_riferimenti: [] });
    else if (f) {
      const l = f.lavorazioni.find(l => l.riferimento === ref)!;
      l.quantita = v.quantita_da_confermare ? null : quantita(v.quantita); l.unita = unita;
    }
    return { id: ref, codice_voce: codice, descrizione_breve: descrizione, unita_misura: unita, quantita: v.quantita_da_confermare ? null : v.quantita,
      categoria: v.capitolo, a_carico_committente: v.a_carico_committente, natura: v.natura, unitaProposta };
  });
  const candidate = voci.filter(v => !v.a_carico_committente && !["servizio", "sconto"].includes(v.natura ?? "") && quantita(v.quantita) !== null);
  // Il motore storico usa pz quando l'unità manca: un contratto non autorizza questa assunzione.
  const senzaUnita = candidate.filter(v => !v.unita_misura?.trim());
  const daScomporre = candidate.filter(v => v.unita_misura?.trim());
  const distinta = generaDistinta({ voci: daScomporre, scomposizioni: [], riserva: catalogoComeScomposizioni(), faseVoce: v => faseVoce.get(v.id) ?? null });
  for (const r0 of distinta.righe) {
    const unitaProposte = r0.origini.flatMap(o => o.tipo === "computo" ? daScomporre.filter(v => v.id === o.voce_id && v.unitaProposta) : []);
    const motivoUnita = "Unità pz proposta per un oggetto contato: non è stampata come U.M. nella riga. Confermala sul documento o con il fornitore prima dell'acquisto.";
    const dati = r0.dati_documentali;
    const r = unitaProposte.length ? { ...r0,
      verifica_acquisto: { stato: "da_verificare" as const, motivi: [...new Set([...(r0.verifica_acquisto?.motivi ?? []), motivoUnita])], campi_mancanti: [...new Set([...(r0.verifica_acquisto?.campi_mancanti ?? []), "unita"])] },
      ...(dati ? { dati_documentali: { ...dati, quantita: "ricostruita" as const,
        fonti: dati.fonti.map(f => unitaProposte.some(v => v.id === f.voce_id) ? { ...f, unita: null } : f),
        dati_mancanti: [...new Set([...dati.dati_mancanti, motivoUnita])] } } : {}) } : r0;
    const ref = `${riferimento}:materiale:${r.chiave}`;
    const verifiche = [...(unitaProposte.length ? [motivoUnita] : []), ...(r.fonte === "libreria_standard" ? ["Resa della libreria da confermare per il prodotto scelto"] : []),
      ...(/colla|collante|stucco|pittura|vernice|fissativo|primer|sottofondo/i.test(r.descrizione) && /^(mq|m2|m²)$/i.test(r.unita_misura) ? ["Resa e unità d'acquisto da confermare: la superficie lavorata non è una quantità in kg o litri"] : [])];
    aggiungiMateriale({ ...r, chiave: ref }, r.descrizione, undefined, verifiche);
    for (const o of r.origini) if (o.tipo === "computo") {
      for (const f of fasi) {
        const l = f.lavorazioni.find(l => l.riferimento === o.voce_id);
        if (l && !l.articolo_riferimenti.includes(ref)) l.articolo_riferimenti.push(ref);
      }
    }
  }
  for (const f of fasi) if (!f.lavorazioni.length) {
    const originale = e.fasi_lavoro?.find(v => nome(v.nome) === nome(f.nome));
    f.lavorazioni = (originale?.sottofasi ?? []).map((s, i): LavorazioneContratto => ({ riferimento: `${riferimento}:${f.riferimento}:${i}`, descrizione: s, quantita: null, unita: null, articolo_riferimenti: [] }));
  }
  if (distinta.senzaScomposizione.length) avvisi.push(`${distinta.senzaScomposizione.length} lavorazioni richiedono ricette o rese validate prima di completare gli acquisti.`);
  const senzaQuantita = e.voci.filter(v => v.quantita_da_confermare);
  if (senzaQuantita.length) avvisi.push(`${senzaQuantita.length} voci senza quantità dichiarata: nessun pezzo è stato inventato per gli acquisti.`);
  if (senzaUnita.length) avvisi.push(`${senzaUnita.length} voci senza unità dichiarata: conferma l'unità prima di generare i materiali.`);
  return { riferimento, fasi: e.lavorazioni_escluse ? [] : fasi, materiali, avvisi, vociDaScomporre: distinta.senzaScomposizione.length + senzaUnita.length };
}

export function fasiOperativePerEstratto(p: PianoOperativoContratto): ContractExtractWorkPhase[] {
  return p.fasi.map(f => ({ nome: f.nome, giorni: f.giorni, sottofasi: f.lavorazioni.map(l => l.descrizione), riferimento: f.riferimento, origine: f.origine, lavorazioni: f.lavorazioni }));
}

export function modelliDalPiano(p: PianoOperativoContratto): FaseModello[] {
  return p.fasi.map(f => ({ nome: f.nome, giorni: f.giorni, riferimento: f.riferimento,
    sottofasi: f.lavorazioni.map(l => ({ nome: l.descrizione, peso: l.quantita && l.unita === "pz" ? Math.min(100, Math.max(1, Math.round(l.quantita))) : 1, riferimento: l.riferimento, quantita: l.quantita, unita: l.unita })) }));
}

/** Articoli lordi, indipendenti da coperture e avanzamento. */
export function articoliDalPiano(p: PianoOperativoContratto) {
  return p.materiali.map((m, position) => ({ name: [m.descrizione, m.specifiche].filter(Boolean).join(" · ").slice(0, 300),
    description: m.verifiche.join("\n"), riferimento: m.riferimento, chiave_materiale: m.chiave, origini: m.origini,
    quantity: m.quantita_calcolata, unita_misura: m.unita_misura, specifiche: m.specifiche, status: "da_ordinare" as const,
    position, unit_price: 0, prezzo_da_definire: true,
    misure_preventivo: m.larghezza_mm && m.altezza_mm ? { larghezza_mm: m.larghezza_mm, altezza_mm: m.altezza_mm, mq: m.larghezza_mm * m.altezza_mm / 1e6 } : null,
    measure_status: m.larghezza_mm && m.altezza_mm || m.verifiche.some(v => /misure/i.test(v)) ? "da_rilevare" as const : null }));
}
