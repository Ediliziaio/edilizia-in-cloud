/**
 * Preventivo cointestato: il secondo intestatario (per esempio i due coniugi
 * proprietari dell'immobile). Esce nel PDF accanto al cliente, nelle condizioni
 * ({{cliente.nome_completo}} diventa «Mario Rossi e Anna Bianchi») e con una sua
 * riga di firma. Spento, i campi si svuotano.
 */
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { nomeCointestatario, type CampoCointestatario } from "@/lib/preventivatore/cointestatario";

export { nomeCointestatario, type CampoCointestatario };

interface Props {
  form: Partial<Record<CampoCointestatario, string | null>>;
  onChange: (campo: CampoCointestatario, valore: string | null) => void;
}

export function Cointestatario({ form, onChange }: Props) {
  const compilato = Boolean(nomeCointestatario(form) || (form.cointestatario_codice_fiscale ?? "").trim());
  const [aperto, setAperto] = useState(compilato);
  const attivo = aperto || compilato;
  const cambia = (campo: CampoCointestatario) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange(campo, e.target.value === "" ? null : e.target.value);
  return (
    <div className="space-y-3 rounded-lg border p-3 max-sm:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label htmlFor="preventivo-cointestato" className="text-sm font-medium">Preventivo cointestato</Label>
          <p className="text-xs text-muted-foreground">Un secondo intestatario: compare nel PDF, nelle condizioni e firma anche lui.</p>
        </div>
        <Switch
          id="preventivo-cointestato"
          checked={attivo}
          onCheckedChange={(on) => {
            setAperto(on);
            if (!on) {
              onChange("cointestatario_nome", null);
              onChange("cointestatario_cognome", null);
              onChange("cointestatario_codice_fiscale", null);
            }
          }}
        />
      </div>
      {attivo && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="cointestatario-nome" className="text-xs">Nome</Label>
            <Input id="cointestatario-nome" value={form.cointestatario_nome ?? ""} onChange={cambia("cointestatario_nome")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cointestatario-cognome" className="text-xs">Cognome</Label>
            <Input id="cointestatario-cognome" value={form.cointestatario_cognome ?? ""} onChange={cambia("cointestatario_cognome")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cointestatario-cf" className="text-xs">Codice fiscale</Label>
            <Input id="cointestatario-cf" value={form.cointestatario_codice_fiscale ?? ""}
              onChange={(e) => onChange("cointestatario_codice_fiscale", e.target.value.trim() === "" ? null : e.target.value.toUpperCase())} />
          </div>
        </div>
      )}
    </div>
  );
}
