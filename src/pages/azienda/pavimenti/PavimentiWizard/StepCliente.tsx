/**
 * StepCliente — anagrafica cliente + collegamento a un contatto/opportunità CRM.
 *
 * Il picker contatto riusa il pattern Popover + Command su `marketing_contacts`
 * (come RoiSimulatorPage / Serramenti): selezionando un contatto si popolano
 * nome/cognome/email/telefono e si salva il riferimento `cliente_id`. È inoltre
 * possibile collegare un'opportunità (`opportunita_id`) per il tracking CRM.
 *
 * Tutti i campi sono controllati e salvano sul progetto via `onChange`.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { filtriRicercaContatti, filtriRicercaParole } from "@/lib/ricerca/ricercaContatti";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { User, Users, Mail, Phone, X, Check, Briefcase } from "lucide-react";
import type { PavProgetto } from "@/types/pavimenti";
import type { PavFormPatch } from "./types";

interface ContactLite {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

interface OpportunityLite {
  id: string;
  name: string | null;
  value: number | null;
}

interface Props {
  form: Partial<PavProgetto>;
  onChange: <K extends keyof PavFormPatch>(key: K, value: PavFormPatch[K]) => void;
}

const contactLabel = (c: { first_name: string | null; last_name: string | null; email: string | null }) =>
  `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.email || "Senza nome";

export default function StepCliente({ form, onChange }: Props) {
  const companyId = useEffectiveCompanyId();
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [oppPickerOpen, setOppPickerOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [oppSearch, setOppSearch] = useState("");

  const { data: contacts = [] } = useQuery({
    queryKey: ["pav-contact-picker", companyId, contactSearch],
    enabled: !!companyId && contactPickerOpen,
    queryFn: async (): Promise<ContactLite[]> => {
      let query = supabase
        .from("marketing_contacts")
        .select("id, first_name, last_name, email, phone")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .limit(20);
      for (const filtro of filtriRicercaContatti(contactSearch)) query = query.or(filtro);
      const { data, error } = await query.order("first_name");
      if (error) throw error;
      return (data ?? []) as ContactLite[];
    },
  });

  const { data: opportunities = [] } = useQuery({
    queryKey: ["pav-opp-picker", companyId, oppSearch],
    enabled: !!companyId && oppPickerOpen,
    queryFn: async (): Promise<OpportunityLite[]> => {
      let query = supabase
        .from("marketing_opportunities")
        .select("id, name, value")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .limit(20);
      for (const filtro of filtriRicercaParole(oppSearch, ["name"])) query = query.or(filtro);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OpportunityLite[];
    },
  });

  const handleSelectContact = (c: ContactLite) => {
    onChange("cliente_id", c.id);
    onChange("cliente_nome", c.first_name);
    onChange("cliente_cognome", c.last_name);
    onChange("cliente_email", c.email);
    onChange("cliente_telefono", c.phone);
    setContactPickerOpen(false);
  };

  return (
    <Card>
      <CardContent className="p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-orange-50 text-orange-600 flex items-center justify-center">
            <User className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Cliente</h2>
            <p className="text-[11px] text-muted-foreground">
              Collega un contatto CRM o compila i dati. Verranno usati nel preventivo PDF.
            </p>
          </div>
        </div>

        {/* Collegamento contatto CRM */}
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2.5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900">
                {form.cliente_id ? "Contatto CRM collegato" : "Contatto CRM"}
              </p>
              <p className="truncate text-[11px] text-slate-500">
                {form.cliente_id
                  ? "Dati sincronizzati nel progetto."
                  : "Collega un contatto per compilare anagrafica e recapiti."}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {form.cliente_id && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange("cliente_id", null)}
                  className="h-8 px-2 text-xs text-slate-600 hover:bg-slate-100"
                >
                  Scollega
                </Button>
              )}
              <Popover open={contactPickerOpen} onOpenChange={setContactPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 border-slate-200 px-3 text-xs text-slate-700 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                  >
                    <Users className="h-3.5 w-3.5" />
                    {form.cliente_id ? "Cambia" : "Seleziona da CRM"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="end">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Cerca contatto..."
                      value={contactSearch}
                      onValueChange={setContactSearch}
                    />
                    <CommandList>
                      <CommandEmpty>Nessun contatto trovato</CommandEmpty>
                      <CommandGroup>
                        {contacts.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={c.id}
                            onSelect={() => handleSelectContact(c)}
                          >
                            <Check
                              className={`mr-2 h-4 w-4 ${form.cliente_id === c.id ? "opacity-100" : "opacity-0"}`}
                            />
                            <span className="truncate">{contactLabel(c)}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>

        {/* Anagrafica */}
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 sm:col-span-6">
            <Label className="text-xs">Nome</Label>
            <Input
              value={form.cliente_nome ?? ""}
              onChange={(e) => onChange("cliente_nome", e.target.value || null)}
              placeholder="Mario"
              className="h-9"
            />
          </div>
          <div className="col-span-12 sm:col-span-6">
            <Label className="text-xs">Cognome</Label>
            <Input
              value={form.cliente_cognome ?? ""}
              onChange={(e) => onChange("cliente_cognome", e.target.value || null)}
              placeholder="Rossi"
              className="h-9"
            />
          </div>
          <div className="col-span-12 sm:col-span-6">
            <Label className="text-xs flex items-center gap-1">
              <Mail className="h-3 w-3" /> Email
            </Label>
            <Input
              type="email"
              value={form.cliente_email ?? ""}
              onChange={(e) => onChange("cliente_email", e.target.value || null)}
              placeholder="mario.rossi@email.it"
              className="h-9"
            />
          </div>
          <div className="col-span-12 sm:col-span-6">
            <Label className="text-xs flex items-center gap-1">
              <Phone className="h-3 w-3" /> Telefono
            </Label>
            <Input
              value={form.cliente_telefono ?? ""}
              onChange={(e) => onChange("cliente_telefono", e.target.value || null)}
              placeholder="+39 333 1234567"
              className="h-9"
            />
          </div>
        </div>

        {/* Collegamento opportunità CRM */}
        <div className="rounded-md border border-dashed border-slate-200 bg-slate-50/40 px-3 py-2.5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5 text-slate-500" />
                Opportunità CRM (opzionale)
              </p>
              <p className="truncate text-[11px] text-slate-500">
                Collega il progetto a un'opportunità per il tracking nel pipeline.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {form.opportunita_id ? (
                <Badge variant="secondary" className="gap-1.5 py-1 pl-2.5 pr-1">
                  Collegata
                  <button
                    type="button"
                    onClick={() => onChange("opportunita_id", null)}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-background/60"
                    aria-label="Rimuovi collegamento opportunità"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ) : (
                <Popover open={oppPickerOpen} onOpenChange={setOppPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                      <Briefcase className="h-3.5 w-3.5" />
                      Collega opportunità
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-0" align="end">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Cerca opportunità..."
                        value={oppSearch}
                        onValueChange={setOppSearch}
                      />
                      <CommandList>
                        <CommandEmpty>Nessuna opportunità trovata</CommandEmpty>
                        <CommandGroup>
                          {opportunities.map((o) => (
                            <CommandItem
                              key={o.id}
                              value={o.id}
                              onSelect={() => {
                                onChange("opportunita_id", o.id);
                                setOppPickerOpen(false);
                              }}
                            >
                              <Check className="mr-2 h-4 w-4 opacity-0" />
                              <span className="truncate">{o.name || "Senza nome"}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
