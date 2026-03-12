import { useReducer, useEffect, useRef, useCallback, useState } from "react";
import type {
  DocumentoFiscale,
  RigaDocumento,
  RiepilogoIVA,
  ClienteSnapshot,
} from "@/types/fatturazione";
import { useUpdateDocumento } from "@/hooks/useDocumentiFiscali";

// ─── State & Actions ─────────────────────────────────────────

export type EditorState = Partial<DocumentoFiscale> & {
  _initialized?: boolean;
};

type Action =
  | { type: "INIT"; payload: DocumentoFiscale }
  | { type: "SET_FIELD"; field: string; value: unknown }
  | { type: "SET_CLIENTE"; anagrafica_id: string; snapshot: ClienteSnapshot }
  | { type: "ADD_RIGA"; riga: RigaDocumento }
  | { type: "UPDATE_RIGA"; index: number; riga: Partial<RigaDocumento> }
  | { type: "REMOVE_RIGA"; index: number }
  | { type: "SET_PAGAMENTO"; fields: Record<string, unknown> };

// ─── Calculation helpers ─────────────────────────────────────

function calcRigaTotals(r: RigaDocumento): RigaDocumento {
  const base = r.prezzo_unitario * r.quantita;
  const scontoVal = r.sconto_percentuale ? base * (r.sconto_percentuale / 100) : (r.sconto_valore ?? 0);
  const imponibile = Math.round((base - scontoVal) * 100) / 100;
  const aliquota = parseFloat(r.aliquota_iva) || 0;
  const imposta = r.natura_iva ? 0 : Math.round(imponibile * (aliquota / 100) * 100) / 100;
  return {
    ...r,
    imponibile,
    imposta,
    totale_riga: Math.round((imponibile + imposta) * 100) / 100,
  };
}

function recalculate(state: EditorState): EditorState {
  const righe = (state.righe ?? []).map(calcRigaTotals);

  const subtotale = righe.reduce((s, r) => s + r.imponibile, 0);
  const scontoGlobaleValore = state.sconto_globale_percentuale
    ? Math.round(subtotale * (state.sconto_globale_percentuale / 100) * 100) / 100
    : (state.sconto_globale_valore ?? 0);

  const imponibile_totale = Math.round((subtotale - scontoGlobaleValore) * 100) / 100;

  // Build riepilogo IVA
  const ivaMap = new Map<string, RiepilogoIVA>();
  for (const r of righe) {
    const key = r.natura_iva || r.aliquota_iva;
    const existing = ivaMap.get(key);
    if (existing) {
      existing.imponibile += r.imponibile;
      existing.imposta += r.imposta;
    } else {
      ivaMap.set(key, {
        aliquota: r.aliquota_iva,
        natura: r.natura_iva,
        imponibile: r.imponibile,
        imposta: r.imposta,
        esigibilita: "I" as const,
      });
    }
  }
  const riepilogo_iva = Array.from(ivaMap.values()).map((r) => ({
    ...r,
    imponibile: Math.round(r.imponibile * 100) / 100,
    imposta: Math.round(r.imposta * 100) / 100,
  }));

  const iva_totale = riepilogo_iva.reduce((s, r) => s + r.imposta, 0);
  const totale_documento = Math.round((imponibile_totale + iva_totale + (state.arrotondamento ?? 0)) * 100) / 100;

  // Bollo
  const bollo = state.bollo_virtuale ? (state.bollo_importo ?? 2) : 0;

  // Ritenuta
  const ritenuta_importo = state.ritenuta_acconto && state.ritenuta_aliquota
    ? Math.round(imponibile_totale * (state.ritenuta_aliquota / 100) * 100) / 100
    : 0;

  // Cassa previdenziale
  const cassa_importo = state.cassa_previdenziale && state.cassa_aliquota
    ? Math.round((state.cassa_imponibile ?? imponibile_totale) * (state.cassa_aliquota / 100) * 100) / 100
    : 0;

  const totale_da_pagare = Math.round(
    (totale_documento + bollo + cassa_importo - ritenuta_importo) * 100
  ) / 100;

  return {
    ...state,
    righe,
    subtotale,
    sconto_globale_valore: scontoGlobaleValore,
    imponibile_totale,
    riepilogo_iva,
    iva_totale,
    totale_documento,
    ritenuta_importo,
    cassa_importo,
    totale_da_pagare,
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

    case "SET_PAGAMENTO":
      return { ...state, ...action.fields };

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
      sconto_globale_percentuale: state.sconto_globale_percentuale,
      bollo_virtuale: state.bollo_virtuale,
      ritenuta_acconto: state.ritenuta_acconto,
      ritenuta_aliquota: state.ritenuta_aliquota,
      ritenuta_tipo: state.ritenuta_tipo,
      ritenuta_causale: state.ritenuta_causale,
      cassa_previdenziale: state.cassa_previdenziale,
      cassa_tipo: state.cassa_tipo,
      cassa_aliquota: state.cassa_aliquota,
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
        },
        { onSuccess: () => setLastSaved(new Date()) }
      );
    }, 2000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state, updateMutation]);

  const isDirty = prevStateRef.current !== "" && !updateMutation.isPending;
  const isSaving = updateMutation.isPending;

  return { state, dispatch, isDirty, isSaving, lastSaved };
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
