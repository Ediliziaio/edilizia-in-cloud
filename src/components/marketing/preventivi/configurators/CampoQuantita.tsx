import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Quantità dei configuratori (articolo e famiglia). Sul telefono ha − e + ai
 * lati: col pollice nel campo numerico si sbagliava a scrivere, e per 2 o 3
 * pezzi due tocchi bastano. Dal computer resta il solo campo, come prima.
 */
export function CampoQuantita({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const n = Math.max(1, Number(value) || 1);
  return (
    <div>
      <Label htmlFor="quantita">Quantità</Label>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0 sm:hidden"
          onClick={() => onChange(String(Math.max(1, n - 1)))}
          disabled={n <= 1}
          aria-label="Una in meno"
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Input
          id="quantita"
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={1}
          className="max-w-[140px] max-sm:w-20 max-sm:text-center"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0 sm:hidden"
          onClick={() => onChange(String(n + 1))}
          aria-label="Una in più"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
