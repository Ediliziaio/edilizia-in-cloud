// src/components/orders/generali/ScegliCliente.tsx
import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CreateCustomerDialog } from "@/components/orders/CreateCustomerDialog";
import { RigaCliente } from "@/components/orders/RigaCliente";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyCustomers } from "@/hooks/useCompanyCustomers";
import { cercaClienti, nomeCliente } from "@/lib/orders/nuovaCommessaProposte";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/**
 * Un cliente dell'azienda, cercato per nome. Facoltativo: si può togliere.
 * Con `consentiNuovo` si crea anche da qui (15/11/2026): per l'appalto il committente è
 * obbligatorio, e se non era in anagrafica il popup della generale era un vicolo cieco.
 */
export function ScegliCliente({ id, valore, onCambia, consentiNuovo = false }: { id: string; valore: string | null; onCambia: (id: string | null) => void; consentiNuovo?: boolean }) {
  const t = useT();
  const { effectiveCompany } = useAuth();
  const { data: clienti = [], isLoading } = useCompanyCustomers(effectiveCompany?.id);
  const [aperto, setAperto] = useState(false);
  const [cerca, setCerca] = useState("");
  const [nuovo, setNuovo] = useState<{ nome: string } | null>(null);
  // Il nome del cliente appena creato, finché l'elenco non si ricarica e lo contiene.
  const [appenaCreato, setAppenaCreato] = useState<{ id: string; nome: string } | null>(null);
  const scelto = useMemo(() => clienti.find((c) => c.id === valore) ?? null, [clienti, valore]);
  const nomeScelto = scelto ? nomeCliente(scelto) : appenaCreato && appenaCreato.id === valore ? appenaCreato.nome : null;
  const { risultati, altri } = useMemo(() => cercaClienti(clienti, cerca), [clienti, cerca]);

  const apriNuovo = (nome: string) => { setAperto(false); setNuovo({ nome: nome.trim() }); };

  return (
    <div className="flex gap-1.5">
      <Popover open={aperto} onOpenChange={(o) => { setAperto(o); if (!o) setCerca(""); }}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={aperto} className="h-9 min-w-0 flex-1 justify-between font-normal">
            <span className={cn("truncate", !nomeScelto && "text-muted-foreground")}>
              {nomeScelto ?? (isLoading ? t("Carico i clienti…") : t("Cerca tra i clienti"))}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(40rem,calc(100vw-2rem))] min-w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder={t("Cerca per nome, telefono, indirizzo, email o P.IVA…")} value={cerca} onValueChange={setCerca} className="h-12 text-base" />
            <CommandList className="max-h-[min(28rem,60vh)]">
              <CommandEmpty className="px-3 py-6 text-center text-sm text-muted-foreground">
                {cerca.trim() ? t("Nessun cliente trovato per «{cerca}».", { cerca: cerca.trim() }) : t("Nessun cliente trovato.")}
              </CommandEmpty>
              {risultati.length > 0 && (
                <CommandGroup heading={cerca.trim() ? t("{n} trovati", { n: risultati.length + altri }) : t("{n} clienti", { n: clienti.length })}>
                  {risultati.map((c) => (
                    <CommandItem key={c.id} value={c.id} onSelect={() => { onCambia(c.id); setAperto(false); setCerca(""); }} className="items-start gap-2 py-2.5">
                      <Check className={cn("mt-0.5 h-4 w-4 shrink-0", c.id === valore ? "opacity-100" : "opacity-0")} />
                      <RigaCliente cliente={c} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {altri > 0 && <p className="px-3 py-2 text-xs text-muted-foreground">{t("Altri {n}: scrivi per restringere la ricerca.", { n: altri })}</p>}
            </CommandList>
            {consentiNuovo && (
              <div className="border-t p-1.5">
                <Button type="button" variant="ghost" className="h-9 w-full justify-start font-normal" onClick={() => apriNuovo(/\p{L}/u.test(cerca) && !cerca.includes("@") ? cerca : "")}>
                  <Plus className="mr-2 h-4 w-4" /> {cerca.trim() ? t("Nuovo cliente «{nome}»", { nome: cerca.trim() }) : t("Nuovo cliente")}
                </Button>
              </div>
            )}
          </Command>
        </PopoverContent>
      </Popover>
      {nomeScelto ? (
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label={t("Togli il cliente")} onClick={() => onCambia(null)}>
          <X className="h-4 w-4" />
        </Button>
      ) : consentiNuovo ? (
        <Button type="button" variant="outline" className="h-9 shrink-0 px-3" onClick={() => apriNuovo("")}>
          <Plus className="mr-1.5 h-4 w-4" /> {t("Nuovo")}
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
          onClienteEsistente={(c) => {
            setAppenaCreato({ id: c.id, nome: nomeCliente(c) });
            onCambia(c.id);
            setNuovo(null);
          }}
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
