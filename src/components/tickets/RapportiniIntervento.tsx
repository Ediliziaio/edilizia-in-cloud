/**
 * I rapportini di un intervento (27/09/2026): chi l'ha fatto, quando, le ore,
 * le foto, la firma e lo stato. Li scrive la «Chiusura intervento» (ufficio) e,
 * dall'app, chi ci lavora. Qui, sulla scheda dell'intervento, si vedono tutti.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { ClipboardCheck, Clock3, Camera, PenLine, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RapportinoRiga {
  id: string;
  numero: number | null;
  data_intervento: string | null;
  descrizione: string | null;
  ore_lavoro: number | null;
  ore_lavoro_effettive: number | null;
  foto_urls: string[] | null;
  foto_chiusura: string[] | null;
  firma_cliente: string | null;
  firma_tecnico_url: string | null;
  stato: string | null;
  tecnico: { first_name: string | null; last_name: string | null } | null;
}

const STATO_META: Record<string, { label: string; cls: string }> = {
  bozza: { label: "Bozza", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  firmato: { label: "Firmato", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  fatturato: { label: "Fatturato", cls: "bg-violet-50 text-violet-700 border-violet-200" },
};

/**
 * Su un intervento si filtra per `ticketId`; sulla scheda di un impianto per
 * `impiantoId` (così la manutenzione vede tutti i rapportini fatti su quell'impianto,
 * qualunque sia l'intervento). Il pulsante «Compila» compare solo sull'intervento:
 * un rapportino nasce sempre da un intervento, mai dall'impianto in astratto.
 */
export function RapportiniIntervento({
  ticketId,
  impiantoId,
  canEdit = false,
}: {
  ticketId?: string;
  impiantoId?: string;
  canEdit?: boolean;
}) {
  const { effectiveCompany } = useAuth();
  const perImpianto = !ticketId && !!impiantoId;
  const { data: rapportini = [], isLoading } = useQuery({
    queryKey: ["rapportini-intervento", ticketId ?? `impianto:${impiantoId}`],
    enabled: (!!ticketId || !!impiantoId) && !!effectiveCompany?.id,
    queryFn: async () => {
      let q = supabase
        .from("rapportini_intervento")
        .select("id, numero, data_intervento, descrizione, ore_lavoro, ore_lavoro_effettive, foto_urls, foto_chiusura, firma_cliente, firma_tecnico_url, stato, tecnico:profiles!rapportini_intervento_tecnico_id_fkey(first_name, last_name)")
        .eq("company_id", effectiveCompany!.id);
      q = ticketId ? q.eq("ticket_id", ticketId) : q.eq("impianto_id", impiantoId!);
      const { data, error } = await q.order("data_intervento", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RapportinoRiga[];
    },
  });

  if (isLoading) return <Skeleton className="h-20 w-full rounded-lg" />;

  const nomeTecnico = (r: RapportinoRiga) =>
    [r.tecnico?.first_name, r.tecnico?.last_name].filter(Boolean).join(" ") || "Tecnico";
  const foto = (r: RapportinoRiga) => (r.foto_urls?.length ?? 0) + (r.foto_chiusura?.length ?? 0);
  const ore = (r: RapportinoRiga) => r.ore_lavoro_effettive ?? r.ore_lavoro;

  return (
    <div className="rounded-lg border bg-background">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <ClipboardCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Rapportini {rapportini.length > 0 && <span className="text-muted-foreground">({rapportini.length})</span>}
        </p>
        {canEdit && !perImpianto && ticketId && (
          <Button asChild size="sm" variant="outline" className="h-7 gap-1 text-xs">
            <Link to={`/azienda/assistenza/${ticketId}/chiudi`}>
              <Plus className="h-3.5 w-3.5" />{rapportini.length > 0 ? "Nuovo" : "Compila"}
            </Link>
          </Button>
        )}
      </div>

      {rapportini.length === 0 ? (
        <p className="px-3 py-4 text-center text-sm text-muted-foreground">
          {perImpianto
            ? "Ancora nessun rapportino su questo impianto. Compare qui appena chi interviene ne compila uno."
            : "Ancora nessun rapportino. Lo compila chi fa l'intervento, dall'app o dalla chiusura."}
        </p>
      ) : (
        <ul className="divide-y">
          {rapportini.map((r) => {
            const stato = STATO_META[r.stato ?? "bozza"] ?? STATO_META.bozza;
            return (
              <li key={r.id} className="px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {nomeTecnico(r)}
                      {r.data_intervento && (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                          {format(parseISO(r.data_intervento), "d MMM yyyy", { locale: it })}
                        </span>
                      )}
                    </p>
                    {r.descrizione && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{r.descrizione}</p>}
                  </div>
                  <Badge variant="outline" className={cn("shrink-0 text-[10px]", stato.cls)}>{stato.label}</Badge>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {ore(r) != null && <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{Number(ore(r)).toLocaleString("it-IT")} h</span>}
                  {foto(r) > 0 && <span className="inline-flex items-center gap-1"><Camera className="h-3 w-3" />{foto(r)} foto</span>}
                  {(r.firma_cliente || r.firma_tecnico_url) && <span className="inline-flex items-center gap-1"><PenLine className="h-3 w-3" />firmato</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
