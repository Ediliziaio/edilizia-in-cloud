import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { altreNote, firmaNota, type ProfiloAutore } from "@/lib/marketing/autoreNota";

const MOSTRATE = 3;

interface NotaAnteprima {
  id: string;
  content: string | null;
  created_at: string;
  profiles: ProfiloAutore | ProfiloAutore[] | null;
}

/** Le ultime note di un'opportunità, per il riquadro sull'icona della card: si carica solo quando il riquadro si apre. */
export function AnteprimaAppunti({ opportunityId, totale }: { opportunityId: string; totale: number }) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: note, isLoading, isError } = useQuery({
    queryKey: queryKeys.marketingContacts.notesPreview(opportunityId),
    queryFn: async (): Promise<NotaAnteprima[]> => {
      const { data, error } = await supabase
        .from("marketing_contact_notes")
        .select("id, content, created_at, profiles:created_by(first_name, last_name)")
        .eq("company_id", companyId!)
        .eq("opportunity_id", opportunityId)
        .order("created_at", { ascending: false })
        .limit(MOSTRATE);
      if (error) throw error;
      return (data ?? []) as NotaAnteprima[];
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });

  if (isLoading) return <p className="text-muted-foreground">Carico gli appunti…</p>;
  if (isError || !note?.length) return <p>{`Appunti (${totale})`}</p>;

  const altre = altreNote(totale, note.length);
  return (
    <div className="space-y-1.5 py-0.5">
      <p className="font-semibold">{`Appunti (${totale})`}</p>
      {note.map((nota) => (
        <div key={nota.id} className="border-t border-border/60 pt-1.5">
          <p className="line-clamp-3 whitespace-pre-line break-words">{nota.content}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{firmaNota(nota.created_at, nota.profiles)}</p>
        </div>
      ))}
      {altre && <p className="text-[10px] text-muted-foreground">{altre}</p>}
    </div>
  );
}
