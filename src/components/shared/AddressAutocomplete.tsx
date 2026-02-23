import { useState, useRef, useEffect, useCallback } from "react";
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
}

interface Prediction {
  place_id: string;
  description: string;
}

export default function AddressAutocomplete({ value, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchPredictions = useCallback(async (q: string) => {
    if (q.length < 3) {
      setPredictions([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("maps-proxy", {
        body: { action: "autocomplete", query: q, country: "it" },
      });
      if (!error && data?.predictions) {
        setPredictions(data.predictions);
        setShowDropdown(true);
      }
    } catch {
      // Silently fail — user can enter manually
    } finally {
      setLoading(false);
    }
  }, []);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPredictions(val), 300);
  };

  const handleSelect = async (prediction: Prediction) => {
    setShowDropdown(false);
    setQuery(prediction.description);
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("maps-proxy", {
        body: { action: "place-details", place_id: prediction.place_id },
      });
      if (!error && data) {
        onChange({
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
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  const clearAddress = () => {
    onChange(emptyAddress);
    setQuery("");
  };

  const hasAddress = !!(value.formatted_address || value.address_line || value.address_city);

  return (
    <div className="space-y-2" ref={wrapperRef}>
      <Label className="text-sm font-semibold flex items-center gap-1.5">
        <MapPin className="h-3.5 w-3.5" />
        Luogo
      </Label>

      {hasAddress ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="flex-1 truncate">
            {value.formatted_address || `${value.address_line}, ${value.address_city}`}
          </span>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={clearAddress}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <div className="relative">
          <Input
            placeholder="Cerca indirizzo..."
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => predictions.length > 0 && setShowDropdown(true)}
          />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
          {showDropdown && predictions.length > 0 && (
            <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-auto">
              {predictions.map((p) => (
                <button
                  key={p.place_id}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                  onClick={() => handleSelect(p)}
                >
                  {p.description}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Expandable structured fields */}
      <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="text-xs gap-1 text-muted-foreground h-7 px-1">
            {detailsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {detailsOpen ? "Nascondi dettagli" : "Modifica dettagli indirizzo"}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-1">
          <div className="space-y-1">
            <Label className="text-xs">Via / Piazza</Label>
            <Input
              value={value.address_line}
              onChange={(e) => onChange({ ...value, address_line: e.target.value })}
              placeholder="Via Roma 1"
              className="h-8 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Città</Label>
              <Input
                value={value.address_city}
                onChange={(e) => onChange({ ...value, address_city: e.target.value })}
                placeholder="Milano"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">CAP</Label>
              <Input
                value={value.address_postal_code}
                onChange={(e) => onChange({ ...value, address_postal_code: e.target.value })}
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
                onChange={(e) => onChange({ ...value, address_province: e.target.value })}
                placeholder="MI"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Note indirizzo</Label>
              <Input
                value={value.address_notes}
                onChange={(e) => onChange({ ...value, address_notes: e.target.value })}
                placeholder="Scala B, Int. 3"
                className="h-8 text-sm"
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export { emptyAddress };
