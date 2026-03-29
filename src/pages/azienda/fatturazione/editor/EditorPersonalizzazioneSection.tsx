import { Palette, Eye } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { EditorState } from "./useEditorState";

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<any>;
  disabled?: boolean;
}

export function EditorPersonalizzazioneSection({ state, dispatch, disabled }: Props) {
  function setField(field: string, value: unknown) {
    dispatch({ type: "SET_FIELD", field, value });
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3 shadow-sm">
      <div className="flex items-center gap-2">
        <Palette className="h-4 w-4 text-purple-500" />
        <Label className="text-[11px] font-bold uppercase tracking-wider text-purple-600/80 dark:text-purple-400/80">
          Personalizzazione
        </Label>
      </div>

      {/* ─── Modello grafico ─── */}
      <div>
        <Label className="text-[10px] text-muted-foreground">Modello grafico</Label>
        <Select
          value={(state as any).modello_grafico ?? "Standard"}
          onValueChange={(v) => setField("modello_grafico", v)}
          disabled={disabled}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Standard" className="text-xs">Standard</SelectItem>
            <SelectItem value="Light Smoke" className="text-xs">Light Smoke</SelectItem>
            <SelectItem value="Professional" className="text-xs">Professional</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ─── Margini orizzontali ─── */}
      <div>
        <Label className="text-[10px] text-muted-foreground">Margini orizzontali</Label>
        <Select
          value={(state as any).margini_orizzontali ?? "15mm"}
          onValueChange={(v) => setField("margini_orizzontali", v)}
          disabled={disabled}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10mm" className="text-xs">10 mm</SelectItem>
            <SelectItem value="15mm" className="text-xs">15 mm</SelectItem>
            <SelectItem value="20mm" className="text-xs">20 mm</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ─── Margini verticali ─── */}
      <div>
        <Label className="text-[10px] text-muted-foreground">Margini verticali</Label>
        <Select
          value={(state as any).margini_verticali ?? "15mm"}
          onValueChange={(v) => setField("margini_verticali", v)}
          disabled={disabled}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10mm" className="text-xs">10 mm</SelectItem>
            <SelectItem value="15mm" className="text-xs">15 mm</SelectItem>
            <SelectItem value="16mm" className="text-xs">16 mm</SelectItem>
            <SelectItem value="20mm" className="text-xs">20 mm</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ─── Mostra scadenze ─── */}
      <div className="flex items-center gap-2 pt-1">
        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
        <Switch
          checked={(state as any).mostra_scadenze ?? true}
          onCheckedChange={(v) => setField("mostra_scadenze", v)}
          disabled={disabled}
        />
        <Label className="text-xs text-muted-foreground cursor-pointer">Mostra scadenze nel PDF</Label>
      </div>
    </div>
  );
}
