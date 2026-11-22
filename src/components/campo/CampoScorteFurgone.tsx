import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2, Minus, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatoQuantitaMagazzino } from "@/lib/campo/magazzino";
import { toast } from "sonner";

interface ScortaFurgone {
  id: string;
  descrizione: string;
  quantita: number | null;
  quantita_minima: number | null;
  unita_misura: string | null;
}

const statiScorta = {
  esaurita: { label: "Esaurita", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  bassa: { label: "Bassa", className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300" },
  disponibile: { label: "OK", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
} as const;

export function CampoScorteFurgone({ companyId }: { companyId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [scortaApertaId, setScortaApertaId] = useState<string | null>(null);

  // Scorte furgone personali
  const scorteQuery = useQuery({
    queryKey: ["scorte-furgone-campo", companyId, user?.id],
    queryFn: async (): Promise<ScortaFurgone[]> => {
      const { data, error } = await supabase
        .from("scorte_furgone")
        .select("id, descrizione, quantita, quantita_minima, unita_misura")
        .eq("company_id", companyId)
        .eq("tecnico_id", user!.id)
        .order("descrizione");
      if (error) throw error;
      return (data ?? []) as ScortaFurgone[];
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });
  const scorte = scorteQuery.data ?? [];

  const updateQtaMutation = useMutation({
    mutationFn: async ({ id, delta }: { id: string; delta: number }) => {
      const scorta = scorte.find((s) => s.id === id);
      if (!scorta) throw new Error("Scorta non trovata");
      const newQta = Math.max(0, (scorta.quantita ?? 0) + delta);
      const { error } = await supabase
        .from("scorte_furgone")
        .update({ quantita: newQta })
        .eq("company_id", companyId)
        .eq("tecnico_id", user!.id)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scorte-furgone-campo"] }),
    onError: (err: unknown) =>
      toast.error("Errore aggiornamento", {
        description: err instanceof Error ? err.message : "Riprova tra qualche istante.",
      }),
  });

  // Riordino → ticket all'ufficio (stessa forma di CampoTicketNuovo)
  const segnalaMutation = useMutation({
    mutationFn: async (scorta: ScortaFurgone) => {
      if (!companyId) throw new Error("Azienda non disponibile, riprova tra un istante");
      const testo = `Scorta furgone in esaurimento: ${scorta.descrizione}. Quantità attuale: ${scorta.quantita ?? 0} ${scorta.unita_misura ?? "pz"} (minimo ${scorta.quantita_minima ?? 1}).`;
      const { error } = await supabase.from("tickets").insert({
        company_id: companyId,
        created_by: user!.id,
        customer_id: null,
        subject: `Riordino materiale: ${scorta.descrizione}`,
        titolo: `Riordino materiale: ${scorta.descrizione}`,
        descrizione: testo,
        priorita: "alta",
        priority: "alta",
        status: "aperto",
        fonte: "campo",
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Segnalazione inviata all'ufficio"),
    onError: (err: unknown) =>
      toast.error("Errore segnalazione riordino", {
        description: err instanceof Error ? err.message : "Riprova tra qualche istante.",
      }),
  });

  if (scorteQuery.isLoading) return (
    <div role="status" className="flex justify-center py-5 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="sr-only">Carico le scorte</span>
    </div>
  );
  if (scorteQuery.isError) return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-2.5 text-sm">
      <p>Impossibile caricare le scorte.</p>
      <Button variant="outline" size="sm" className="min-h-11" onClick={() => void scorteQuery.refetch()} disabled={scorteQuery.isFetching}>
        {scorteQuery.isFetching ? "Riprovo…" : "Riprova"}
      </Button>
    </div>
  );
  if (scorte.length === 0) return (
    <p className="rounded-xl border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">Nessuna scorta assegnata.</p>
  );

  const scarseCount = scorte.filter((s) => (s.quantita ?? 0) <= (s.quantita_minima ?? 1)).length;
  return (
    <>
      {scarseCount > 0 && <p className="mb-1.5 px-0.5 text-xs font-medium text-muted-foreground">{scarseCount} da riordinare</p>}
      <ul aria-label="Scorte furgone" className="divide-y rounded-xl border bg-card">
        {scorte.map((s) => {
          const qta = s.quantita ?? 0;
          const isScarso = qta <= (s.quantita_minima ?? 1);
          const stato = qta <= 0 ? statiScorta.esaurita : isScarso ? statiScorta.bassa : statiScorta.disponibile;
          const invioSegnalazione = segnalaMutation.isPending && segnalaMutation.variables?.id === s.id;
          return (
            <Collapsible key={s.id} asChild open={scortaApertaId === s.id}
              onOpenChange={(aperta) => setScortaApertaId(aperta ? s.id : null)}>
              <li className="first:rounded-t-xl last:rounded-b-xl">
                <CollapsibleTrigger type="button"
                  className="group grid min-h-11 w-full grid-cols-[minmax(0,1fr)_fit-content(35%)_3.5rem_1rem] items-center gap-1.5 rounded-[inherit] px-2.5 py-1.5 text-left text-sm leading-tight hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                  <span className="[overflow-wrap:anywhere]">{s.descrizione}</span>
                  <span className="text-right font-semibold tabular-nums [overflow-wrap:anywhere]">
                    {formatoQuantitaMagazzino.format(qta)} {s.unita_misura || "pz"}
                  </span>
                  <span className={`justify-self-end rounded-full px-1.5 text-xs font-semibold leading-5 ${stato.className}`}>
                    {stato === statiScorta.disponibile ? (
                      <><span aria-hidden="true">{stato.label}</span><span className="sr-only">Disponibile</span></>
                    ) : stato.label}
                  </span>
                  <ChevronDown aria-hidden="true" className="h-4 w-4 text-muted-foreground group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="flex flex-wrap items-center justify-between gap-2 px-2.5 pb-2 data-[state=closed]:hidden">
                  <div className="flex items-center gap-1.5">
                    <Button type="button" variant="outline" size="icon" className="min-h-11 w-11"
                      onClick={() => updateQtaMutation.mutate({ id: s.id, delta: -1 })}
                      disabled={qta <= 0 || updateQtaMutation.isPending}
                      aria-label={`Diminuisci ${s.descrizione}`}>
                      <Minus aria-hidden="true" />
                    </Button>
                    <Button type="button" variant="outline" size="icon" className="min-h-11 w-11"
                      onClick={() => updateQtaMutation.mutate({ id: s.id, delta: 1 })}
                      disabled={updateQtaMutation.isPending}
                      aria-label={`Aumenta ${s.descrizione}`}>
                      <Plus aria-hidden="true" />
                    </Button>
                  </div>
                  {isScarso && (
                    <Button type="button" variant="outline" size="sm" className="min-h-11 text-xs"
                      aria-label={`Segnala riordino ${s.descrizione}`} aria-busy={invioSegnalazione}
                      onClick={() => segnalaMutation.mutate(s)} disabled={segnalaMutation.isPending}>
                      {invioSegnalazione ? "Invio…" : "Segnala"}
                    </Button>
                  )}
                </CollapsibleContent>
              </li>
            </Collapsible>
          );
        })}
      </ul>
    </>
  );
}
