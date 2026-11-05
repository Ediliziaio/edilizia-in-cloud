/**
 * I campi propri dell'azienda da compilare: nell'app di cantiere e nella finestra dell'ufficio. Usa lo stesso
 * FieldRenderer dei sopralluoghi; i valori restano a chi lo usa e si salvano con il documento.
 */
import { useMemo } from "react";
import { FieldRenderer } from "@/components/surveys/engine/FieldRenderer";
import type { FieldDefinition } from "@/types/surveys";
import { chiaveValore, type CampoModulo } from "../../../supabase/functions/_shared/moduliCantiere";

interface Props {
  campi: CampoModulo[];
  valori: Record<string, unknown>;
  onChange: (chiave: string, valore: unknown) => void;
  mostraErrori?: boolean;
  /** I campi di una fase: ogni valore ha la sua chiave per quella fase. */
  phaseId?: string;
}

export function comeDefinizione(c: CampoModulo, chiave: string): FieldDefinition {
  return {
    key: chiave,
    label: c.etichetta,
    type: c.tipo,
    required: c.obbligatorio,
    ...(c.aiuto ? { help: c.aiuto } : {}),
    ...(c.opzioni ? { options: c.opzioni.map(o => ({ value: o, label: o })) } : {}),
    ...(c.tipo === "number" ? { step: 0.01 } : {}),
    ...(c.unita ? { placeholder: c.unita } : {}),
  };
}

export function CampiModulo({ campi, valori, onChange, mostraErrori, phaseId }: Props) {
  const definizioni = useMemo(() => campi.map(c => comeDefinizione(c, chiaveValore(c.chiave, phaseId))), [campi, phaseId]);
  if (campi.length === 0) return null;
  return (
    <div className="grid grid-cols-12 gap-3">
      {definizioni.map(d => (
        <FieldRenderer key={d.key} field={d} value={valori[d.key]} allValues={valori} onChange={onChange} showErrors={mostraErrori} />
      ))}
    </div>
  );
}
