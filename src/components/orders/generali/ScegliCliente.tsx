// src/components/orders/generali/ScegliCliente.tsx
import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CreateCustomerDialog } from "@/components/orders/CreateCustomerDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyCustomers, type CompanyCustomer } from "@/hooks/useCompanyCustomers";
import { cn } from "@/lib/utils";

const nomeCliente = (c: Pick<CompanyCustomer, "first_name" | "last_name" | "email">) =>
  [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.email || "Cliente senza nome";

/**
 * Un cliente dell'azienda, cercato per nome. Facoltativo: si può togliere.
 * Con `consentiNuovo` si crea anche da qui (15/11/2026): per l'appalto il committente è
 * obbligatorio, e se non era in anagrafica il popup della generale era un vicolo cieco.
 */
export function ScegliCliente({ id, valore, onCambia, consentiNuovo = false }: { id: string; valore: string | null; onCambia: (id: string | null) => void; consentiNuovo?: boolean }) {
  const { effectiveCompany } = useAuth();
  const { data: clienti = [], isLoading } = useCompanyCustomers(effectiveCompany?.id);
  const [aperto, setAperto] = useState(false);
  const [cerca, setCerca] = useState("");
  const [nuovo, setNuovo] = useState<{ nome: string } | null>(null);
  // Il nome del cliente appena creato, finché l'elenco non si ricarica e lo contiene.
  const [appenaCreato, setAppenaCreato] = useState<{ id: string; nome: string } | null>(null);
  const scelto = useMemo(() => clienti.find((c) => c.id === valore) ?? null, [clienti, valore]);
  const nomeScelto = scelto ? nomeCliente(scelto) : appenaCreato && appenaCreato.id === valore ? appenaCreato.nome : null;

  const apriNuovo = (nome: string) => { setAperto(false); setNuovo({ nome: nome.trim() }); };

  return (
    <div className="flex gap-1.5">
      <Popover open={aperto} onOpenChange={(o) => { setAperto(o); if (!o) setCerca(""); }}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={aperto} className="h-9 min-w-0 flex-1 justify-between font-normal">
            <span className={cn("truncate", !nomeScelto && "text-muted-foreground")}>
              {nomeScelto ?? (isLoading ? "Carico i clienti…" : "Cerca tra i clienti")}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Nome del cliente…" value={cerca} onValueChange={setCerca} />
            <CommandList>
              <CommandEmpty className="px-2 py-3 text-sm">
                {consentiNuovo && cerca.trim() ? (
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-full justify-start font-normal" onClick={() => apriNuovo(cerca)}>
                    <Plus className="mr-2 h-4 w-4" /> Crea «{cerca.trim()}»
                  </Button>
                ) : (
                  <span className="block text-center text-muted-foreground">Nessun cliente con questo nome.</span>
                )}
              </CommandEmpty>
              <CommandGroup>
                {clienti.map((c) => (
                  <CommandItem key={c.id} value={`${nomeCliente(c)} ${c.email ?? ""} ${c.id}`} onSelect={() => { onCambia(c.id); setAperto(false); }}>
                    <Check className={cn("mr-2 h-4 w-4", c.id === valore ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{nomeCliente(c)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {nomeScelto ? (
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Togli il cliente" onClick={() => onCambia(null)}>
          <X className="h-4 w-4" />
        </Button>
      ) : consentiNuovo ? (
        <Button type="button" variant="outline" className="h-9 shrink-0 px-3" onClick={() => apriNuovo("")}>
          <Plus className="mr-1.5 h-4 w-4" /> Nuovo
        </Button>
      ) : null}
      {nuovo && (
        <CreateCustomerDialog
          open
          onOpenChange={(o) => { if (!o) setNuovo(null); }}
          // Committente di un appalto o società dell'operazione: di solito è un'azienda (si cambia nel modulo).
          // Nome e cognome vuoti: sono il referente, e il modulo li ricaverebbe spezzando la ragione
          // sociale («Comune di Milano» → nome «Comune», cognome «di Milano»).
          initialValues={{ fullName: nuovo.nome || undefined, isBusiness: true, firstName: "", lastName: "" }}
          defaultCreatePortalAccount={false}
          onCustomerCreated={(clienteId, nome) => {
            setAppenaCreato({ id: clienteId, nome });
            onCambia(clienteId);
            setNuovo(null);
          }}
        />
      )}
    </div>
  );
}
