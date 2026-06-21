/**
 * DetrazioniFiscaliFields — sezione (controllata) per applicare a una fattura le
 * clausole delle detrazioni fiscali edilizie (ristrutturazione, ecobonus, ecc.).
 *
 * La clausola scelta è EDITABILE: finisce nel campo Causale della fattura (XML
 * FatturaPA) + sull'anteprima. Opzionale: evidenziare separatamente il costo
 * della manodopera. Testi indicativi da verificare col commercialista.
 */
import { Percent, Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DETRAZIONI_EDILIZIE,
  type DetrazioneValue,
} from "@/lib/fatturazione/detrazioniEdilizie";

interface Props {
  value: DetrazioneValue;
  onChange: (next: DetrazioneValue) => void;
}

export function DetrazioniFiscaliFields({ value, onChange }: Props) {
  const set = (patch: Partial<DetrazioneValue>) => onChange({ ...value, ...patch });

  const selectPreset = (id: string) => {
    const preset = DETRAZIONI_EDILIZIE.find((p) => p.id === id);
    if (!preset) return;
    set({
      presetId: id,
      // Sovrascrive la clausola col template del preset (poi editabile).
      clausola: preset.clausola,
      manodoperaEvidenzia: value.manodoperaEvidenzia || !!preset.manodoperaConsigliata,
    });
  };

  return (
    <div className="rounded-lg border bg-amber-50/40 p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="detr-switch" className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
          <Percent className="h-4 w-4 text-amber-600" />
          Lavori con detrazione fiscale
        </Label>
        <Switch
          id="detr-switch"
          checked={value.active}
          onCheckedChange={(checked) => set({ active: checked })}
        />
      </div>

      {value.active && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Tipo di agevolazione</Label>
            <Select value={value.presetId ?? undefined} onValueChange={selectPreset}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Scegli l'agevolazione…" />
              </SelectTrigger>
              <SelectContent>
                {DETRAZIONI_EDILIZIE.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex items-center gap-2">
                      <span>{p.label}</span>
                      <span className="text-[10px] rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">{p.aliquota}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="detr-clausola" className="text-xs text-muted-foreground">
              Clausola in fattura <span className="text-[10px]">(editabile — finisce nella causale del documento)</span>
            </Label>
            <Textarea
              id="detr-clausola"
              value={value.clausola}
              onChange={(e) => set({ clausola: e.target.value })}
              placeholder="Seleziona un'agevolazione qui sopra, oppure scrivi la clausola a mano…"
              rows={4}
              className="text-xs leading-relaxed"
              maxLength={1000}
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={value.manodoperaEvidenzia}
                onCheckedChange={(checked) => set({ manodoperaEvidenzia: checked === true })}
              />
              Evidenzia separatamente il costo della manodopera
            </Label>
            {value.manodoperaEvidenzia && (
              <div className="flex items-center gap-2 pl-6">
                <span className="text-xs text-muted-foreground">Di cui manodopera</span>
                <div className="relative w-36">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={value.manodoperaImporto}
                    onChange={(e) => set({ manodoperaImporto: e.target.value })}
                    placeholder="0,00"
                    className="h-8 pl-5 text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-700">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Testi indicativi: verifica con il commercialista l'agevolazione applicabile, l'aliquota e i requisiti
            (es. bonifico parlante, asseverazioni). Puoi modificare liberamente la clausola.
          </p>
        </div>
      )}
    </div>
  );
}
