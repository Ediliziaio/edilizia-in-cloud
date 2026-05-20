/**
 * EditorDDTOpzioniCard — card compatto "Opzioni avanzate" per DDT,
 * layout ispirato a Fatture in Cloud:
 *   Colli, Peso, Causale trasporto, Luogo destinazione,
 *   Trasporto a cura di, Annotazioni
 *
 * I dettagli trasporto avanzati (subappaltatore + conducente + targa)
 * sono gestiti da EditorDDTSection — questo card copre i campi
 * essenziali del documento.
 */
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCallback, useMemo } from "react";
import type { EditorState, Action } from "./useEditorState";

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<Action>;
  disabled?: boolean;
}

export function EditorDDTOpzioniCard({ state, dispatch, disabled }: Props) {
  const setField = useCallback(
    (field: string, value: unknown) => dispatch({ type: "SET_FIELD", field, value }),
    [dispatch],
  );

  // Read-only summary del luogo destinazione: mostra i campi strutturati
  // se presenti, altrimenti il free_text. Memoizzato per evitare ricomputo.
  const indirizzoConsegnaFreeText = useMemo(() => {
    const ic = (state.ddt_indirizzo_consegna ?? null) as Record<string, unknown> | null;
    if (!ic) return "";
    if (typeof ic.free_text === "string") return ic.free_text;
    const parts = [
      ic.address ?? ic.via,
      ic.postal_code ?? ic.cap,
      ic.city ?? ic.citta ?? ic.comune,
      ic.province ?? ic.provincia,
    ].filter((p) => typeof p === "string" && p.length > 0);
    return parts.join(", ");
  }, [state.ddt_indirizzo_consegna]);

  const trasportoFreeText = useMemo(() => {
    const dv = (state.ddt_vettore ?? null) as Record<string, unknown> | null;
    if (!dv) return "";
    if (typeof dv.free_text === "string") return dv.free_text;
    const ragione = (dv.ragione_sociale ?? dv.denominazione) as string | undefined;
    const cond = dv.conducente_nome as string | undefined;
    const targa = dv.targa_mezzo as string | undefined;
    if (!ragione && !cond && !targa) return "";
    const parts = [ragione, cond ? `Conducente: ${cond}` : null, targa ? `Targa ${targa}` : null].filter(Boolean);
    return parts.join(" — ");
  }, [state.ddt_vettore]);

  // CRITICAL: preserva i campi strutturati esistenti, sovrascrive SOLO free_text.
  // Bug pregresso: setField sostituiva l'intero oggetto distruggendo i campi
  // compilati dal collapsible "Dettagli trasporto avanzati" (via, comune, ecc).
  const handleLuogoChange = useCallback(
    (val: string) => {
      const current = (state.ddt_indirizzo_consegna ?? {}) as Record<string, unknown>;
      const trimmed = val.trim();
      if (!trimmed) {
        // Rimuovi solo free_text; se ci sono altri campi strutturati, mantienili
        if (current && Object.keys(current).some((k) => k !== "free_text")) {
          const { free_text: _ft, ...rest } = current;
          dispatch({ type: "SET_FIELD", field: "ddt_indirizzo_consegna", value: rest });
        } else {
          dispatch({ type: "SET_FIELD", field: "ddt_indirizzo_consegna", value: null });
        }
        return;
      }
      dispatch({ type: "SET_FIELD", field: "ddt_indirizzo_consegna", value: { ...current, free_text: trimmed } });
    },
    [state.ddt_indirizzo_consegna, dispatch],
  );

  const handleTrasportoChange = useCallback(
    (val: string) => {
      const current = (state.ddt_vettore ?? {}) as Record<string, unknown>;
      const trimmed = val.trim();
      if (!trimmed) {
        const { free_text: _ft, ...rest } = current;
        const hasOther = Object.keys(rest).length > 0;
        dispatch({ type: "SET_FIELD", field: "ddt_vettore", value: hasOther ? rest : null });
        return;
      }
      dispatch({ type: "SET_FIELD", field: "ddt_vettore", value: { ...current, free_text: trimmed } });
    },
    [state.ddt_vettore, dispatch],
  );

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3 border-l-[3px] border-l-sky-400/60 shadow-sm">
      <Label className="text-[11px] font-bold uppercase tracking-wider text-sky-600/80 dark:text-sky-400/80">
        Opzioni avanzate
      </Label>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] text-muted-foreground">Colli</Label>
          <Input
            type="number"
            min={0}
            value={state.ddt_numero_colli ?? ""}
            onChange={(e) =>
              setField("ddt_numero_colli", e.target.value ? Number(e.target.value) : null)
            }
            disabled={disabled}
            className="h-7 text-xs"
          />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">Peso</Label>
          <Input
            placeholder="0 kg"
            value={state.ddt_peso ?? ""}
            onChange={(e) => setField("ddt_peso", e.target.value)}
            disabled={disabled}
            className="h-7 text-xs"
          />
        </div>
      </div>

      <div>
        <Label className="text-[10px] text-muted-foreground">Causale trasporto</Label>
        <Textarea
          rows={2}
          value={state.ddt_causale_trasporto ?? ""}
          onChange={(e) => setField("ddt_causale_trasporto", e.target.value)}
          disabled={disabled}
          className="text-xs resize-none"
        />
      </div>

      <div>
        <Label className="text-[10px] text-muted-foreground">Luogo di destinazione</Label>
        <Textarea
          rows={2}
          value={indirizzoConsegnaFreeText}
          onChange={(e) => handleLuogoChange(e.target.value)}
          disabled={disabled}
          className="text-xs resize-none"
        />
      </div>

      <div>
        <Label className="text-[10px] text-muted-foreground">Trasporto a cura di</Label>
        <Textarea
          rows={2}
          value={trasportoFreeText}
          onChange={(e) => handleTrasportoChange(e.target.value)}
          disabled={disabled}
          className="text-xs resize-none"
          placeholder="Mittente, vettore terzo, subappaltatore…"
        />
      </div>

      <div>
        <Label className="text-[10px] text-muted-foreground">Annotazioni</Label>
        <Textarea
          rows={2}
          value={state.note_documento ?? ""}
          onChange={(e) => setField("note_documento", e.target.value)}
          disabled={disabled}
          className="text-xs resize-none"
        />
      </div>
    </div>
  );
}
