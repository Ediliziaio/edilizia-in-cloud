/**
 * «Collega a»: a chi appartiene un'attività (23/09/2026).
 *
 * Nella pagina Attività si poteva solo scrivere titolo e categoria: un'attività
 * «RICHIAMARE» con categoria «Opportunità» nasceva senza cliente e senza
 * opportunità, quindi non compariva né nella scheda del contatto né in quella
 * dell'opportunità (Elena, Ener Italia). Qui si sceglie a chi attaccarla,
 * cercando tra contatti e opportunità dell'azienda.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandList, CommandItem } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown, Loader2, Target, User, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/useDebounce";
import { filtriRicercaContatti, filtriRicercaParole } from "@/lib/ricerca/ricercaContatti";

export interface CollegamentoAttivita {
  tipo: "contatto" | "opportunita";
  id: string;
  etichetta: string;
  /** Contatto dell'opportunità: l'attività si vede anche nella sua scheda. */
  contactId?: string | null;
}

export function CollegaAttivitaPicker({
  companyId,
  valore,
  onChange,
  disabled,
}: {
  companyId?: string | null;
  valore: CollegamentoAttivita | null;
  onChange: (v: CollegamentoAttivita | null) => void;
  disabled?: boolean;
}) {
  const [aperto, setAperto] = useState(false);
  const [ricerca, setRicerca] = useState("");
  // Una ricerca ogni 300 ms di pausa, non a ogni lettera.
  const ricercaRitardata = useDebounce(ricerca.trim(), 300);

  const { data, isFetching } = useQuery({
    queryKey: ["collegamento-attivita", companyId, ricercaRitardata],
    enabled: aperto && !!companyId,
    staleTime: 30_000,
    queryFn: async (): Promise<CollegamentoAttivita[]> => {
      const q = ricercaRitardata;

      let opp = supabase
        .from("marketing_opportunities")
        .select("id, name, contact_id")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(8);
      for (const filtro of filtriRicercaParole(q, ["name"])) opp = opp.or(filtro);

      // I contatti si cercano solo scrivendo: sono migliaia, un elenco a caso
      // non aiuta nessuno.
      let contatti = q
        ? supabase
            .from("marketing_contacts")
            .select("id, first_name, last_name, email")
            .eq("company_id", companyId!)
            .is("deleted_at", null)
            .limit(8)
        : null;
      if (contatti) for (const filtro of filtriRicercaContatti(q)) contatti = contatti.or(filtro);

      const [risOpp, risCont] = await Promise.all([opp, contatti]);
      const opportunita: CollegamentoAttivita[] = (risOpp.data ?? []).map((o) => ({
        tipo: "opportunita",
        id: o.id as string,
        etichetta: (o.name as string) || "Opportunità senza nome",
        contactId: (o.contact_id as string | null) ?? null,
      }));
      const persone: CollegamentoAttivita[] = (risCont?.data ?? []).map((c) => ({
        tipo: "contatto",
        id: c.id as string,
        etichetta: [c.first_name, c.last_name].filter(Boolean).join(" ") || (c.email as string) || "Contatto",
      }));
      return [...opportunita, ...persone];
    },
  });

  const risultati = data ?? [];
  const opportunita = risultati.filter((r) => r.tipo === "opportunita");
  const contatti = risultati.filter((r) => r.tipo === "contatto");

  return (
    <div className="flex items-center gap-1.5">
      <Popover open={aperto} onOpenChange={setAperto}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            disabled={disabled}
            className="h-9 w-full justify-between gap-2 px-3 font-normal"
          >
            <span className={cn("truncate", !valore && "text-muted-foreground")}>
              {valore ? valore.etichetta : "Nessuno — cerca cliente o opportunità"}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(420px,calc(100vw-2rem))] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Cerca cliente o opportunità…" value={ricerca} onValueChange={setRicerca} />
            <CommandList className="max-h-64">
              {isFetching && risultati.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Cerco…
                </div>
              ) : (
                <CommandEmpty>Nessun risultato</CommandEmpty>
              )}
              {opportunita.length > 0 && (
                <CommandGroup heading="Opportunità">
                  {opportunita.map((o) => (
                    <CommandItem
                      key={`opp-${o.id}`}
                      value={`opp-${o.id}`}
                      onSelect={() => { onChange(o); setAperto(false); }}
                      className="gap-2"
                    >
                      <Check className={cn("h-4 w-4 shrink-0", valore?.id === o.id ? "opacity-100" : "opacity-0")} />
                      <Target className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{o.etichetta}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {contatti.length > 0 && (
                <CommandGroup heading="Clienti e contatti">
                  {contatti.map((c) => (
                    <CommandItem
                      key={`cont-${c.id}`}
                      value={`cont-${c.id}`}
                      onSelect={() => { onChange(c); setAperto(false); }}
                      className="gap-2"
                    >
                      <Check className={cn("h-4 w-4 shrink-0", valore?.id === c.id ? "opacity-100" : "opacity-0")} />
                      <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{c.etichetta}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {valore && !disabled && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 text-muted-foreground"
          title="Togli il collegamento"
          aria-label="Togli il collegamento"
          onClick={() => onChange(null)}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

/** Etichetta breve del collegamento di un'attività, per le righe dell'elenco. */
export function etichettaCollegamento(task: {
  contatto?: { first_name?: string | null; last_name?: string | null } | null;
  opportunita?: { name?: string | null } | null;
}): { testo: string; icona: "contatto" | "opportunita" } | null {
  const nomeOpp = task.opportunita?.name?.trim();
  if (nomeOpp) return { testo: nomeOpp, icona: "opportunita" };
  const nome = [task.contatto?.first_name, task.contatto?.last_name].filter(Boolean).join(" ").trim();
  if (nome) return { testo: nome, icona: "contatto" };
  return null;
}
