import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { METODI_PAGAMENTO_SDI } from "@/types/fatturazione";
import type { EditorState } from "./useEditorState";

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<any>;
  disabled?: boolean;
}

export function EditorPagamentoSection({ state, dispatch, disabled }: Props) {
  function setField(field: string, value: unknown) {
    dispatch({ type: "SET_PAGAMENTO", fields: { [field]: value } });
  }

  return (
    <div className="space-y-3">
      <Label className="text-sm font-semibold">Pagamento</Label>

      <div>
        <Label className="text-xs">Metodo di pagamento</Label>
        <Select
          value={state.metodo_pagamento_codice ?? "MP05"}
          onValueChange={(v) => setField("metodo_pagamento_codice", v)}
          disabled={disabled}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(METODI_PAGAMENTO_SDI).map(([k, v]) => (
              <SelectItem key={k} value={k}>{k} – {v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">IBAN</Label>
          <Input
            value={state.iban_pagamento ?? ""}
            onChange={(e) => setField("iban_pagamento", e.target.value)}
            className="h-8 text-sm font-mono"
            disabled={disabled}
          />
        </div>
        <div>
          <Label className="text-xs">Scadenza</Label>
          <Input
            type="date"
            value={state.data_scadenza ?? ""}
            onChange={(e) => dispatch({ type: "SET_FIELD", field: "data_scadenza", value: e.target.value })}
            className="h-8 text-sm"
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}
