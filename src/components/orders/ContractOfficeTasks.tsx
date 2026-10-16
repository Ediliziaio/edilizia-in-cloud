import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CONTRACT_OFFICE_PREFIX } from "@/lib/orders/contractOfficeTasks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ContractOfficeTasks({ orderId }: { orderId: string }) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const q = useQuery({
    queryKey: ["contract-office-tasks", companyId, orderId], enabled: !!companyId && !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("id,title,status,notes").eq("company_id",companyId!).eq("order_id",orderId).like("title",`${CONTRACT_OFFICE_PREFIX}%`).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
  if (q.isError) return <p role="alert">Non riesco a caricare gli adempimenti di ufficio. Riprova dalla sezione Attività.</p>;
  if (!q.data?.length) return null;
  return <Card aria-label="Adempimenti ufficio del contratto"><CardHeader><CardTitle className="text-base">Ufficio · gestione del contratto</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><p className="text-muted-foreground">Attività amministrative separate dalle lavorazioni. Le spunte dell’ufficio non aumentano la percentuale del cantiere.</p><ul className="space-y-2">{q.data.map(t => <li key={t.id}><details><summary className="cursor-pointer">{t.title.slice(CONTRACT_OFFICE_PREFIX.length)} <span className="text-muted-foreground">· {t.status === "completata" ? "Completata" : "Da verificare"}</span></summary><p className="whitespace-pre-line py-2 text-muted-foreground">{t.notes}</p></details></li>)}</ul><Link className="inline-block underline" to={`/azienda/ordini/${orderId}?tab=cantiere&section=section-attivita`}>Gestisci responsabili e attività</Link></CardContent></Card>;
}
