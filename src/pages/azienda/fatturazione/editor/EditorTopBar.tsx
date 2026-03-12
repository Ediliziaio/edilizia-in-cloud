import { ArrowLeft, Check, Clock, Loader2, Send, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { EditorState } from "./useEditorState";
import type { TipoDocumento } from "@/types/fatturazione";

const TIPO_LABELS: Record<TipoDocumento, string> = {
  fattura: "Fattura",
  fattura_pa: "Fattura PA",
  nota_credito: "Nota di Credito",
  nota_debito: "Nota di Debito",
  autofattura: "Autofattura",
  fattura_riepilogativa: "Fatt. Riepilogativa",
  proforma: "Proforma",
  preventivo: "Preventivo",
  ddt: "DDT",
};

interface Props {
  state: EditorState;
  isSaving: boolean;
  lastSaved: Date | null;
  onEmetti: () => void;
  onDelete: () => void;
  onFieldChange: (field: string, value: unknown) => void;
}

export function EditorTopBar({ state, isSaving, lastSaved, onEmetti, onDelete, onFieldChange }: Props) {
  const navigate = useNavigate();
  const tipo = state.tipo as TipoDocumento;
  const isBozza = state.stato === "bozza";

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-card shrink-0">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => navigate("/azienda/documenti")}
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>

      <Badge variant="outline" className="font-semibold text-xs uppercase tracking-wide">
        {TIPO_LABELS[tipo] ?? tipo}
      </Badge>

      <span className="font-mono text-sm font-medium text-foreground">
        {state.numero}
      </span>

      <div className="flex items-center gap-2 ml-2">
        <label className="text-xs text-muted-foreground">Data:</label>
        <Input
          type="date"
          value={state.data_emissione ?? ""}
          onChange={(e) => onFieldChange("data_emissione", e.target.value)}
          className="h-7 w-36 text-xs"
          disabled={!isBozza}
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Autosave indicator */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {isSaving ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Salvataggio...</span>
            </>
          ) : lastSaved ? (
            <>
              <Check className="h-3 w-3 text-success" />
              <span>Salvato</span>
            </>
          ) : (
            <>
              <Clock className="h-3 w-3" />
              <span>Non salvato</span>
            </>
          )}
        </div>

        {isBozza && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive h-8"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Elimina
            </Button>
            <Button size="sm" className="h-8" onClick={onEmetti}>
              <Send className="h-3.5 w-3.5 mr-1" />
              Emetti
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
