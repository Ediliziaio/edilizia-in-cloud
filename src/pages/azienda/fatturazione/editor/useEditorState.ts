import { normalizzaCliente } from "@/lib/fatturazione/clienteSnapshot";
import { useCallback, useReducer, useEffect, useRef, useState } from "react";
import type {
  DocumentoFiscale,
  RigaDocumento,
  ClienteSnapshot,
  ScadenzaPagamento,
} from "@/types/fatturazione";
import { useUpdateDocumento } from "@/hooks/useDocumentiFiscali";
import { calcolaRiga, calcolaTotaliDocumento } from "@/lib/fatturazione/calcoli";
import { emessaMaiUscita } from "@/lib/fatturazione/correggibile";
import { faseSdi } from "@/lib/fatturazione/sdiCassetto";
import type { UfficioPaFattura } from "@/types/fatturazione";
import {
  allineaRighe, cigValido, colonneCompatibili, cupValido, normalizzaRiferimenti, proponiDallaCommessa,
  type RiferimentoPaFattura,
} from "../../../../../supabase/functions/_shared/riferimentiPaFattura";

// ─── State & Actions ─────────────────────────────────────────

export type EditorState = Partial<DocumentoFiscale> & {
  _initialized?: boolean;
};

export type Action =
  | { type: "INIT"; payload: DocumentoFiscale }
  | { type: "SET_FIELD"; field: string; value: unknown }
  | { type: "SET_CLIENTE"; anagrafica_id: string; snapshot: ClienteSnapshot }
  | { type: "CLEAR_CLIENTE" }
  | { type: "ADD_RIGA"; riga: RigaDocumento }
  | { type: "UPDATE_RIGA"; index: number; riga: Partial<RigaDocumento> }
  | { type: "REMOVE_RIGA"; index: number }
  | { type: "DUPLICATE_RIGA"; index: number }
  | { type: "REORDER_RIGHE"; righe: RigaDocumento[] }
  | { type: "SET_PAGAMENTO"; fields: Record<string, unknown> }
  | { type: "ADD_SCADENZA"; scadenza: ScadenzaPagamento }
  | { type: "UPDATE_SCADENZA"; index: number; scadenza: Partial<ScadenzaPagamento> }
  | { type: "REMOVE_SCADENZA"; index: number }
  | { type: "SET_SCADENZE"; scadenze: ScadenzaPagamento[] }
  /** Riferimenti PA della fattura (lotto 4): contratto, ordine, convenzione, CIG, CUP, righe. */
  | { type: "SET_RIFERIMENTI_PA"; riferimenti: RiferimentoPaFattura[] }
  /** Ufficio PA destinatario: il suo codice diventa il CodiceDestinatario. */
  | { type: "SET_UFFICIO_PA"; ufficio: UfficioPaFattura | null }
  /** Commessa principale della fattura (ordine_id): i riferimenti li sistema chi la cambia. */
  | { type: "SET_COMMESSA"; ordine_id: string | null; riferimenti: RiferimentoPaFattura[] };

// ─── Campi persistiti ────────────────────────────────────────
//
// UNICA fonte di verità per: change-detection dell'autosave, isDirty e
// payload di salvataggio. Prima esistevano tre copie manuali divergenti:
// sconto_globale_valore era nel detection ma non nel payload (sconto a
// valore fisso perso al reload) e cassa_imponibile/cassa_aliquota_iva
// non erano salvati affatto pur essendo usati nei calcoli.

const TRACKED_FIELDS = [
  "righe",
  "cliente_snapshot",
  "anagrafica_id",
  "note_documento",
  "note_interne",
  "data_emissione",
  "data_scadenza",
  "metodo_pagamento_codice",
  "iban_pagamento",
  "bic_pagamento",
  "nome_banca",
  "intestatario_conto",
  "sconto_globale_percentuale",
  "sconto_globale_valore",
  "bollo_virtuale",
  "bollo_importo",
  "ritenuta_acconto",
  "ritenuta_aliquota",
  "ritenuta_tipo",
  "ritenuta_causale",
  "cassa_previdenziale",
  "cassa_tipo",
  "cassa_aliquota",
  "cassa_imponibile",
  "cassa_aliquota_iva",
  "cassa_ritenuta",
  "rivalsa_inps",
  "rivalsa_tipo",
  "rivalsa_aliquota",
  "altra_ritenuta",
  "altra_ritenuta_tipo",
  "altra_ritenuta_aliquota",
  "altra_ritenuta_causale",
  "scadenze_pagamento",
  "serie",
  "causale",
  "cig",
  "cup",
  "arrotondamento",
  "data_validita",
  "probabilita_chiusura",
  "testo_intro",
  "testo_conclusivo",
  "esigibilita_iva",
  "allega_pdf_sdi",
  "emesso_in_seguito_a",
  "codice_commessa_convenzione",
  "riferimenti_pa",
  "ufficio_pa_id",
  "ordine_id",
  "ddt_causale_trasporto",
  "ddt_numero_colli",
  "ddt_peso",
  "ddt_aspetto_beni",
  "ddt_porto",
  "ddt_mezzo_trasporto",
  "ddt_data_ora_consegna",
  "ddt_indirizzo_consegna",
  "ddt_vettore",
] as const;

/** Estrae i soli campi utente persistiti (per serializzazione/confronto). */
function pickTracked(state: EditorState): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of TRACKED_FIELDS) {
    out[f] = state[f as keyof EditorState];
  }
  return out;
}

/** Bozza o documento ancora correggibile nel suo stato attuale. */
function inCorrezione(state: EditorState): boolean {
  if (state.stato === "bozza" || emessaMaiUscita(state)) return true;
  return state.stato !== "stornata" && faseSdi(state)?.fase === "scartata";
}

// Colonne che a database sono uuid, date, timestamp o numeri: una stringa vuota non
// è un valore valido (22P02) e fa rifiutare TUTTO il salvataggio. Il 01/10/2026, a
// Renova, un cliente creato dal modulo portava anagrafica_id = "": da quel momento
// ogni salvataggio della bozza falliva con 400, il lavoro non si salvava e uscendo
// la fattura «spariva». Vuoto = nessun valore (null).
const VUOTO_E_NULL = [
  "anagrafica_id", "data_scadenza", "data_validita", "ddt_data_ora_consegna", "ddt_numero_colli", "probabilita_chiusura",
  "sconto_globale_percentuale", "sconto_globale_valore", "bollo_importo", "ritenuta_aliquota", "cassa_aliquota", "cassa_imponibile",
  "rivalsa_aliquota", "altra_ritenuta_aliquota", "arrotondamento", "ddt_porto",
  "ufficio_pa_id", "ordine_id",
] as const;

/** I totali derivati sono NOT NULL: un NaN (campo numerico svuotato) diventa 0, non null. */
const finito = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Payload completo per l'update: campi utente + totali derivati ricalcolati. */
export function buildSavePayload(state: EditorState) {
  const campi = pickTracked(state);
  // Il cliente rimosso va scritto come oggetto vuoto: la colonna è NOT NULL
  // e il valore undefined verrebbe omesso dall'update, lasciando il vecchio cliente.
  campi.cliente_snapshot = state.cliente_snapshot ?? {};
  for (const k of VUOTO_E_NULL) {
    const v = campi[k];
    if (v === "" || v === undefined || (typeof v === "number" && Number.isNaN(v))) campi[k] = null;
  }
  // Riferimenti PA: righe riallineate agli id delle righe, e le colonne vecchie (cig, cup,
  // codice commessa/convenzione) uguali al primo valore, per elenchi e PDF. L'XML legge
  // riferimenti_pa. Un documento senza riferimenti_pa tiene le colonne vecchie com'erano.
  const riferimenti = allineaRighe(normalizzaRiferimenti(state.riferimenti_pa), (state.righe ?? []) as never);
  campi.riferimenti_pa = riferimenti;
  if (riferimenti.length) Object.assign(campi, colonneCompatibili(riferimenti));
  return {
    id: state.id!,
    ...campi,
    riepilogo_iva: state.riepilogo_iva,
    subtotale: finito(state.subtotale),
    imponibile_totale: finito(state.imponibile_totale),
    iva_totale: finito(state.iva_totale),
    totale_documento: finito(state.totale_documento),
    totale_da_pagare: finito(state.totale_da_pagare),
    ritenuta_importo: finito(state.ritenuta_importo),
    cassa_importo: finito(state.cassa_importo),
    rivalsa_importo: finito(state.rivalsa_importo),
    altra_ritenuta_importo: finito(state.altra_ritenuta_importo),
  } as unknown as Partial<DocumentoFiscale> & { id: string };
}

// ─── Recalculate ─────────────────────────────────────────────

function recalculate(state: EditorState): EditorState {
  const righe = (state.righe ?? []).map(calcolaRiga);

  // Determine split payment: true if esigibilita_iva is 'S' OR if client is PA with split payment
  const splitPayment = state.esigibilita_iva === "S";

  const totali = calcolaTotaliDocumento(righe, {
    scontoGlobalePerc: state.sconto_globale_percentuale,
    scontoGlobaleValore: state.sconto_globale_valore,
    bolloVirtuale: state.bollo_virtuale,
    bolloImporto: state.bollo_importo,
    ritenutaAcconto: state.ritenuta_acconto,
    ritenutaAliquota: state.ritenuta_aliquota,
    cassaPrevidenziale: state.cassa_previdenziale,
    cassaAliquota: state.cassa_aliquota,
    cassaImponibile: state.cassa_imponibile,
    cassaAliquotaIva: state.cassa_aliquota_iva,
    cassaRitenuta: state.cassa_ritenuta,
    rivalsaInps: state.rivalsa_inps,
    rivalsaAliquota: state.rivalsa_aliquota,
    altraRitenuta: state.altra_ritenuta,
    altraRitenutaAliquota: state.altra_ritenuta_aliquota,
    arrotondamento: state.arrotondamento,
    esigibilitaDefault: state.esigibilita_iva as "I" | "D" | "S" | undefined,
    splitPayment: splitPayment,
  });

  return {
    ...state,
    righe,
    subtotale: totali.subtotale,
    sconto_globale_valore: totali.scontoGlobaleValore,
    imponibile_totale: totali.imponibile_totale,
    riepilogo_iva: totali.riepilogo_iva,
    iva_totale: totali.iva_totale,
    totale_documento: totali.totale_documento,
    ritenuta_importo: totali.ritenuta_importo,
    cassa_importo: totali.cassa_importo,
    rivalsa_importo: totali.rivalsa_importo,
    altra_ritenuta_importo: totali.altra_ritenuta_importo,
    totale_da_pagare: totali.totale_da_pagare,
  };
}

// ─── Cambio cliente ──────────────────────────────────────────

const DICITURA_SPLIT = /scissione dei pagamenti|17-ter/i;
const pieno = (v: unknown) => typeof v === "string" ? v.trim() !== "" : v != null;

/**
 * I dati che sulla bozza vengono dal cliente e dal suo appalto: CIG, CUP,
 * codice commessa/convenzione, split payment. Cambiando cliente restavano
 * quelli del precedente (fino al 15/11/2026): la fattura al Comune B portava il
 * CIG del Comune A. Qui l'elenco, in parole, per l'avviso.
 */
export function riferimentiDelCliente(state: EditorState): string[] {
  const out: string[] = [];
  if (pieno(state.cig)) out.push("CIG");
  if (pieno(state.cup)) out.push("CUP");
  if (pieno(state.codice_commessa_convenzione)) out.push("codice commessa/convenzione");
  if (state.esigibilita_iva === "S") out.push("split payment");
  const dallAnagrafica = normalizzaRiferimenti(state.riferimenti_pa).filter((r) => r.origine === "anagrafica").length;
  if (dallAnagrafica) out.push(dallAnagrafica === 1 ? "il riferimento PA dell'anagrafica" : `${dallAnagrafica} riferimenti PA dell'anagrafica`);
  if (state.ufficio_pa_id || state.cliente_snapshot?.ufficio_pa) out.push("ufficio destinatario");
  return out;
}

/** Il cliente sulla bozza diventa un altro (non: lo stesso corretto a mano). */
function eAltroCliente(state: EditorState, anagraficaId: string | undefined): boolean {
  if (!state.cliente_snapshot) return false;
  // «Inserisci a mano» sgancia l'anagrafica ma tiene il cliente: non è un cambio.
  if (!anagraficaId) return false;
  return !!state.anagrafica_id && state.anagrafica_id !== anagraficaId;
}

/**
 * Toglie i riferimenti del cliente precedente. `null` e non `undefined`: il
 * salvataggio deve scriverli vuoti, non saltarli. L'esigibilità torna «da
 * decidere» e la propone di nuovo la sezione Fatturazione elettronica per il
 * cliente nuovo; con lo split se ne va anche la sua dicitura.
 */
export function senzaRiferimentiCliente(state: EditorState): EditorState {
  const causale = Array.isArray(state.causale)
    ? (state.causale as unknown[]).filter((c) => !DICITURA_SPLIT.test(String(c ?? "")))
    : state.causale;
  // Riferimenti venuti dall'anagrafica del cliente precedente: via. Quelli della commessa
  // restano (li controlla la coerenza cliente/commessa), quelli scritti qui pure.
  const riferimenti_pa = normalizzaRiferimenti(state.riferimenti_pa).filter((r) => r.origine !== "anagrafica");
  const conRiferimenti = riferimenti_pa.length > 0;
  return {
    ...state,
    // Con riferimenti_pa le colonne vecchie le riscrive il salvataggio; senza, si svuotano.
    cig: conRiferimenti ? state.cig : null, cup: conRiferimenti ? state.cup : null,
    codice_commessa_convenzione: conRiferimenti ? state.codice_commessa_convenzione : null,
    esigibilita_iva: null,
    causale,
    riferimenti_pa,
    ufficio_pa_id: null,
  } as unknown as EditorState;
}

/**
 * Cliente nuovo dall'anagrafica: se la fattura non ha riferimenti PA e l'anagrafica ha CIG/CUP
 * (vecchi campi del cliente), si propongono come riferimento «dall'anagrafica».
 */
function conRiferimentiAnagrafica(state: EditorState, anagraficaId: string | undefined, snap: ClienteSnapshot): EditorState {
  if (!anagraficaId) return state;
  const attuali = normalizzaRiferimenti(state.riferimenti_pa);
  if (attuali.length || !(cigValido(snap.cig) || cupValido(snap.cup))) return state;
  const proposti = proponiDallaCommessa({ id: "", codice: null }, [], [], { id: anagraficaId, cig: snap.cig, cup: snap.cup })
    .map((r): RiferimentoPaFattura => ({ ...r, order_id: null as string | null }));
  return { ...state, riferimenti_pa: proposti } as EditorState;
}

// ─── Reducer ─────────────────────────────────────────────────

export function editorReducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case "INIT":
      return recalculate({ ...action.payload, _initialized: true });

    case "SET_FIELD":
      return recalculate({
        ...state,
        // Split tolto: la sua dicitura in causale non è più vera.
        ...(action.field === "esigibilita_iva" && action.value !== "S" && Array.isArray(state.causale)
          ? { causale: (state.causale as unknown[]).filter((c) => !DICITURA_SPLIT.test(String(c ?? ""))) as typeof state.causale }
          : {}),
        // Il valore calcolato dalla vecchia percentuale non è uno sconto
        // fisso: va scartato anche quando la percentuale torna a zero.
        ...(action.field === "sconto_globale_percentuale" ? { sconto_globale_valore: 0 } : {}),
        [action.field]: action.value,
      });

    case "SET_CLIENTE": {
      const altro = eAltroCliente(state, action.anagrafica_id || undefined);
      const nuovo = altro || (!state.anagrafica_id && !!action.anagrafica_id);
      const base = altro ? senzaRiferimentiCliente(state) : state;
      // Lo stesso cliente corretto a mano tiene l'ufficio scelto sulla fattura.
      const ufficio = !altro ? state.cliente_snapshot?.ufficio_pa : undefined;
      const snap = normalizzaCliente(action.snapshot);
      return recalculate({
        ...(nuovo ? conRiferimentiAnagrafica(base, action.anagrafica_id || undefined, snap) : base),
        // Cliente nuovo (non ancora in anagrafica): nessun id, mai una stringa vuota.
        anagrafica_id: action.anagrafica_id || undefined,
        // Per un privato la ragione sociale è «Nome Cognome»: sempre allineata.
        cliente_snapshot: ufficio && !snap.ufficio_pa && snap.tipo_cliente === "PA" ? { ...snap, ufficio_pa: ufficio } : snap,
      });
    }

    case "SET_RIFERIMENTI_PA":
      return { ...state, riferimenti_pa: action.riferimenti };

    case "SET_UFFICIO_PA": {
      const snap = state.cliente_snapshot;
      if (!snap) return state;
      if (!action.ufficio) {
        const { ufficio_pa: _tolto, ...resto } = snap;
        return { ...state, ufficio_pa_id: null, cliente_snapshot: resto as ClienteSnapshot } as EditorState;
      }
      return {
        ...state,
        ufficio_pa_id: action.ufficio.id,
        cliente_snapshot: { ...snap, codice_sdi: action.ufficio.codice, ufficio_pa: action.ufficio },
      } as EditorState;
    }

    case "SET_COMMESSA":
      return { ...state, ordine_id: action.ordine_id ?? undefined, riferimenti_pa: action.riferimenti } as EditorState;

    case "CLEAR_CLIENTE":
      return recalculate({
        ...senzaRiferimentiCliente(state),
        anagrafica_id: undefined,
        cliente_snapshot: undefined as unknown as ClienteSnapshot,
      });

    case "ADD_RIGA": {
      const righe = [...(state.righe ?? []), action.riga];
      return recalculate({ ...state, righe });
    }

    case "UPDATE_RIGA": {
      const righe = [...(state.righe ?? [])];
      righe[action.index] = { ...righe[action.index], ...action.riga };
      return recalculate({ ...state, righe });
    }

    case "REMOVE_RIGA": {
      const righe = (state.righe ?? []).filter((_, i) => i !== action.index);
      return recalculate({ ...state, righe });
    }

    case "DUPLICATE_RIGA": {
      const righe = [...(state.righe ?? [])];
      const original = righe[action.index];
      if (original) {
        const dup = { ...original, id: crypto.randomUUID(), numero_linea: righe.length + 1 };
        righe.splice(action.index + 1, 0, dup);
      }
      return recalculate({ ...state, righe });
    }

    case "REORDER_RIGHE":
      return recalculate({
        ...state,
        righe: action.righe.map((r, i) => ({ ...r, numero_linea: i + 1 })),
      });

    case "SET_PAGAMENTO":
      // recalculate: alcuni campi di pagamento influenzano i totali
      // (es. esigibilità/split payment) — prima i totali restavano stantii.
      return recalculate({ ...state, ...action.fields });

    case "ADD_SCADENZA": {
      const scadenze = [...(state.scadenze_pagamento ?? []), action.scadenza];
      return { ...state, scadenze_pagamento: scadenze };
    }

    case "UPDATE_SCADENZA": {
      const scadenze = [...(state.scadenze_pagamento ?? [])];
      scadenze[action.index] = { ...scadenze[action.index], ...action.scadenza };
      return { ...state, scadenze_pagamento: scadenze };
    }

    case "REMOVE_SCADENZA": {
      const scadenze = (state.scadenze_pagamento ?? []).filter((_, i) => i !== action.index);
      return { ...state, scadenze_pagamento: scadenze };
    }

    case "SET_SCADENZE":
      return { ...state, scadenze_pagamento: action.scadenze };

    default:
      return state;
  }
}

// ─── Hook ────────────────────────────────────────────────────

export function useEditorState(initialDoc: DocumentoFiscale | undefined) {
  const [state, aggiorna] = useReducer(editorReducer, {} as EditorState);
  const { mutateAsync, isPending: isSaving } = useUpdateDocumento();
  const [confermato, setConfermato] = useState<{ contenuto: string; data: Date | null } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);
  const letturaRef = useRef(0);
  const codaRef = useRef<{ contenuto: string; lettura: number; esito: Promise<void> } | null>(null);

  const annullaAutosave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const dispatch = useCallback((azione: Action) => {
    if (azione.type === "INIT") {
      annullaAutosave();
      letturaRef.current += 1;
      setConfermato({ contenuto: JSON.stringify(pickTracked(editorReducer({}, azione))), data: null });
    }
    aggiorna(azione);
  }, [annullaAutosave]);

  useEffect(() => {
    if (initialDoc && !initializedRef.current) {
      initializedRef.current = true;
      dispatch({ type: "INIT", payload: initialDoc });
    }
  }, [dispatch, initialDoc]);

  // Salvataggio esplicito e automatico usano la stessa coda. Un autosave lento
  // non può sovrascrivere una versione salvata subito dopo con il pulsante.
  const salva = useCallback((documento: EditorState, contenuto: string) => {
    const lettura = letturaRef.current;
    const precedente = codaRef.current;
    if (precedente?.lettura === lettura && precedente.contenuto === contenuto) return precedente.esito;
    const esito = (async () => {
      if (precedente) await precedente.esito.catch(() => undefined);
      if (lettura !== letturaRef.current) throw new Error("Il documento è stato ricaricato. Riprova a salvare.");
      await mutateAsync(buildSavePayload(documento));
      if (lettura === letturaRef.current) setConfermato({ contenuto, data: new Date() });
    })();
    const operazione = { contenuto, lettura, esito };
    codaRef.current = operazione;
    const termina = () => {
      if (codaRef.current === operazione) codaRef.current = null;
    };
    void esito.then(termina, termina);
    return esito;
  }, [mutateAsync]);

  const contenuto = JSON.stringify(pickTracked(state));
  const isDirty = confermato !== null && contenuto !== confermato.contenuto;
  const puoSalvare = !!state.id && inCorrezione(state);
  useEffect(() => {
    if (!isDirty || !puoSalvare) return;
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void salva(state, contenuto).catch(() => { /* La mutation mostra l'errore. */ });
    }, 2000);
    return annullaAutosave;
  }, [annullaAutosave, contenuto, isDirty, puoSalvare, salva, state]);

  const saveNow = useCallback(async () => {
    annullaAutosave();
    if (puoSalvare) await salva(state, contenuto);
  }, [annullaAutosave, contenuto, puoSalvare, salva, state]);

  return { state, dispatch, isSaving, lastSaved: confermato?.data ?? null, isDirty, puoSalvare, saveNow };
}

export function createEmptyRiga(numero_linea: number): RigaDocumento {
  return {
    id: crypto.randomUUID(),
    numero_linea,
    descrizione: "",
    quantita: 1,
    unita_misura: "pz",
    prezzo_unitario: 0,
    imponibile: 0,
    aliquota_iva: "22",
    imposta: 0,
    totale_riga: 0,
  };
}
