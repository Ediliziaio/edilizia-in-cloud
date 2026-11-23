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
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function ScegliMezzoFattura({
  companyId,
  collegati,
  occupato,
  onSelect,
  ricercaIniziale = "",
}: {
  companyId: string;
  collegati: Set<string>;
  occupato: boolean;
  onSelect: (id: string) => void;
  ricercaIniziale?: string;
}) {
  const t = useT();
  const [cerca, setCerca] = useState(ricercaIniziale);
  const termine = useDebounce(cerca, 250);
  const q = useQuery({
    queryKey: ["fattura-collegamenti-mezzi", companyId, termine],
    queryFn: async () => {
      let query = supabase
        .from("mezzi")
        .select("id, nome, targa, matricola, codice")
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
  // I mezzi già collegati restano in elenco, spenti e con l'etichetta (16/11/2026).
  // Prima sparivano: all'Impresa Vulcano cercavano la targa che vedevano in fattura,
  // leggevano «Nessun mezzo disponibile» e concludevano che il mezzo non c'era — mentre
  // era lì sopra, già collegato.
  const voci = (q.data ?? []).slice(0, 100);
  return (
    <Command shouldFilter={false}>
      <CommandInput
        aria-label={t("Cerca mezzo per nome o targa")}
        placeholder={t("Cerca nome o targa…")}
        value={cerca}
        onValueChange={setCerca}
        disabled={occupato}
      />
      <CommandList aria-label={t("Mezzi disponibili")} className="max-h-64">
        {q.isFetching ? (
          <p role="status" className="p-3 text-xs text-muted-foreground">
            {t("Cerco i mezzi…")}
          </p>
        ) : q.isError ? (
          <p role="alert" className="p-3 text-xs text-destructive">
            {messaggioSalvataggio(q.error)}{" "}
            <button
              type="button"
              className="underline"
              onClick={() => void q.refetch()}
            >
              {t("Riprova")}
            </button>
          </p>
        ) : !voci.length ? (
          <p className="p-3 text-xs text-muted-foreground">
            {t("Nessun mezzo disponibile per questa ricerca.")}
          </p>
        ) : (
          voci.map((m) => {
            const gia = collegati.has(m.id);
            return (
              <CommandItem
                key={m.id}
                value={m.id}
                disabled={occupato || gia}
                onSelect={() => !gia && onSelect(m.id)}
                className="items-start py-2.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{m.nome}</span>
                  {(m.targa || m.matricola || m.codice) && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {m.targa ?? [m.codice, m.matricola].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
                {gia && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t("già collegato")}
                  </span>
                )}
              </CommandItem>
            );
          })
        )}
      </CommandList>
      {(q.data?.length ?? 0) > 100 && (
        <p className="border-t p-2 text-xs text-muted-foreground">
          {t("Primi 100 risultati. Scrivi il nome o la targa per restringere la ricerca.")}
        </p>
      )}
    </Command>
  );
}
