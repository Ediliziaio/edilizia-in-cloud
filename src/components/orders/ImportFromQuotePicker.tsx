import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/formatters";
import { QUOTE_STATUS_CONFIG, type QuoteStatus } from "@/lib/quoteStatus";
import { FileText, ChevronsUpDown, Loader2 } from "lucide-react";

/**
 * ImportFromQuotePicker — selettore in pagina "Crea commessa" per importare un
 * preventivo esistente. Carica la lista solo quando aperto (lazy), filtra per
 * numero/cliente/titolo, e su scelta chiama onSelect(quoteId): la commessa
 * eredita righe, prezzi e — per gli articoli su misura — la spina misure.
 */

interface QuoteLite {
  id: string;
  quote_number: string;
  title: string | null;
  client_name: string | null;
  status: string;
  total: number | null;
  created_at: string;
}

interface ImportFromQuotePickerProps {
  onSelect: (quoteId: string) => void;
  disabled?: boolean;
}

export function ImportFromQuotePicker({ onSelect, disabled }: ImportFromQuotePickerProps) {
  const [open, setOpen] = useState(false);
  const companyId = useEffectiveCompanyId();

  const { data: quotes, isLoading } = useQuery({
    queryKey: ["importable-quotes", companyId],
    enabled: open && !!companyId, // fetch solo all'apertura
    staleTime: 60_000,
    queryFn: async (): Promise<QuoteLite[]> => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, quote_number, title, client_name, status, total, created_at")
        // Solo i preventivi di QUESTA azienda: senza, il super admin in «Stai
        // visualizzando» (e chi ha più aziende) li vedeva tutti mescolati e
        // poteva importare in una commessa il preventivo di un'altra azienda.
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as QuoteLite[];
    },
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled} className="gap-2">
          <FileText className="h-4 w-4" />
          Importa da preventivo
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,460px)] p-0" align="start">
        <Command
          filter={(value, search) =>
            value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder="Cerca per numero, cliente, titolo…" />
          <CommandList>
            {isLoading && (
              <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carico i preventivi…
              </div>
            )}
            {!isLoading && <CommandEmpty>Nessun preventivo trovato.</CommandEmpty>}
            <CommandGroup>
              {(quotes ?? []).map((q) => {
                const cfg = QUOTE_STATUS_CONFIG[q.status as QuoteStatus];
                const searchable = [q.quote_number, q.client_name, q.title]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <CommandItem
                    key={q.id}
                    value={`${searchable} ${q.id}`}
                    onSelect={() => {
                      onSelect(q.id);
                      setOpen(false);
                    }}
                    className="flex items-center gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {q.quote_number}
                          {q.client_name ? ` · ${q.client_name}` : ""}
                        </span>
                        {cfg && (
                          <Badge variant="outline" className={`text-[10px] ${cfg.className}`}>
                            {cfg.label}
                          </Badge>
                        )}
                      </div>
                      {q.title && (
                        <p className="truncate text-xs text-muted-foreground">{q.title}</p>
                      )}
                    </div>
                    {q.total != null && (
                      <span className="shrink-0 text-xs font-medium">
                        {formatCurrency(q.total)}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
