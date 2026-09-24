import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { altriAppuntamenti, oggiRoma, quandoAppuntamento } from "@/lib/opportunitaAgenda";
import { nomiPersone } from "@/lib/marketing/nomiPersone";

const MOSTRATI = 3;

interface AppuntamentoAnteprima {
  id: string;
  title: string | null;
  appointment_date: string;
  appointment_time: string | null;
  appointment_end_time: string | null;
  assigned_to: string | null;
  address_city: string | null;
  meeting_url: string | null;
}

/**
 * Gli appuntamenti in programma del contatto, per il riquadro sull'icona del
 * calendario della card: si carica solo quando il riquadro si apre, come
 * AnteprimaAppunti.
 */
export function AnteprimaAppuntamenti({ opportunityId, contactId, totale }: {
  opportunityId: string;
  contactId: string | null;
  totale: number;
}) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const oggi = oggiRoma();

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.marketingContacts.appuntamentiPreview(opportunityId),
    queryFn: async () => {
      // Gli appuntamenti sono del contatto, come il conteggio sulla scheda.
      const { data: righe, error } = await supabase
        .from("appointments")
        .select("id, title, appointment_date, appointment_time, appointment_end_time, assigned_to, address_city, meeting_url")
        .eq("company_id", companyId!)
        .eq("contact_id", contactId!)
        .gte("appointment_date", oggi)
        .neq("status", "annullato")
        .order("appointment_date", { ascending: true })
        .order("appointment_time", { ascending: true, nullsFirst: false })
        .limit(MOSTRATI);
      if (error) throw error;
      const appuntamenti = (righe ?? []) as AppuntamentoAnteprima[];
      return { appuntamenti, nomi: await nomiPersone(appuntamenti.map((a) => a.assigned_to)) };
    },
    enabled: !!companyId && !!contactId,
    staleTime: 60_000,
  });

  if (isLoading) return <p className="text-muted-foreground">Carico gli appuntamenti…</p>;
  if (isError || !data) return <p>{`Appuntamenti (${totale})`}</p>;

  // Il numero della scheda può essere di qualche secondo fa: non meno di quelli a schermo.
  const tutti = Math.max(totale, data.appuntamenti.length);
  const altri = altriAppuntamenti(tutti, data.appuntamenti.length);
  return (
    <div className="space-y-1.5 py-0.5">
      <p className="font-semibold">{`Appuntamenti (${tutti})`}</p>
      {data.appuntamenti.length === 0 && <p className="text-[10px] text-muted-foreground">Nessuno in programma</p>}
      {data.appuntamenti.map((a) => {
        const conChi = a.assigned_to ? data.nomi[a.assigned_to] : "";
        const dettagli = [
          a.title,
          conChi ? `con ${conChi}` : null,
          a.address_city || (a.meeting_url ? "videochiamata" : null),
        ].filter(Boolean).join(" · ");
        return (
          <div key={a.id} className="border-t border-border/60 pt-1.5">
            <p className="font-medium">{quandoAppuntamento(a, oggi)}</p>
            {dettagli && <p className="mt-0.5 line-clamp-2 break-words text-[10px] text-muted-foreground">{dettagli}</p>}
          </div>
        );
      })}
      {altri && <p className="text-[10px] text-muted-foreground">{altri}</p>}
    </div>
  );
}
