import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/useDebounce";
import {
  filtroRicercaMezzo,
  messaggioSalvataggio,
} from "@/lib/fatturazione/salvataggioFattura";
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export function ScegliMezzoFattura({
  companyId,
  collegati,
  occupato,
  onSelect,
}: {
  companyId: string;
  collegati: Set<string>;
  occupato: boolean;
  onSelect: (id: string) => void;
}) {
  const [cerca, setCerca] = useState("");
  const termine = useDebounce(cerca, 250);
  const q = useQuery({
    queryKey: ["fattura-collegamenti-mezzi", companyId, termine],
    queryFn: async () => {
      let query = supabase
        .from("mezzi")
        .select("id, nome, targa")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("nome")
        .limit(101);
      const filtro = filtroRicercaMezzo(termine);
      if (filtro) query = query.or(filtro);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
  const voci = (q.data ?? []).filter((m) => !collegati.has(m.id)).slice(0, 100);
  return (
    <Command shouldFilter={false}>
      <CommandInput
        aria-label="Cerca mezzo per nome o targa"
        placeholder="Cerca nome o targa…"
        value={cerca}
        onValueChange={setCerca}
        disabled={occupato}
      />
      <CommandList aria-label="Mezzi disponibili" className="max-h-64">
        {q.isFetching ? (
          <p role="status" className="p-3 text-xs text-muted-foreground">
            Cerco i mezzi…
          </p>
        ) : q.isError ? (
          <p role="alert" className="p-3 text-xs text-destructive">
            {messaggioSalvataggio(q.error)}{" "}
            <button
              type="button"
              className="underline"
              onClick={() => void q.refetch()}
            >
              Riprova
            </button>
          </p>
        ) : !voci.length ? (
          <p className="p-3 text-xs text-muted-foreground">
            Nessun mezzo disponibile per questa ricerca.
          </p>
        ) : (
          voci.map((m) => (
            <CommandItem
              key={m.id}
              value={m.id}
              disabled={occupato}
              onSelect={() => onSelect(m.id)}
              className="items-start py-2.5"
            >
              <span className="min-w-0">
                <span className="block truncate">{m.nome}</span>
                {m.targa && (
                  <span className="text-xs text-muted-foreground">
                    {m.targa}
                  </span>
                )}
              </span>
            </CommandItem>
          ))
        )}
      </CommandList>
      {(q.data?.length ?? 0) > 100 && (
        <p className="border-t p-2 text-xs text-muted-foreground">
          Primi 100 risultati. Scrivi il nome o la targa per restringere la
          ricerca.
        </p>
      )}
    </Command>
  );
}
