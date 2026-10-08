import { useState, useRef, useEffect, useCallback, useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MapPin, X, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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

interface Prediction {
  place_id: string;
  description: string;
}

export default function AddressAutocomplete({ value, onChange, label = "Luogo", searchPlaceholder = "Cerca indirizzo...", editableSearch = false, disabled = false }: Props) {
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [activePrediction, setActivePrediction] = useState(-1);
  const requestRef = useRef(0);
  const inputId = useId();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const wrapperRef = useRef<HTMLFieldSetElement>(null);
  const lastEmittedRef = useRef(value);
  const emitAddress = (next: AddressData) => { lastEmittedRef.current = next; onChange(next); };

  useEffect(() => {
    // Un cambio cliente/bozza invalida le ricerche del precedente indirizzo.
    if (value === lastEmittedRef.current && !disabled) return;
    lastEmittedRef.current = value;
    requestRef.current++;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setPredictions([]); setShowDropdown(false); setLoading(false); setSearchError("");
    setActivePrediction(-1); setQuery("");
  }, [value, disabled]);

  // Close dropdown on outside click
  useEffect(() => {
    const requests = requestRef;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      requests.current++;
    };
  }, []);

  const fetchPredictions = useCallback(async (q: string, request: number) => {
    if (request !== requestRef.current) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("maps-proxy", {
        body: { action: "autocomplete", query: q, country: "it" },
      });
      if (request !== requestRef.current) return;
      if (!error && !data?.error && data?.predictions) {
        setPredictions(data.predictions);
        setShowDropdown(true);
      } else {
        setSearchError("Ricerca non disponibile. Puoi scrivere l’indirizzo manualmente.");
      }
    } catch {
      if (request === requestRef.current) setSearchError("Ricerca non disponibile. Puoi scrivere l’indirizzo manualmente.");
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, []);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    const request = ++requestRef.current;
    setPredictions([]);
    setActivePrediction(-1);
    setShowDropdown(false);
    setSearchError("");
    setLoading(false);
    if (editableSearch) emitAddress({ ...emptyAddress, address_line: val, formatted_address: val, address_notes: value.address_notes, address_country: value.address_country });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length >= 3) debounceRef.current = setTimeout(() => fetchPredictions(val, request), 300);
  };

  const handleSelect = async (prediction: Prediction) => {
    const request = ++requestRef.current;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setShowDropdown(false);
    setQuery(prediction.description);
    setLoading(true);
    setSearchError("");
    // La selezione resta utilizzabile anche se il dettaglio del provider fallisce.
    const fallback = { ...emptyAddress, address_notes: value.address_notes, address_line: prediction.description, formatted_address: prediction.description };
    if (editableSearch) emitAddress(fallback);
    try {
      const { data, error } = await supabase.functions.invoke("maps-proxy", {
        body: { action: "place-details", place_id: prediction.place_id },
      });
      if (request !== requestRef.current) return;
      if (!error && !data?.error && data) {
        emitAddress({
          ...value,
          address_line: data.address_line || "",
          address_city: data.city || "",
          address_postal_code: data.postal_code || "",
          address_province: data.province || "",
          formatted_address: data.formatted_address || prediction.description,
          lat: data.lat ?? null,
          lng: data.lng ?? null,
          place_id: prediction.place_id,
        });
        setQuery("");
      } else {
        emitAddress(fallback);
        setSearchError("Indirizzo selezionato. Coordinate non disponibili.");
      }
    } catch {
      if (request === requestRef.current) {
        emitAddress(fallback);
        setSearchError("Indirizzo selezionato. Coordinate non disponibili.");
      }
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  };

  const clearAddress = () => {
    requestRef.current++;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setPredictions([]); setShowDropdown(false); setLoading(false); setSearchError("");
    emitAddress(emptyAddress);
    setQuery("");
  };

  const hasAddress = !!(value.formatted_address || value.address_line || value.address_city);
  const displayAddress = value.formatted_address || [value.address_line, [value.address_postal_code, value.address_city].filter(Boolean).join(" "), value.address_province].filter(Boolean).join(", ");
  const updateManual = (patch: Partial<AddressData>) => {
    requestRef.current++;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setPredictions([]); setShowDropdown(false); setLoading(false); setSearchError("");
    setActivePrediction(-1);
    emitAddress({ ...value, ...patch, formatted_address: "", lat: null, lng: null, place_id: "" });
  };

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-2" ref={wrapperRef}>
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
      ) : (
        <div className="relative">
          <Input
            id={inputId}
            role="combobox"
            aria-expanded={showDropdown && predictions.length > 0}
            aria-controls={`${inputId}-suggestions`}
            aria-autocomplete="list"
            aria-activedescendant={showDropdown && activePrediction >= 0 ? `${inputId}-option-${activePrediction}` : undefined}
            placeholder={searchPlaceholder}
            value={editableSearch ? displayAddress : query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => predictions.length > 0 && setShowDropdown(true)}
            onKeyDown={(event) => {
              if ((event.key === "ArrowDown" || event.key === "ArrowUp") && predictions.length) {
                event.preventDefault(); setShowDropdown(true);
                setActivePrediction((prev) => event.key === "ArrowDown" ? (prev + 1) % predictions.length : (prev < 0 ? predictions.length - 1 : (prev - 1 + predictions.length) % predictions.length));
              } else if (event.key === "Enter" && showDropdown && predictions.length) {
                event.preventDefault(); void handleSelect(predictions[activePrediction < 0 ? 0 : activePrediction]);
              } else if (event.key === "Escape") {
                setShowDropdown(false); setActivePrediction(-1);
              }
            }}
          />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
          {showDropdown && predictions.length > 0 && (
            <div id={`${inputId}-suggestions`} role="listbox" aria-label="Indirizzi suggeriti" className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-auto">
              {predictions.map((p, index) => (
                <button
                  key={p.place_id}
                  id={`${inputId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={activePrediction === index}
                  className={`min-h-11 w-full break-words text-left px-3 py-2 text-sm hover:bg-accent transition-colors ${activePrediction === index ? "bg-accent" : ""}`}
                  onClick={() => handleSelect(p)}
                >
                  {p.description}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {searchError && <p role="status" className="text-xs text-muted-foreground">{searchError}</p>}

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
