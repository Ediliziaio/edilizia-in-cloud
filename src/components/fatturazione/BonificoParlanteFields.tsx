import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  previsioneBonifico,
  validaBonifico,
  type BonificoForm,
} from "@/lib/fatturazione/bonificiParlanti";
import { formatCurrency } from "@/lib/formatters";

export function BonificoParlanteFields({
  lordo,
  data,
  riferimento,
  value,
  onChange,
}: {
  lordo: number;
  data: string;
  riferimento: string;
  value: BonificoForm;
  onChange: (value: BonificoForm) => void;
}) {
  const forecast = previsioneBonifico(lordo, data);
  const edit = (key: keyof BonificoForm, next: string) =>
    onChange({ ...value, [key]: next, confermato: false });
  const error = validaBonifico({
    lordo,
    data,
    riferimento,
    banca: value.banca,
    ritenuta: value.ritenuta ? Number(value.ritenuta) : NaN,
    netto: value.netto ? Number(value.netto) : NaN,
    commissioni: Number(value.commissioni),
    confermato: true,
  });
  return (
    <section
      className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-3 max-sm:col-span-2"
      aria-label="Dettaglio bonifico parlante"
    >
      <p className="text-sm font-medium">
        Lordo cliente e netto bancario separati
      </p>
      <p className="text-xs text-muted-foreground">
        La fattura si salda per il lordo. Verifica ritenuta e commissioni sulla
        contabile; non modificano l’IVA della fattura.
      </p>
      {forecast ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span>
            Previsione {forecast.aliquota}% su lordo ÷ 1,22:{" "}
            <strong>{formatCurrency(forecast.ritenuta)}</strong>
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              onChange({
                ...value,
                ritenuta: forecast.ritenuta.toFixed(2),
                netto: (
                  forecast.netto - Number(value.commissioni || 0)
                ).toFixed(2),
                confermato: false,
              })
            }
          >
            Usa come proposta
          </Button>
        </div>
      ) : (
        <p className="text-xs text-amber-800">
          Inserisci importo e data validi. Regimi prima del 2015: verifica
          storica necessaria.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        {(
          [
            ["ritenuta", "Ritenuta effettiva €"],
            ["commissioni", "Commissioni trattenute €"],
            ["netto", "Accredito netto effettivo €"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <Label htmlFor={`bp-${key}`}>{label}</Label>
            <Input
              id={`bp-${key}`}
              type="number"
              min="0"
              step="0.01"
              value={value[key]}
              onChange={(e) => edit(key, e.target.value)}
            />
          </div>
        ))}
        <div>
          <Label htmlFor="bp-banca">Banca accreditante</Label>
          <Input
            id="bp-banca"
            maxLength={160}
            value={value.banca}
            onChange={(e) => edit("banca", e.target.value)}
          />
        </div>
      </div>
      {forecast &&
        value.ritenuta &&
        Math.abs(Number(value.ritenuta) - forecast.ritenuta) > 0.01 && (
          <p className="text-xs text-amber-800">
            Ritenuta diversa dalla previsione: conserva il riscontro bancario.
            Si registrerà l’importo effettivo, non quello stimato.
          </p>
        )}
      {error && (
        <p role="status" className="text-xs text-amber-800">
          {error}
        </p>
      )}
      <Label className="flex items-start gap-2 text-xs leading-5">
        <Checkbox
          checked={value.confermato}
          disabled={!!error}
          onCheckedChange={(checked) =>
            onChange({ ...value, confermato: checked === true })
          }
        />
        Ho confrontato lordo, ritenuta, commissioni e netto con la contabile
        bancaria.
      </Label>
    </section>
  );
}
