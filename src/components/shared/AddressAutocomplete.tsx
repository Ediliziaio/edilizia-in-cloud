/**
 * Indirizzo strutturato (via, città, CAP, provincia, note, coordinate) con la ricerca di CampoIndirizzo.
 *
 * Dal 30/10/2026 la ricerca (suggerimenti, tasti, risposte vecchie scartate) sta in CampoIndirizzo, la stessa
 * di tutti gli altri campi indirizzo: qui restano il valore strutturato, il riquadro dell'indirizzo scelto
 * (calendari) e i dettagli da correggere a mano.
 */
import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MapPin, X, ChevronDown, ChevronUp } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CampoIndirizzo } from "@/components/shared/CampoIndirizzo";
import type { IndirizzoTrovato } from "@/lib/indirizzi/ricercaIndirizzi";

export interface AddressData {
  address_line: string;
  address_city: string;
  address_postal_code: string;
  address_province: string;
  address_country: string;
  address_notes: string;
  formatted_address: string;
  lat: number | null;
  lng: number | null;
  place_id: string;
}

const emptyAddress: AddressData = {
  address_line: "",
  address_city: "",
  address_postal_code: "",
  address_province: "",
  address_country: "IT",
  address_notes: "",
  formatted_address: "",
  lat: null,
  lng: null,
  place_id: "",
};

interface Props {
  value: AddressData;
  onChange: (data: AddressData) => void;
  /** Etichetta della sezione (default "Luogo"). */
  label?: string;
  /** Placeholder del campo di ricerca. */
  searchPlaceholder?: string;
  /** Campo sempre modificabile: conserva anche indirizzi scritti senza scegliere un suggerimento. */
  editableSearch?: boolean;
  disabled?: boolean;
}

/** L'indirizzo scelto nella ricerca, sopra quello di prima (note e nazione restano). */
function daTrovato(base: AddressData, a: IndirizzoTrovato): AddressData {
  return {
    ...base,
    address_line: a.via,
    address_city: a.citta,
    address_postal_code: a.cap,
    address_province: a.provincia,
    formatted_address: a.etichetta,
    lat: a.lat,
    lng: a.lng,
    place_id: a.id,
  };
}

export default function AddressAutocomplete({ value, onChange, label = "Luogo", searchPlaceholder = "Cerca indirizzo...", editableSearch = false, disabled = false }: Props) {
  // Il testo che si sta cercando quando il campo non è modificabile (il riquadro mostra l'indirizzo scelto).
  const [query, setQuery] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Scelto un suggerimento senza dettagli mentre il riquadro prende il posto del campo: lo si dice qui.
  const [notaScelta, setNotaScelta] = useState("");
  const inputId = useId();
  const lastEmittedRef = useRef(value);
  const emitAddress = (next: AddressData) => { lastEmittedRef.current = next; onChange(next); };

  // Un cambio cliente/bozza fatto da fuori, o l'avvio del salvataggio: la ricerca riparte vuota.
  useEffect(() => {
    if (value === lastEmittedRef.current && !disabled) return;
    lastEmittedRef.current = value;
    setQuery("");
    setNotaScelta("");
  }, [value, disabled]);

  const clearAddress = () => {
    setNotaScelta("");
    emitAddress(emptyAddress);
    setQuery("");
  };

  const hasAddress = !!(value.formatted_address || value.address_line || value.address_city);
  const displayAddress = value.formatted_address || [value.address_line, [value.address_postal_code, value.address_city].filter(Boolean).join(" "), value.address_province].filter(Boolean).join(", ");
  const updateManual = (patch: Partial<AddressData>) => {
    emitAddress({ ...value, ...patch, formatted_address: "", lat: null, lng: null, place_id: "" });
  };

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-2">
      <Label htmlFor={inputId} className="text-sm font-semibold flex items-center gap-1.5">
        <MapPin className="h-3.5 w-3.5" />
        {label}
      </Label>

      {hasAddress && !editableSearch ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="flex-1 truncate">
            {displayAddress}
          </span>
          <Button type="button" aria-label="Rimuovi indirizzo" variant="ghost" size="icon" className="h-6 w-6 shrink-0 max-sm:h-11 max-sm:w-11" onClick={clearAddress}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : editableSearch ? (
        <CampoIndirizzo
          id={inputId}
          value={displayAddress}
          placeholder={searchPlaceholder}
          disabled={disabled}
          onChange={(testo) => emitAddress({ ...emptyAddress, address_line: testo, formatted_address: testo, address_notes: value.address_notes, address_country: value.address_country })}
          onScegli={(a) => emitAddress(daTrovato(value, a))}
        />
      ) : (
        <CampoIndirizzo
          id={inputId}
          value={query}
          placeholder={searchPlaceholder}
          disabled={disabled}
          onChange={setQuery}
          onScegli={(a) => { emitAddress(daTrovato(value, a)); setQuery(""); }}
          onScegliSenzaDettagli={(s) => {
            emitAddress({ ...emptyAddress, address_notes: value.address_notes, address_line: s.testo, formatted_address: s.testo });
            setNotaScelta("Indirizzo selezionato. Coordinate non disponibili.");
          }}
        />
      )}
      {notaScelta && hasAddress && !editableSearch && <p role="status" className="text-xs text-muted-foreground">{notaScelta}</p>}

      {/* Expandable structured fields */}
      <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="text-xs gap-1 text-muted-foreground h-7 px-1">
            {detailsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {detailsOpen ? "Nascondi dettagli" : "Modifica dettagli indirizzo"}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-1">
          <div className="space-y-1">
            <Label className="text-xs">Via / Piazza</Label>
            <Input
              value={value.address_line}
              onChange={(e) => updateManual({ address_line: e.target.value })}
              placeholder="Via Roma 1"
              className="h-8 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Città</Label>
              <Input
                value={value.address_city}
                onChange={(e) => updateManual({ address_city: e.target.value })}
                placeholder="Milano"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">CAP</Label>
              <Input
                value={value.address_postal_code}
                onChange={(e) => updateManual({ address_postal_code: e.target.value })}
                placeholder="20100"
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Provincia</Label>
              <Input
                value={value.address_province}
                onChange={(e) => updateManual({ address_province: e.target.value })}
                placeholder="MI"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Note indirizzo</Label>
              <Input
                value={value.address_notes}
                onChange={(e) => emitAddress({ ...value, address_notes: e.target.value })}
                placeholder="Scala B, Int. 3"
                className="h-8 text-sm"
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </fieldset>
  );
}

export { emptyAddress };
