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

type Action =
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

// ─── Recalculate ─────────────────────────────────────────────

function recalculate(state: EditorState): EditorState {
  const righe = (state.righe ?? []).map(calcolaRiga);

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
    arrotondamento: state.arrotondamento,
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
    totale_da_pagare: totali.totale_da_pagare,
  };
}

// ─── Reducer ─────────────────────────────────────────────────

function editorReducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case "INIT":
      return { ...action.payload, _initialized: true };

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
      return { ...state, ...action.fields };

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
  const prevStateRef = useRef<string>("");
  const initializedRef = useRef(false);

  // Initialize once when doc loads
  useEffect(() => {
    if (initialDoc && !initializedRef.current) {
      dispatch({ type: "INIT", payload: initialDoc });
      initializedRef.current = true;
    }
  }, [initialDoc]);

  // Autosave with 2s debounce (only bozza)
  useEffect(() => {
    if (!state._initialized || !state.id || state.stato !== "bozza") return;

    const serialized = JSON.stringify({
      righe: state.righe,
      cliente_snapshot: state.cliente_snapshot,
      anagrafica_id: state.anagrafica_id,
      note_documento: state.note_documento,
      note_interne: state.note_interne,
      data_emissione: state.data_emissione,
      data_scadenza: state.data_scadenza,
      metodo_pagamento_codice: state.metodo_pagamento_codice,
      iban_pagamento: state.iban_pagamento,
      bic_pagamento: state.bic_pagamento,
      nome_banca: state.nome_banca,
      intestatario_conto: state.intestatario_conto,
      sconto_globale_percentuale: state.sconto_globale_percentuale,
      bollo_virtuale: state.bollo_virtuale,
      ritenuta_acconto: state.ritenuta_acconto,
      ritenuta_aliquota: state.ritenuta_aliquota,
      ritenuta_tipo: state.ritenuta_tipo,
      ritenuta_causale: state.ritenuta_causale,
      cassa_previdenziale: state.cassa_previdenziale,
      cassa_tipo: state.cassa_tipo,
      cassa_aliquota: state.cassa_aliquota,
      scadenze_pagamento: state.scadenze_pagamento,
      serie: state.serie,
      causale: state.causale,
      cig: state.cig,
      cup: state.cup,
      arrotondamento: state.arrotondamento,
      data_validita: state.data_validita,
    });

    if (serialized === prevStateRef.current) return;
    prevStateRef.current = serialized;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      updateMutation.mutate(
        {
          id: state.id!,
          righe: state.righe,
          riepilogo_iva: state.riepilogo_iva,
          cliente_snapshot: state.cliente_snapshot,
          anagrafica_id: state.anagrafica_id,
          subtotale: state.subtotale,
          imponibile_totale: state.imponibile_totale,
          iva_totale: state.iva_totale,
          totale_documento: state.totale_documento,
          totale_da_pagare: state.totale_da_pagare,
          ritenuta_importo: state.ritenuta_importo,
          cassa_importo: state.cassa_importo,
          note_documento: state.note_documento,
          note_interne: state.note_interne,
          data_emissione: state.data_emissione,
          data_scadenza: state.data_scadenza,
          metodo_pagamento_codice: state.metodo_pagamento_codice,
          iban_pagamento: state.iban_pagamento,
          bic_pagamento: state.bic_pagamento,
          nome_banca: state.nome_banca,
          intestatario_conto: state.intestatario_conto,
          sconto_globale_percentuale: state.sconto_globale_percentuale,
          bollo_virtuale: state.bollo_virtuale,
          bollo_importo: state.bollo_importo,
          ritenuta_acconto: state.ritenuta_acconto,
          ritenuta_aliquota: state.ritenuta_aliquota,
          ritenuta_tipo: state.ritenuta_tipo,
          ritenuta_causale: state.ritenuta_causale,
          cassa_previdenziale: state.cassa_previdenziale,
          cassa_tipo: state.cassa_tipo,
          cassa_aliquota: state.cassa_aliquota,
          scadenze_pagamento: state.scadenze_pagamento,
          serie: state.serie,
          causale: state.causale,
           cig: state.cig,
          cup: state.cup,
           arrotondamento: state.arrotondamento,
          data_validita: state.data_validita,
        },
        { onSuccess: () => setLastSaved(new Date()) }
      );
    }, 2000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state, updateMutation]);

  const isSaving = updateMutation.isPending;

  return { state, dispatch, isSaving, lastSaved };
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
