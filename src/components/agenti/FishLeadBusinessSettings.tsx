import { UniformSelect } from "@/components/ui/uniform-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export function FishLeadBusinessSettings({
  value,
  onChange,
  disabled,
}: {
  value: {
    leadCompany: string;
    leadServices: string;
    leadAreas: string;
    leadMode: "onsite" | "office" | "phone";
  };
  onChange: (patch: Partial<typeof value>) => void;
  disabled: boolean;
}) {
  return (
    <section
      className="grid min-w-0 gap-x-3 gap-y-2.5 rounded-lg border bg-card p-3 sm:grid-cols-2"
      aria-label="Azienda e qualificazione dei lead"
    >
      <div className="sm:col-span-2">
        <h2 className="font-semibold">Azienda e sopralluogo</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Imposta i dati che l’agente può usare con i lead.
        </p>
      </div>
      <div>
        <Label htmlFor="lead-company">Nome azienda da pronunciare</Label>
        <Input
          id="lead-company"
          value={value.leadCompany}
          maxLength={100}
          disabled={disabled}
          onChange={(e) => onChange({ leadCompany: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="lead-services">Servizi, separati da virgola</Label>
        <Input
          id="lead-services"
          value={value.leadServices}
          disabled={disabled}
          onChange={(e) => onChange({ leadServices: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="lead-areas">Comuni serviti, separati da virgola</Label>
        <Input
          id="lead-areas"
          value={value.leadAreas}
          placeholder="Vuoto: copertura da verificare"
          disabled={disabled}
          onChange={(e) => onChange({ leadAreas: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="lead-mode">Modalità appuntamento</Label>
        <UniformSelect
          id="lead-mode"
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          value={value.leadMode}
          disabled={disabled}
          onChange={(e) =>
            onChange({ leadMode: e.target.value as typeof value.leadMode })
          }
        >
          <option value="onsite">Sopralluogo a domicilio</option>
          <option value="office">Ufficio / showroom</option>
          <option value="phone">Telefonico</option>
        </UniformSelect>
      </div>
    </section>
  );
}
