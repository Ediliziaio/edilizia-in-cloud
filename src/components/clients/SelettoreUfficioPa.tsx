// Scelta dell'ufficio PA che riceve la fattura (lotto 2, 15/11/2026).
// Per commessa e fattura (lotti 3-4):
//   <SelettoreUfficioPa anagraficaId={id} value={ufficioId} onChange={(id, ufficio) => …} />
// Con `proponiPredefinito` sceglie da solo il predefinito quando value è vuoto.

import { useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUfficiPa } from "@/hooks/useUfficiPa";
import { etichettaUfficioPa, type UfficioPa } from "@/lib/clienti/ufficiPa";

interface Props {
  anagraficaId: string | null | undefined;
  value: string | null | undefined;
  onChange: (id: string | null, ufficio: UfficioPa | null) => void;
  proponiPredefinito?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function SelettoreUfficioPa({ anagraficaId, value, onChange, proponiPredefinito = true, disabled, id, className }: Props) {
  const { tutti, predefinito, isLoading } = useUfficiPa(anagraficaId);
  // Un ufficio disattivato resta visibile solo se è quello già scelto.
  const voci = tutti.filter((u) => u.attivo || u.id === value);

  useEffect(() => {
    if (proponiPredefinito && !value && predefinito) onChange(predefinito.id, predefinito);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proponiPredefinito, value, predefinito?.id]);

  if (!anagraficaId) return null;
  if (!isLoading && voci.length === 0) {
    return <p className="text-sm text-muted-foreground">Nessun ufficio: aggiungilo nella scheda del cliente.</p>;
  }
  return (
    <Select
      value={value ?? undefined}
      disabled={disabled || isLoading}
      onValueChange={(v) => onChange(v, tutti.find((u) => u.id === v) ?? null)}
    >
      <SelectTrigger id={id} className={className} aria-label="Ufficio PA">
        <SelectValue placeholder={isLoading ? "Carico gli uffici…" : "Scegli l'ufficio"} />
      </SelectTrigger>
      <SelectContent>
        {voci.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            {etichettaUfficioPa(u)}
            {u.predefinito ? " · predefinito" : ""}
            {!u.attivo ? " · disattivato" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
