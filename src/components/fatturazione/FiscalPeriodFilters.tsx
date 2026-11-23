import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

function PeriodSelect({
  label,
  caption,
  value,
  options,
  onChange,
}: {
  label: string;
  caption?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p aria-hidden="true" className="px-1 text-xs font-medium text-slate-500">
        {caption ?? label.replace(" fiscale", "")}
      </p>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          aria-label={label}
          className="min-w-24 gap-4 rounded-xl border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:border-blue-300 focus:ring-blue-200"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-72 rounded-xl border-slate-200 p-1 shadow-lg">
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className="rounded-lg py-2 focus:bg-blue-50 focus:text-blue-900"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function FiscalPeriodFilters({
  anno,
  mese,
  trimestre,
  tipo,
  showPeriod,
  onChange,
}: {
  anno: number;
  mese: number;
  trimestre: number;
  tipo: "mensile" | "trimestrale";
  showPeriod: boolean;
  onChange: (changes: Record<string, string>) => void;
}) {
  const t = useT();
  const year = new Date().getFullYear();
  const years = [
    ...new Set([
      anno,
      ...Array.from({ length: year - 1999 }, (_, i) => year - i),
    ]),
  ].sort((a, b) => b - a);
  return (
    <div className="flex flex-wrap items-end gap-3">
      <PeriodSelect
        label={t("Anno fiscale")}
        value={String(anno)}
        onChange={(value) => onChange({ anno: value })}
        options={years.map((y) => ({ value: String(y), label: String(y) }))}
      />
      {showPeriod && (
        <>
          <PeriodSelect
            label={t("Tipo periodo fiscale")}
            caption={t("Periodo")}
            value={tipo}
            onChange={(value) => onChange({ periodo: value })}
            options={[
              { value: "mensile", label: t("Mensile") },
              { value: "trimestrale", label: t("Trimestrale") },
            ]}
          />
          <PeriodSelect
            label={t("Periodo fiscale")}
            caption={tipo === "mensile" ? t("Mese") : t("Trimestre")}
            value={String(tipo === "mensile" ? mese : trimestre)}
            onChange={(value) =>
              onChange({ [tipo === "mensile" ? "mese" : "trimestre"]: value })
            }
            options={Array.from(
              { length: tipo === "mensile" ? 12 : 4 },
              (_, i) => ({
                value: String(i + 1),
                label:
                  tipo === "mensile"
                    ? new Intl.DateTimeFormat(intlCampo(), {
                        month: "long",
                        timeZone: "UTC",
                      }).format(new Date(Date.UTC(2026, i, 1)))
                    : t("{i}° trimestre", { i: i + 1 }),
              }),
            )}
          />
        </>
      )}
    </div>
  );
}
