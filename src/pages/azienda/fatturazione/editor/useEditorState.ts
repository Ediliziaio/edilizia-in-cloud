import { useReducer, useEffect, useRef, useState } from "react";
import type {
  DocumentoFiscale,
  RigaDocumento,
  ClienteSnapshot,
  ScadenzaPagamento,
} from "@/types/fatturazione";
import { useUpdateDocumento } from "@/hooks/useDocumentiFiscali";
import { calcolaRiga, calcolaTotaliDocumento } from "@/lib/fatturazione/calcoli";

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
  | { type: "SET_SCADENZE"; scadenze: ScadenzaPagamento[] };

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

/** Il documento si sta scrivendo: bozza, o scartata dallo SDI da correggere. */
function inCorrezione(state: EditorState): boolean {
  if (state.stato === "bozza") return true;
  return String(state.sdi_stato ?? "").toUpperCase() === "NS"
    && !["annullata", "stornata", "in_invio"].includes(String(state.stato));
}

/** Payload completo per l'update: campi utente + totali derivati ricalcolati. */
function buildSavePayload(state: EditorState) {
  return {
    id: state.id!,
    ...pickTracked(state),
    riepilogo_iva: state.riepilogo_iva,
    subtotale: state.subtotale,
    imponibile_totale: state.imponibile_totale,
    iva_totale: state.iva_totale,
    totale_documento: state.totale_documento,
    totale_da_pagare: state.totale_da_pagare,
    ritenuta_importo: state.ritenuta_importo,
    cassa_importo: state.cassa_importo,
    rivalsa_importo: state.rivalsa_importo,
    altra_ritenuta_importo: state.altra_ritenuta_importo,
  } as Partial<DocumentoFiscale> & { id: string };
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

// ─── Reducer ─────────────────────────────────────────────────

function editorReducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case "INIT":
      return recalculate({ ...action.payload, _initialized: true });

    case "SET_FIELD":
      return recalculate({ ...state, [action.field]: action.value });

    case "SET_CLIENTE":
      return recalculate({
        ...state,
        anagrafica_id: action.anagrafica_id,
        cliente_snapshot: action.snapshot,
      });

    case "CLEAR_CLIENTE":
      return recalculate({
        ...state,
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
  const [state, dispatch] = useReducer(editorReducer, {} as EditorState);
  const updateMutation = useUpdateDocumento();
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Serializzazione dei tracked fields all'ultimo salvataggio realmente
  // inviato. null = baseline non ancora stabilita (pre-INIT).
  const lastSavedRef = useRef<string | null>(null);
  const initializedRef = useRef(false);

  // La mutation di react-query cambia identity ad ogni render: letta via ref
  // per non far ri-eseguire l'effect di autosave (il cui cleanup
  // cancellerebbe il timer in corsa — era la causa di salvataggi persi
  // silenziosamente, con isDirty=false e nessun avviso all'uscita).
  const updateMutationRef = useRef(updateMutation);
  updateMutationRef.current = updateMutation;

  // Initialize once when doc loads
  useEffect(() => {
    if (initialDoc && !initializedRef.current) {
      dispatch({ type: "INIT", payload: initialDoc });
      initializedRef.current = true;
    }
  }, [initialDoc]);

  // Autosave con debounce 2s: bozza, o fattura scartata dallo SDI che si sta
  // correggendo (per l'Agenzia non è emessa; il database lascia fermi numero e
  // data, 24/09/2026).
  //
  // Invariante: lastSavedRef riflette ciò che è stato DAVVERO inviato al
  // server, non ciò che è stato schedulato. Se il timer viene cancellato
  // da un re-run dell'effect, il confronto fallisce di nuovo e il
  // salvataggio viene ri-schedulato invece di andare perso.
  useEffect(() => {
    if (!state._initialized || !state.id || !inCorrezione(state)) return;

    const serialized = JSON.stringify(pickTracked(state));

    // Prima esecuzione dopo INIT: stabilisce la baseline senza salvare
    // (il documento appena caricato non ha modifiche).
    if (lastSavedRef.current === null) {
      lastSavedRef.current = serialized;
      return;
    }

    if (serialized === lastSavedRef.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      lastSavedRef.current = serialized;
      updateMutationRef.current.mutate(buildSavePayload(state), {
        onSuccess: () => setLastSaved(new Date()),
        // Save fallito → invalida la baseline: il prossimo change (o
        // saveNow) ritenterà il salvataggio completo.
        onError: () => { lastSavedRef.current = ""; },
      });
    }, 2000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state]);

  const isSaving = updateMutation.isPending;

  // Modifiche non ancora inviate al server
  const isDirty =
    lastSavedRef.current !== null &&
    state._initialized === true &&
    JSON.stringify(pickTracked(state)) !== lastSavedRef.current;

  // Flush autosave and save immediately — returns a Promise so callers can await
  const saveNow = (): Promise<void> => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    if (state._initialized && state.id && inCorrezione(state)) {
      const serialized = JSON.stringify(pickTracked(state));
      return new Promise((resolve, reject) => {
        updateMutationRef.current.mutate(buildSavePayload(state), {
          onSuccess: () => {
            lastSavedRef.current = serialized;
            setLastSaved(new Date());
            resolve();
          },
          onError: (err) => reject(err),
        });
      });
    }
    return Promise.resolve();
  };

  return { state, dispatch, isSaving, lastSaved, isDirty, saveNow };
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
