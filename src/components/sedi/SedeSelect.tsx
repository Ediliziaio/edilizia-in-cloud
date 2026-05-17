// v8.6.42 — SedeSelect: selettore generico riusabile per assegnare un
// sede_id a entità correlate (ordini, preventivi, lead, fatture).
//
// Carica le sedi attive dell'azienda corrente via useSediList (già
// cache-ato React Query). Mostra le sedi con icona+colore semantico
// per coerenza con la pagina /azienda/impostazioni/sedi.

import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2, Warehouse, Briefcase, MoreHorizontal, MapPin } from "lucide-react";
import { useSediList } from "@/hooks/useSediAnalytics";

const TIPO_ICON: Record<string, typeof Building2> = {
  showroom: Building2,
  magazzino: Warehouse,
  ufficio: Briefcase,
  altro: MoreHorizontal,
};

interface Props {
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  /** Mostra una Label sopra il select. Se assente, niente label. */
  label?: string;
  placeholder?: string;
  /** Disabilita l'opzione "nessuna sede". Default false (nullable). */
  required?: boolean;
  disabled?: boolean;
  className?: string;
  /** id html per associare Label esterna. */
  id?: string;
}

export function SedeSelect({
  value,
  onChange,
  label,
  placeholder = "Sede operativa (opzionale)",
  required = false,
  disabled,
  className,
  id,
}: Props) {
  const { data: sedi = [], isLoading } = useSediList();
  const activeSedi = useMemo(
    () => sedi.filter((s) => s.attiva),
    [sedi],
  );

  // Niente sedi configurate → mostra il select disabled con un hint
  if (!isLoading && activeSedi.length === 0) {
    return (
      <div className={className}>
        {label && <Label htmlFor={id}>{label}</Label>}
        <Select disabled>
          <SelectTrigger id={id}>
            <SelectValue placeholder="Nessuna sede configurata" />
          </SelectTrigger>
        </Select>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Configura le sedi in <span className="font-medium">Impostazioni → Sedi</span>.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      {label && <Label htmlFor={id}>{label}</Label>}
      <Select
        value={value ?? "__none__"}
        onValueChange={(v) => onChange(v === "__none__" ? null : v)}
        disabled={disabled || isLoading}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {!required && (
            <SelectItem value="__none__">
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                Nessuna sede
              </span>
            </SelectItem>
          )}
          {activeSedi.map((sede) => {
            const Icon = TIPO_ICON[sede.tipo] ?? MoreHorizontal;
            return (
              <SelectItem key={sede.id} value={sede.id}>
                <span className="inline-flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5" />
                  <span>{sede.nome}</span>
                  {sede.citta && (
                    <span className="text-xs text-muted-foreground">· {sede.citta}</span>
                  )}
                  {sede.principale && (
                    <span className="text-[10px] text-amber-700">★</span>
                  )}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
