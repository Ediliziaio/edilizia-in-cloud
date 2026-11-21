import { useId } from "react";
import { Warehouse } from "lucide-react";
import { Label } from "@/components/ui/label";
import { UniformSelect } from "@/components/ui/uniform-select";
import {
  ETICHETTE_MAGAZZINO_CAMPO,
  LIVELLI_MAGAZZINO_CAMPO,
  livelloMagazzinoCampo,
  type LivelloMagazzinoCampo,
} from "../../../shared/campo-magazzino";

export function MagazzinoCampoPermission({ value, onChange, readOnly, soloLettura, creation }: {
  value: LivelloMagazzinoCampo | null | undefined;
  onChange: (value: LivelloMagazzinoCampo | null) => void;
  readOnly?: boolean;
  soloLettura?: boolean;
  creation?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <Label htmlFor={id} className="flex items-center gap-2 text-sm font-semibold">
        <Warehouse aria-hidden="true" className="h-4 w-4" />
        Magazzino nell’app operaio
      </Label>
      <UniformSelect
        id={id}
        aria-describedby={`${id}-desc`}
        className="min-h-11 w-full rounded-md border bg-background px-3 text-sm"
        value={value ?? (creation ? "nessuno" : "")}
        disabled={readOnly}
        onChange={(event) => onChange(livelloMagazzinoCampo(event.target.value))}
      >
        {!creation && <option value="">Accesso da ruolo e assegnazioni</option>}
        {LIVELLI_MAGAZZINO_CAMPO.map((livello) => (
          <option key={livello} value={livello}>{ETICHETTE_MAGAZZINO_CAMPO[livello]}</option>
        ))}
      </UniformSelect>
      <p id={`${id}-desc`} className="text-xs text-muted-foreground">
        {soloLettura && value === "prelievi"
          ? "Con Sola lettura l’operaio può consultare le giacenze. Per abilitare i prelievi, togli Sola lettura."
          : "Con Inventario e prelievi l’operaio può registrare il materiale che prende per un cantiere assegnato."}
      </p>
    </div>
  );
}
