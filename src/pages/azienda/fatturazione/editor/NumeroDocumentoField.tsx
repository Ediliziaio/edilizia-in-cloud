/**
 * Il numero della fattura, vero già sulla bozza (01/10/2026): il cliente può
 * pagare citandolo prima che la fattura parta per lo SDI.
 *
 * Finché è bozza si cambia a mano (es. se l'ultimo numero emesso con il vecchio
 * programma non è quello atteso). Lo fa il database con documento_assegna_numero,
 * che rifiuta un numero già usato nella serie (fatture e, se la serie è unica,
 * note di credito). Le bozze nate prima col segnaposto «Bozza XXXXXXXX» prendono
 * il numero appena si aprono. Il salvataggio dell'editor non scrive mai il
 * numero (non è fra i campi salvati): qui lo si aggiorna solo nello stato.
 */
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import type { EditorState, Action } from "./useEditorState";

/** I documenti che vanno allo SDI: il loro numero nasce con la bozza. */
export const TIPI_NUMERO_SULLA_BOZZA = [
  "fattura", "fattura_pa", "nota_credito", "nota_debito", "autofattura", "fattura_riepilogativa",
];

export const haSegnapostoBozza = (numero?: string | null) => (numero ?? "").startsWith("Bozza ");

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<Action>;
  disabled?: boolean;
}

type NumeroAssegnato = { numero?: string; numero_progressivo?: number; anno?: number };

export function NumeroDocumentoField({ state, dispatch, disabled }: Props) {
  const queryClient = useQueryClient();
  const [inModifica, setInModifica] = useState(false);
  const [valore, setValore] = useState("");
  const [salvando, setSalvando] = useState(false);
  const assegnazioneTentata = useRef<string | null>(null);

  const numerataSullaBozza = state.stato === "bozza" && TIPI_NUMERO_SULLA_BOZZA.includes(state.tipo);
  const modificabile = !disabled && numerataSullaBozza && !!state.id && !haSegnapostoBozza(state.numero);

  const applica = (r: NumeroAssegnato) => {
    if (r.numero) dispatch({ type: "SET_FIELD", field: "numero", value: r.numero });
    if (r.numero_progressivo != null) dispatch({ type: "SET_FIELD", field: "numero_progressivo", value: r.numero_progressivo });
    if (r.anno != null) dispatch({ type: "SET_FIELD", field: "anno", value: r.anno });
    queryClient.invalidateQueries({ queryKey: queryKeys.documentiFiscali.all });
  };

  const assegna = async (progressivo: number | null) => {
    const { data, error } = await supabase.rpc("documento_assegna_numero" as never, {
      p_documento_id: state.id,
      ...(progressivo != null && { p_numero_progressivo: progressivo }),
    } as never);
    if (error) throw new Error(error.message);
    return (data ?? {}) as NumeroAssegnato;
  };

  // Bozza nata col segnaposto (prima del 01/10/2026): prende subito il suo numero.
  useEffect(() => {
    if (!state.id || !numerataSullaBozza || !haSegnapostoBozza(state.numero)) return;
    if (assegnazioneTentata.current === state.id) return;
    assegnazioneTentata.current = state.id;
    assegna(null)
      .then(applica)
      .catch((e: Error) => toast.error("Numero della fattura non assegnato", { description: e.message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- una volta per bozza
  }, [state.id, state.numero, numerataSullaBozza]);

  const apri = () => {
    setValore(state.numero_progressivo ? String(state.numero_progressivo) : "");
    setInModifica(true);
  };

  const salva = async () => {
    const n = Number(valore);
    if (!Number.isInteger(n) || n < 1) {
      toast.error("Scrivi il numero progressivo (es. 73)");
      return;
    }
    setSalvando(true);
    try {
      const r = await assegna(n);
      applica(r);
      setInModifica(false);
      toast.success(`Numero cambiato: ${r.numero ?? n}`);
    } catch (e) {
      toast.error("Numero non cambiato", { description: (e as Error).message });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div>
      <Label className="text-[10px] text-muted-foreground">Numero</Label>
      {inModifica ? (
        <div className="flex gap-1">
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            value={valore}
            onChange={(e) => setValore(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void salva();
              if (e.key === "Escape") setInModifica(false);
            }}
            className="h-7 text-xs font-mono"
            aria-label="Numero progressivo della fattura"
            autoFocus
          />
          <Button size="sm" className="h-7 px-2 text-[11px]" onClick={() => void salva()} disabled={salvando}>
            {salvando ? <Loader2 className="h-3 w-3 animate-spin" /> : "OK"}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => setInModifica(false)} disabled={salvando}>
            Annulla
          </Button>
        </div>
      ) : (
        <div className="flex gap-1">
          <Input
            value={haSegnapostoBozza(state.numero) && numerataSullaBozza ? "Assegnazione…" : state.numero ?? ""}
            readOnly
            className="h-7 text-xs font-mono bg-muted/50"
          />
          {modificabile && (
            <Button
              size="icon"
              variant="outline"
              className="h-7 w-7 shrink-0"
              onClick={apri}
              aria-label="Cambia il numero della fattura"
              title="Cambia il numero della fattura"
            >
              <Pencil className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
