/**
 * Preventivo cointestato: il secondo intestatario (per esempio i due coniugi
 * proprietari dell'immobile). Esce nel PDF accanto al cliente, nelle condizioni
 * ({{cliente.nome_completo}} diventa «Mario Rossi e Anna Bianchi») e con una sua
 * riga di firma. Spento, i campi si svuotano.
 *
 * È facoltativo e non dipende dal contatto del cliente: lo si scrive a mano o lo si
 * prende da un contatto del CRM («Scegli dai contatti»), che riempie nome, cognome e
 * codice fiscale; i campi restano modificabili.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { filtriRicercaContatti } from "@/lib/ricerca/ricercaContatti";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { nomeCointestatario, type CampoCointestatario } from "@/lib/preventivatore/cointestatario";

export { nomeCointestatario, type CampoCointestatario };

interface Props {
  form: Partial<Record<CampoCointestatario, string | null>>;
  onChange: (campo: CampoCointestatario, valore: string | null) => void;
}

interface ContattoCointestatario {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  fiscal_code: string | null;
}

export function Cointestatario({ form, onChange }: Props) {
  const companyId = useEffectiveCompanyId();
  const compilato = Boolean(nomeCointestatario(form) || (form.cointestatario_codice_fiscale ?? "").trim());
  const [aperto, setAperto] = useState(compilato);
  const [scelta, setScelta] = useState(false);
  const [cerca, setCerca] = useState("");
  const attivo = aperto || compilato;

  const { data: contatti = [] } = useQuery({
    queryKey: ["cointestatario-contatti", companyId, cerca],
    enabled: !!companyId && scelta,
    queryFn: async (): Promise<ContattoCointestatario[]> => {
      let q = supabase.from("marketing_contacts")
        .select("id, first_name, last_name, email, phone, fiscal_code")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .limit(20);
      for (const filtro of filtriRicercaContatti(cerca)) q = q.or(filtro);
      const { data, error } = await q.order("first_name");
      if (error) throw error;
      return (data ?? []) as ContattoCointestatario[];
    },
  });

  const cambia = (campo: CampoCointestatario) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange(campo, e.target.value === "" ? null : e.target.value);
  const prendi = (c: ContattoCointestatario) => {
    onChange("cointestatario_nome", c.first_name?.trim() || null);
    onChange("cointestatario_cognome", c.last_name?.trim() || null);
    onChange("cointestatario_codice_fiscale", c.fiscal_code?.trim().toUpperCase() || null);
    onChange("cointestatario_email", c.email?.trim() || null);
    onChange("cointestatario_telefono", c.phone?.trim() || null);
    setScelta(false);
  };

  return (
    <div className="space-y-3 rounded-lg border p-3 max-sm:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label htmlFor="preventivo-cointestato" className="text-sm font-medium">Preventivo cointestato</Label>
          <p className="text-xs text-muted-foreground">Facoltativo: un secondo intestatario, che compare nel PDF e firma anche lui.</p>
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
              onChange("cointestatario_email", null);
              onChange("cointestatario_telefono", null);
            }
          }}
        />
      </div>
      {attivo && (
        <>
          <Popover open={scelta} onOpenChange={setScelta}>
            <PopoverTrigger asChild>
              <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
                <Users className="h-3.5 w-3.5" /> Scegli dai contatti
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput placeholder="Cerca contatto..." value={cerca} onValueChange={setCerca} />
                <CommandList>
                  <CommandEmpty>Nessun contatto trovato</CommandEmpty>
                  <CommandGroup>
                    {contatti.map((c) => (
                      <CommandItem key={c.id} value={c.id} onSelect={() => prendi(c)}>
                        <div className="min-w-0">
                          <p className="truncate text-sm">{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Senza nome"}</p>
                          {c.fiscal_code && <p className="truncate text-[11px] text-muted-foreground">{c.fiscal_code}</p>}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
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
            <div className="space-y-1">
              <Label htmlFor="cointestatario-email" className="text-xs">Email (per la firma online)</Label>
              <Input id="cointestatario-email" type="email" value={form.cointestatario_email ?? ""} onChange={cambia("cointestatario_email")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cointestatario-telefono" className="text-xs">Cellulare</Label>
              <Input id="cointestatario-telefono" type="tel" inputMode="tel" value={form.cointestatario_telefono ?? ""} onChange={cambia("cointestatario_telefono")} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
