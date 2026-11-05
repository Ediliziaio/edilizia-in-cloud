/**
 * Lettore dei computi in Excel (.xlsx), nel browser: niente AI, niente costo, niente caricamento.
 * Produce il `ComputoStrutturato` degli altri lettori (PDF di PriMus, XPWE), così `leggiFileComputo`,
 * `bozzaDaComputoStrutturato` e il lettore del popup valgono anche qui.
 *
 * Ogni impresa fa il suo foglio, quindi niente colonne fisse: si cerca la riga d'intestazione
 * per sinonimi («Designazione», «Descrizione»; «Q.tà», «Quantità»; «Prezzo», «unitario»; «Importo»,
 * «Totale»), anche su due righe, in qualsiasi ordine.
 *
 * Una riga, secondo cosa contiene:
 * - numero intero senza unità, quantità né prezzo → capitolo, con l'eventuale totale;
 * - numero decimale (o intero con dei dati) → voce, oppure intestazione se non ha dati e sotto ha dettagli;
 * - senza numero, con dei dati → dettaglio col suo prezzo: è una voce a sé, che prende il nome dal padre;
 * - senza numero, solo testo → sottotitolo, o precisazione nella descrizione della voce sopra;
 * - «Totale», «Sconto», «Netto» → i totali da confrontare; il testo dopo l'ultima voce → note.
 * Senza capitoli numerati, il capitolo è la riga di solo testo in maiuscolo o in grassetto.
 *
 * I numeri non si inventano: quantità vuota e prezzo 0 restano così e la voce si segnala;
 * una formula vale il risultato salvato nel file, mai ricalcolato.
 *
 * `exceljs` si importa solo qui dentro, al momento della lettura: non entra nel bundle principale.
 */
import { arrotonda, controllaTotali, eSicurezza, formatEuro, numeroComputo } from "./computoStrutturato";
import type { ComputoLivello, ComputoRigaRiepilogo, ComputoStrutturato, ComputoVoceStrutturata } from "./computoStrutturato";

export const MESSAGGIO_XLS = "È un foglio Excel vecchio (.xls) o in un altro formato: aprilo in Excel, salvalo come .xlsx e ricaricalo.";
const NON_COMPUTO = "Non sembra un computo";

export const eFoglioXlsx = (nome: string) => /\.(xlsx|xlsm)$/i.test(nome);
export const eFoglioDaConvertire = (nome: string) => /\.(xls|xlsb|ods|csv)$/i.test(nome);

// ── Le celle ─────────────────────────────────────────────────────────────────

export interface Cella {
  /** Vuoto per le celle coperte da una cella unita: il loro valore è di quella in alto a sinistra. */
  testo: string;
  /** Il testo della cella unita che la copre: serve solo all'intestazione. */
  testoUnito: string;
  numero: number | null;
  formulaSenzaRisultato: boolean;
  grassetto: boolean;
}

const CELLA_VUOTA: Cella = { testo: "", testoUnito: "", numero: null, formulaSenzaRisultato: false, grassetto: false };

/** Un numero scritto come testo: «1.234,50», «€ 1200.50», «12.000». */
function numeroDaTesto(testo: string): number | null {
  const t = testo.replace(/€|euro/gi, "").trim();
  const italiano = numeroComputo(t);
  if (italiano !== null) return italiano;
  return /^[+-]?\d+\.\d+$/.test(t) ? Number(t) : null;
}

function valoreCella(v: unknown): { testo: string; numero: number | null; formula: boolean } {
  if (v == null) return { testo: "", numero: null, formula: false };
  if (typeof v === "number") return { testo: String(Number(v.toFixed(6))), numero: Number.isFinite(v) ? v : null, formula: false };
  if (typeof v === "string") {
    const testo = v.replace(/\r/g, "").trim();
    return { testo, numero: numeroDaTesto(testo), formula: false };
  }
  if (typeof v === "boolean") return { testo: String(v), numero: null, formula: false };
  if (v instanceof Date) return { testo: v.toISOString().slice(0, 10), numero: null, formula: false };
  if (typeof v === "object") {
    const o = v as { richText?: Array<{ text?: string }>; text?: unknown; formula?: unknown; sharedFormula?: unknown; result?: unknown };
    if (Array.isArray(o.richText)) return valoreCella(o.richText.map(p => p.text ?? "").join(""));
    if (o.formula !== undefined || o.sharedFormula !== undefined) {
      const risultato = valoreCella(o.result);
      return { ...risultato, formula: !risultato.testo };
    }
    if (o.text !== undefined) return valoreCella(o.text);
  }
  return { testo: "", numero: null, formula: false };
}

// ── L'intestazione ───────────────────────────────────────────────────────────

type Ruolo = "numero" | "codice" | "descrizione" | "unita" | "quantita" | "prezzo" | "importo";
type Colonne = Partial<Record<Ruolo, number>>;

const senzaAccenti = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

function ruoloDi(testo: string): Ruolo | null {
  const s = senzaAccenti(testo).toLowerCase().replace(/\s+/g, " ").trim();
  if (!s || s.length > 40) return null;
  if (/descri|designazione|lavorazion|denominazione|^voc[ei]$|^lavori$|^oggetto$|^opere?$/.test(s)) return "descrizione";
  if (/^u\.? ?m\.?$|unita.*misura|^unita$|^misura$/.test(s)) return "unita";
  if (/unitari|^p\.? ?u\.?$|prezzo unit|costo unit/.test(s)) return "prezzo";
  if (/^q\.? ?t\.? ?a|^qt\.?$|^q\.?$|quantit|^quant\b/.test(s)) return "quantita";
  if (/\btot|importo|somma|ammontare/.test(s)) return "importo";
  if (/prezzo|costo/.test(s)) return "prezzo";
  if (/articolo|^art\b|tariffa|codice|^cod\b|^rif\b/.test(s)) return "codice";
  if (/^(n|nr|num|numero|no|pos|posizione|progr|progressivo|ord|ordine|item|id)\b/.test(s)) return "numero";
  return null;
}

/** Le colonne da uno o più testi per colonna: la prima con quel ruolo vince. */
function colonneDa(testi: string[]): { colonne: Colonne; prezzoECosto: boolean } {
  const colonne: Colonne = {};
  let prezzoECosto = false;
  testi.forEach((t, i) => {
    const r = ruoloDi(t);
    if (!r || colonne[r] !== undefined) return;
    colonne[r] = i;
    if (r === "prezzo") prezzoECosto = /costo/i.test(t);
  });
  return { colonne, prezzoECosto };
}

const bastaPerUnComputo = (c: Colonne) =>
  c.descrizione !== undefined && (c.quantita !== undefined || c.importo !== undefined)
  && [c.unita, c.quantita, c.prezzo, c.importo].filter(x => x !== undefined).length >= 2;

interface Intestazione { riga: number; ultima: number; colonne: Colonne; prezzoECosto: boolean }

/** La riga d'intestazione nelle prime righe; quella sotto conta se è fatta anch'essa di nomi di colonna. */
export function trovaIntestazione(righe: Cella[][]): Intestazione | null {
  for (let r = 0; r < Math.min(righe.length, 60); r++) {
    const riga = righe[r];
    const sotto = righe[r + 1] ?? [];
    const pieneSotto = sotto.filter(c => c.testoUnito);
    const nomiQui = new Set(riga.filter(c => ruoloDi(c.testoUnito)).map(c => c.testoUnito));
    const doppia = nomiQui.size >= 2 && pieneSotto.length >= 2 && sotto.every(c => c.numero === null)
      && pieneSotto.every(c => ruoloDi(c.testoUnito) !== null);
    const testi = riga.map((c, i) => {
      const parti = doppia ? [c.testoUnito, sotto[i]?.testoUnito ?? ""] : [c.testoUnito];
      return [...new Set(parti.filter(Boolean))].join(" ");
    });
    const { colonne, prezzoECosto } = colonneDa(testi);
    if (bastaPerUnComputo(colonne)) return { riga: r, ultima: doppia ? r + 1 : r, colonne, prezzoECosto };
  }
  return null;
}

// ── Il testo prima e dopo le voci ────────────────────────────────────────────

const GENERICO = /^(elenco( delle?)?( lavorazioni| voci| lavori| prezzi)?|computo( metrico)?( estimativo)?|preventivo|stima|lista lavorazioni|riepilogo)$/i;
const NOTA = /^(nota|note|n\.? ?b\.?|attenzione|avvertenz)/i;

function intestazioneDelDocumento(righe: Cella[][]): { metadata: ComputoStrutturato["metadata"]; note: string[] } {
  const metadata: ComputoStrutturato["metadata"] = {};
  const note: string[] = [];
  for (const riga of righe) {
    const testo = riga.find(c => c.testo && c.numero === null)?.testo.replace(/\s+/g, " ");
    if (!testo) continue;
    const campo = /^(committente|cliente|impresa|data|oggetto)\s*:\s*(.+)$/i.exec(testo);
    if (campo) {
      const nome = campo[1].toLowerCase();
      if (nome === "committente" || nome === "cliente") metadata.committente = campo[2];
      else if (nome === "impresa") metadata.impresa = campo[2];
      else if (nome === "data") metadata.data_computo = campo[2];
      else metadata.oggetto_lavori = campo[2];
    } else if (NOTA.test(testo)) note.push(testo);
    else if (GENERICO.test(testo)) continue;
    else if (!metadata.oggetto_lavori) metadata.oggetto_lavori = testo;
    else note.push(testo);
  }
  return { metadata, note };
}

// ── I numeri di riga e i totali ──────────────────────────────────────────────

/** «1» → capitolo possibile; «1.1», «A.1» → voce; «SCAVI» → non è un numero. */
function numeroDiRiga(c: Cella): { testo: string; intero: boolean } | null {
  const t = c.testo.trim();
  if (!t) return null;
  if (c.numero !== null) return { testo: t, intero: Number.isInteger(c.numero) };
  if (/^[A-Z]$/.test(t) || /^[A-Za-z]{0,3}\d+\.?$/.test(t)) return { testo: t.replace(/\.$/, ""), intero: true };
  if (/^[A-Za-z]{0,3}\.?\d*(?:[.\-/][A-Za-z0-9]+)+\.?$/.test(t) && /\d/.test(t)) return { testo: t.replace(/\.$/, ""), intero: false };
  return null;
}

type RigaDiTotale = "sconto" | "netto" | "iva" | "riporto" | "parziale" | "totale";

function rigaDiTotale(testo: string): RigaDiTotale | null {
  const s = senzaAccenti(testo).toLowerCase();
  if (/\b(sconto|ribasso|abbuono)\b/.test(s)) return "sconto";
  if (/\bnett[oi]\b/.test(s)) return "netto";
  if (/\biva\b|\bivat[oa]\b/.test(s)) return "iva";
  if (/\briport/.test(s)) return "riporto";
  if (/^sub ?tot|parziale|tot.*(capitolo|categoria)/.test(s)) return "parziale";
  if (/^tot(ale|\.|\b)|^somma(no)?\b|^importo (dei )?(lavori|totale|complessivo)/.test(s)) return "totale";
  return null;
}

/** Un testo in maiuscolo («SCALE CONDOMINIALI»), non una misura («120 X 135»). */
function inMaiuscolo(testo: string): boolean {
  const lettere = testo.replace(/[^\p{L}]/gu, "");
  return lettere.length >= 4 && lettere === lettere.toLocaleUpperCase("it-IT");
}

const accorcia = (testo: string, max: number) => {
  const riga = testo.split("\n")[0].trim();
  if (riga.length <= max) return riga;
  const pezzo = riga.slice(0, max);
  const spazio = pezzo.lastIndexOf(" ");
  return `${pezzo.slice(0, spazio > max / 2 ? spazio : max).replace(/[\s,;:.-]+$/, "")}…`;
};

const elencoBreve = (numeri: string[], max = 12) => {
  const unici = [...new Set(numeri.filter(Boolean))];
  return `${unici.slice(0, max).join(", ")}${unici.length > max ? "…" : ""}`;
};

// ── Il foglio ────────────────────────────────────────────────────────────────

interface Padre {
  numero: string;
  codice: string;
  descrizione: string;
  importo: number | null;
  /** La voce ha i suoi dati: i dettagli sotto si aggiungono a lei. */
  conDati: boolean;
  /** I dettagli col loro prezzo: l'intestazione senza dati non diventa una voce. */
  figli: number;
  /** Il sottotitolo in corso sotto un'intestazione («Pilastri» sotto «Elevazioni»). */
  sotto: string | null;
  righe: string[];
}

/** Da una griglia di celle al computo. Lancia «Non sembra un computo» se non è un computo. */
export function computoDaGriglia(righe: Cella[][]): ComputoStrutturato {
  const intestazione = trovaIntestazione(righe);
  if (!intestazione) {
    throw new Error(`${NON_COMPUTO}: nel foglio non ho trovato una riga con le colonne (descrizione, quantità, prezzo, importo).`);
  }
  const { colonne } = intestazione;
  const cella = (riga: Cella[], ruolo: Ruolo): Cella => {
    const i = colonne[ruolo];
    return i === undefined ? CELLA_VUOTA : riga[i] ?? CELLA_VUOTA;
  };
  const testoDi = (riga: Cella[]) =>
    cella(riga, "descrizione").testo || cella(riga, "codice").testo
    || (numeroDiRiga(cella(riga, "numero")) ? "" : cella(riga, "numero").testo);
  const conDati = (riga: Cella[]) =>
    !!cella(riga, "unita").testo || cella(riga, "quantita").numero !== null || cella(riga, "prezzo").numero !== null;

  const corpo = righe.slice(intestazione.ultima + 1);
  const eCapitoloNumerato = (riga: Cella[]) => !!numeroDiRiga(cella(riga, "numero"))?.intero && !conDati(riga) && !!testoDi(riga);
  const capitoliNumerati = corpo.some(eCapitoloNumerato);
  let ultimaConDati = -1;
  corpo.forEach((riga, i) => {
    const n = numeroDiRiga(cella(riga, "numero"));
    if (conDati(riga) || (n && !n.intero)) ultimaConDati = i;
  });

  const { metadata, note } = intestazioneDelDocumento(righe.slice(0, intestazione.riga));
  const avvisi: string[] = [];
  const voci: ComputoVoceStrutturata[] = [];
  const totaliCapitoli = new Map<string, ComputoRigaRiepilogo>();
  const numeriVisti = new Set<string>();
  const ripetuti = new Set<string>();
  const st = {
    capitolo: null as ComputoLivello | null,
    sottocategoria: null as ComputoLivello | null,
    padre: null as Padre | null,
    ultima: null as ComputoVoceStrutturata | null,
    totale: null as number | null,
    netto: null as number | null,
    sconto: null as { importo: number; descrizione: string } | null,
    formuleVuote: 0,
  };

  const segnaNumero = (numero: string) => {
    if (numeriVisti.has(numero)) ripetuti.add(numero);
    numeriVisti.add(numero);
  };
  const totaleDelCapitolo = (nome: string, numero: string, importo: number) => {
    const chiave = nome.trim().toLowerCase();
    const c = totaliCapitoli.get(chiave);
    if (c) c.importo = arrotonda(c.importo + importo);
    else totaliCapitoli.set(chiave, { livello: "categoria", codice: numero, nome, importo });
  };
  const nuovaVoce = (v: { numero: string; codice: string; descrizione: string; unita: string; quantita: number | null; prezzo: number | null; importo: number | null }) => {
    const voce: ComputoVoceStrutturata = {
      numero_ordine: v.numero,
      codici: v.codice ? [v.codice] : [],
      codice_tariffa: v.codice,
      descrizione: v.descrizione,
      descrizione_troncata: false,
      unita_misura: v.unita,
      quantita: v.quantita,
      prezzo_unitario: v.prezzo,
      importo: v.importo,
      sezione: null,
      super_categoria: null,
      categoria: st.capitolo,
      sotto_categoria: st.sottocategoria,
      is_sicurezza: eSicurezza(st.capitolo?.nome, st.sottocategoria?.nome),
      is_detrazione: false,
      a_corpo: /corpo|^a\.? ?c\.?$/i.test(v.unita.trim()),
      misure: [],
      pagina: null,
      avvisi: [],
    };
    voci.push(voce);
    return voce;
  };
  /** Un'intestazione rimasta senza dettagli col prezzo è una voce: da definire, ma c'è. */
  const chiudiPadre = () => {
    const p = st.padre;
    if (p && !p.conDati && !p.figli) {
      nuovaVoce({
        numero: p.numero, codice: p.codice, descrizione: [p.descrizione, ...p.righe].join("\n"),
        unita: "", quantita: null, prezzo: null, importo: p.importo,
      });
    }
    st.padre = null;
  };
  const nuovoCapitolo = (nome: string, numero: number | null, codice: string, importo: number | null) => {
    chiudiPadre();
    st.capitolo = { numero, nome };
    st.sottocategoria = null;
    st.ultima = null;
    if (importo !== null) totaleDelCapitolo(nome, codice, importo);
  };
  /** Quantità, prezzo e importo di una riga, contando le formule rimaste senza risultato. */
  const numeriDi = (riga: Cella[]) => {
    const quantita = cella(riga, "quantita").numero;
    const prezzo = cella(riga, "prezzo").numero;
    const cellaImporto = cella(riga, "importo");
    if (cellaImporto.numero === null && cellaImporto.formulaSenzaRisultato && quantita && prezzo) st.formuleVuote++;
    return { unita: cella(riga, "unita").testo, quantita, prezzo, importo: cellaImporto.numero };
  };

  for (const [indice, riga] of corpo.entries()) {
    const testo = testoDi(riga);
    const cellaNumero = cella(riga, "numero");
    const n = numeroDiRiga(cellaNumero);
    const dati = conDati(riga);
    const importo = cella(riga, "importo").numero;
    const dopoLeVoci = indice > ultimaConDati;
    if (!testo && !dati && importo === null) continue;

    // Totali, sconto, netto: righe senza numero e senza dati, con un importo.
    if (!n && !dati && importo !== null) {
      const tipo = rigaDiTotale(testo);
      if (tipo === "sconto") { st.sconto = { importo: arrotonda(Math.abs(importo)), descrizione: accorcia(testo, 120) }; continue; }
      if (tipo === "netto") { st.netto = importo; continue; }
      if (tipo === "parziale" || (tipo === "totale" && !dopoLeVoci)) {
        const c = st.capitolo;
        if (c && !totaliCapitoli.has(c.nome.trim().toLowerCase())) totaleDelCapitolo(c.nome, String(c.numero ?? ""), importo);
        continue;
      }
      if (tipo === "totale" && st.totale === null) { st.totale = importo; continue; }
      if (tipo || dopoLeVoci) { note.push(`Riga non letta: «${accorcia(testo, 80)}» (${formatEuro(importo)} €)`); continue; }
      if (!capitoliNumerati) { nuovoCapitolo(testo.replace(/\s+/g, " "), null, "", importo); continue; }
    }

    // Capitolo numerato: lo stesso numero due volte sono due capitoli, se il nome è diverso.
    if (n?.intero && !dati && testo) {
      segnaNumero(n.testo);
      const numero = Number(n.testo);
      nuovoCapitolo(testo.replace(/\s+/g, " "), Number.isInteger(numero) ? numero : null, n.testo, importo);
      continue;
    }

    // Voce numerata, con i suoi dati o intestazione dei dettagli sotto.
    if (n) {
      segnaNumero(n.testo);
      chiudiPadre();
      const codice = cella(riga, "codice").testo;
      if (!dati) {
        st.padre = { numero: n.testo, codice, descrizione: testo, importo, conDati: false, figli: 0, sotto: null, righe: [] };
        st.ultima = null;
        continue;
      }
      const voce = nuovaVoce({ numero: n.testo, codice, descrizione: testo || "Voce senza descrizione", ...numeriDi(riga) });
      st.ultima = voce;
      st.padre = { numero: n.testo, codice, descrizione: voce.descrizione, importo, conDati: true, figli: 0, sotto: null, righe: [] };
      continue;
    }

    // Dettaglio col suo prezzo: una voce a sé, col nome del padre davanti se da solo non dice cosa sia.
    if (dati || importo !== null) {
      const codice = cella(riga, "codice").testo;
      const dettaglio = cella(riga, "descrizione").testo || codice || "Voce senza descrizione";
      const p = st.padre;
      let descrizione = dettaglio;
      if (p && dettaglio.length < 60) {
        const nomePadre = (p.sotto ?? p.descrizione).trim();
        const breve = accorcia(nomePadre, 50);
        descrizione = `${breve} — ${codice && codice !== dettaglio ? `${codice} ` : ""}${dettaglio}`;
        if (breve !== nomePadre) descrizione += `\n${nomePadre}`;
      }
      if (p) p.figli++;
      st.ultima = nuovaVoce({ numero: p?.numero ?? "", codice: codice || p?.codice || "", descrizione, ...numeriDi(riga) });
      continue;
    }

    // Solo testo.
    const riga1 = testo.replace(/\s+/g, " ");
    const descrizioneVuota = !cella(riga, "descrizione").testo && !cella(riga, "codice").testo;
    if (dopoLeVoci || (descrizioneVuota && !!cellaNumero.testo)) {
      note.push(riga1);
      continue;
    }
    if (!capitoliNumerati) {
      const marcato = inMaiuscolo(riga1) || cella(riga, "descrizione").grassetto || /^(capitolo|categoria|cat\.)/i.test(riga1);
      if (riga1.length <= 120 && (marcato || !st.ultima)) {
        nuovoCapitolo(riga1, null, "", null);
        continue;
      }
    } else if (inMaiuscolo(riga1) || (!st.padre && !st.ultima)) {
      chiudiPadre();
      st.sottocategoria = { numero: null, nome: riga1 };
      st.ultima = null;
      continue;
    }
    const aperto = st.padre;
    if (aperto && !aperto.conDati) {
      aperto.sotto = riga1;
      if (!aperto.figli) aperto.righe.push(riga1);
      continue;
    }
    const sopra = st.ultima;
    if (sopra) {
      const codice = cella(riga, "codice").testo;
      sopra.descrizione += `\n${codice && codice !== riga1 ? `${codice} ` : ""}${riga1}`;
      continue;
    }
    note.push(riga1);
  }
  chiudiPadre();

  if (!voci.length) {
    throw new Error(`${NON_COMPUTO}: ho trovato le colonne, ma sotto non c'è nessuna lavorazione.`);
  }

  // ── Quello che chi legge deve sapere ──
  const { totale, netto, sconto, formuleVuote } = st;
  if (!voci.some(v => v.categoria)) avvisi.push("Il foglio non ha capitoli: tutte le voci finiscono in una fase sola.");
  const daDefinire = voci.filter(v => !v.quantita || !v.prezzo_unitario);
  if (daDefinire.length) {
    const numeri = elencoBreve(daDefinire.map(v => v.numero_ordine));
    avvisi.push(`${daDefinire.length} ${daDefinire.length === 1 ? "voce è" : "voci sono"} da definire, con quantità o prezzo vuoti o a zero${numeri ? ` (${numeri})` : ""}: restano così, e non pesano sull'importo.`);
  }
  if (formuleVuote) avvisi.push(`${formuleVuote} formule non hanno il risultato salvato nel file: apri il foglio in Excel, salvalo e ricaricalo.`);
  const soloImporto = voci.filter(v => v.importo !== null && v.quantita === null && v.prezzo_unitario === null);
  if (soloImporto.length) {
    avvisi.push(`${soloImporto.length} ${soloImporto.length === 1 ? "voce ha" : "voci hanno"} solo l'importo, senza quantità né prezzo: quell'importo non entra nella commessa finché non li scrivi.`);
  }
  if (ripetuti.size) avvisi.push(`Numeri ripetuti nel foglio (${elencoBreve([...ripetuti])}): le voci sono state lette tutte, così come sono.`);

  const riepiloghi = [...totaliCapitoli.values()];
  const controllo = controllaTotali({ voci, totale_dichiarato: totale, riepiloghi });
  for (const c of controllo.capitoli.filter(x => !x.ok)) {
    avvisi.push(`Capitolo «${accorcia(c.nome, 60)}»: le voci sommano ${formatEuro(c.calcolato)} €, il foglio dice ${formatEuro(c.dichiarato)} €.`);
  }
  const conti = controllo.voci.filter(v => v.tipo === "importo");
  if (conti.length) avvisi.push(`${conti.length} ${conti.length === 1 ? "voce ha" : "voci hanno"} un importo diverso da quantità × prezzo (${elencoBreve(conti.map(v => v.numero_ordine))}).`);
  if (totale !== null && controllo.differenza_totale !== null && Math.abs(controllo.differenza_totale) > 0.011) {
    avvisi.push(`Il totale del foglio è ${formatEuro(totale)} €, le voci sommano ${formatEuro(controllo.totale_calcolato)} €.`);
  }
  if (sconto) {
    avvisi.push(`Il foglio ha uno sconto: ${sconto.descrizione}, ${formatEuro(sconto.importo)} €.`);
    if (netto !== null && totale !== null && Math.abs(arrotonda(totale - sconto.importo) - arrotonda(netto)) > 0.011) {
      avvisi.push(`Totale meno sconto non torna col netto del foglio (${formatEuro(netto)} €).`);
    }
  }
  if (intestazione.prezzoECosto) avvisi.push("La colonna dei prezzi si chiama «costo»: se sono i costi dell'impresa, non è l'importo da chiedere al cliente.");
  for (const nota of note) avvisi.push(nota.startsWith("Riga non letta") ? nota : `Nota del foglio: ${accorcia(nota, 300)}`);

  return {
    formato: "excel", metadata, voci, totale_dichiarato: totale, riepiloghi, prezzari: [], avvisi,
    ...(sconto ? { sconto } : {}), ...(netto !== null ? { totale_netto: netto } : {}),
  };
}

/** Un foglio di exceljs come griglia: le celle coperte da una cella unita sono vuote, salvo `testoUnito`. */
function grigliaDelFoglio(foglio: import("exceljs").Worksheet): Cella[][] {
  const colonne = foglio.columnCount;
  const righe: Cella[][] = [];
  for (let r = 1; r <= foglio.rowCount; r++) {
    const riga = foglio.getRow(r);
    const celle: Cella[] = [];
    for (let c = 1; c <= colonne; c++) {
      const cella = riga.getCell(c);
      const coperta = cella.isMerged && cella.master.address !== cella.address;
      const v = valoreCella(cella.master.value);
      celle.push(coperta
        ? { ...CELLA_VUOTA, testoUnito: v.testo }
        : { testo: v.testo, testoUnito: v.testo, numero: v.numero, formulaSenzaRisultato: v.formula, grassetto: !!cella.font?.bold });
    }
    righe.push(celle);
  }
  return righe;
}

export async function leggiComputoExcel(dati: ArrayBuffer): Promise<ComputoStrutturato> {
  // I vecchi .xls e gli Excel protetti da password sono contenitori OLE, non zip.
  const firma = new Uint8Array(dati.slice(0, 4));
  if (firma[0] === 0xd0 && firma[1] === 0xcf) throw new Error(`${MESSAGGIO_XLS} Se è protetto da password, togli prima la password.`);
  if (firma[0] !== 0x50 || firma[1] !== 0x4b) throw new Error("Il file non è un foglio Excel leggibile: aprilo in Excel e salvalo come .xlsx.");

  const ExcelJS = (await import("exceljs")).default;
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(new Uint8Array(dati) as unknown as ArrayBuffer);
  } catch {
    throw new Error("Il file non è un foglio Excel leggibile: aprilo in Excel e salvalo come .xlsx.");
  }
  const fogli = libro.worksheets.filter(f => f.state === "visible" || !f.state);
  let errore: Error | null = null;
  for (const [i, foglio] of fogli.entries()) {
    try {
      const computo = computoDaGriglia(grigliaDelFoglio(foglio));
      const altri = fogli.slice(i + 1).filter(f => trovaIntestazione(grigliaDelFoglio(f))).map(f => f.name);
      if (altri.length) computo.avvisi.push(`Ho letto il foglio «${foglio.name}»; anche ${altri.map(n => `«${n}»`).join(", ")} ${altri.length === 1 ? "sembra" : "sembrano"} un computo e non ${altri.length === 1 ? "è stato letto" : "sono stati letti"}.`);
      return computo;
    } catch (e) {
      errore ??= e instanceof Error ? e : null;
    }
  }
  throw errore ?? new Error(`${NON_COMPUTO}: il file non ha fogli con dei dati.`);
}
