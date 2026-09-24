import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { altreNote } from "@/lib/marketing/autoreNota";
import { oggiRoma, scadenzaAttivita } from "@/lib/opportunitaAgenda";
import { nomiPersone } from "@/lib/marketing/nomiPersone";

const MOSTRATE = 4;

interface AttivitaAnteprima {
  id: string;
  title: string | null;
  due_date: string | null;
  assigned_to: string | null;
}

/**
 * Le attività da fare di quel contatto in quell'opportunità, per il riquadro
 * sull'icona delle attività della card: si carica solo quando il riquadro si
 * apre, come AnteprimaAppunti.
 */
export function AnteprimaAttivita({ opportunityId, contactId, totale }: {
  opportunityId: string;
  contactId: string | null;
  totale: number;
}) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const oggi = oggiRoma();

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.marketingContacts.attivitaPreview(opportunityId),
    queryFn: async () => {
      // Quelle dell'opportunità, e quelle del contatto non legate a un'altra.
      const { data: righe, error } = await supabase
        .from("tasks")
        .select("id, title, due_date, assigned_to")
        .eq("company_id", companyId!)
        .neq("status", "completata")
        .or(contactId
          ? `opportunity_id.eq.${opportunityId},and(opportunity_id.is.null,contact_id.eq.${contactId})`
          : `opportunity_id.eq.${opportunityId}`)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(MOSTRATE);
      if (error) throw error;
      const attivita = (righe ?? []) as AttivitaAnteprima[];
      return { attivita, nomi: await nomiPersone(attivita.map((t) => t.assigned_to)) };
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });

  if (isLoading) return <p className="text-muted-foreground">Carico le attività…</p>;
  if (isError || !data) return <p>{`Attività da fare (${totale})`}</p>;

  // Il numero della scheda può essere di qualche secondo fa: non meno di quelle a schermo.
  const tutte = Math.max(totale, data.attivita.length);
  const altre = altreNote(tutte, data.attivita.length);
  return (
    <div className="space-y-1.5 py-0.5">
      <p className="font-semibold">{`Attività da fare (${tutte})`}</p>
      {data.attivita.length === 0 && <p className="text-[10px] text-muted-foreground">Nessuna da fare</p>}
      {data.attivita.map((t) => {
        const scadenza = scadenzaAttivita(t.due_date, oggi);
        const chi = t.assigned_to ? data.nomi[t.assigned_to] : "";
        return (
          <div key={t.id} className="border-t border-border/60 pt-1.5">
            <p className="line-clamp-2 break-words">{t.title || "Attività senza titolo"}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              <span className={cn(scadenza.scaduta && "font-semibold text-destructive")}>{scadenza.testo}</span>
              {chi ? ` · ${chi}` : ""}
            </p>
          </div>
        );
      })}
      {altre && <p className="text-[10px] text-muted-foreground">{altre}</p>}
    </div>
  );
}
