/**
 * FvContactPicker — collega il preventivo fotovoltaico a un contatto CRM
 * esistente (marketing_contacts). Stesso pattern del wizard Ristrutturazione/
 * Serramenti: Popover + Command; alla selezione popola nome/cognome/email/
 * telefono e salva `cliente_id`. Componente isolato per non gonfiare il wizard.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { filtriRicercaContatti } from "@/lib/ricerca/ricercaContatti";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useDebounce } from "@/hooks/useDebounce";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Users, Check } from "lucide-react";

export interface FvContactLite {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

const contactLabel = (c: {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}) => `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.email || "Senza nome";

export function FvContactPicker({
  clienteId,
  onSelect,
  onClear,
}: {
  clienteId: string | null;
  onSelect: (c: FvContactLite) => void;
  onClear: () => void;
}) {
  const companyId = useEffectiveCompanyId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 250);

  const { data: contacts = [] } = useQuery({
    queryKey: ["fv-contact-picker", companyId, debouncedSearch],
    enabled: !!companyId && open,
    queryFn: async (): Promise<FvContactLite[]> => {
      let q = supabase
        .from("marketing_contacts")
        .select("id, first_name, last_name, email, phone")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .limit(20);
      for (const filtro of filtriRicercaContatti(debouncedSearch)) q = q.or(filtro);
      const { data, error } = await q.order("first_name", { nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as FvContactLite[];
    },
  });

  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2.5 mb-3">
      {/* Telefono: una riga, titolo corto e bottoni; la spiegazione resta al computer. */}
      <div className="flex flex-row items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold">
            <span className="max-md:hidden">{clienteId ? "Contatto CRM collegato" : "Collega a un contatto esistente"}</span>
            <span className="md:hidden">Contatto CRM</span>
          </p>
          <p className="truncate text-[11px] text-muted-foreground max-md:hidden">
            {clienteId
              ? "Anagrafica e recapiti sincronizzati dal contatto."
              : "Seleziona un contatto dal CRM per compilare automaticamente i dati."}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {clienteId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="tap-compact h-8 px-2 text-xs text-muted-foreground"
            >
              Scollega
            </Button>
          )}
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="tap-compact h-8 gap-1.5 px-3 text-xs">
                <Users className="h-3.5 w-3.5" />
                {clienteId ? "Cambia" : "Seleziona da CRM"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="end">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Cerca contatto..."
                  value={search}
                  onValueChange={setSearch}
                />
                <CommandList>
                  <CommandEmpty>Nessun contatto trovato</CommandEmpty>
                  <CommandGroup>
                    {contacts.map((c) => (
                      <CommandItem
                        key={c.id}
                        value={c.id}
                        onSelect={() => {
                          onSelect(c);
                          setOpen(false);
                        }}
                      >
                        <Check
                          className={`mr-2 h-4 w-4 ${clienteId === c.id ? "opacity-100" : "opacity-0"}`}
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
  );
}
