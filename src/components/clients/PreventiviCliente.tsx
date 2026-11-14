/**
 * «Preventivi» nella scheda del cliente privato (14/11/2026, fase 6 del piano anomalie).
 *
 * Prima erano solo collegamenti; ora è lo stesso riquadro del committente: da un preventivo accettato si fa una
 * commessa nuova o un lavoro extra su una commessa del cliente, uno inviato si segna rifiutato col motivo, uno
 * rifiutato o scaduto diventa una revisione.
 *
 * L'elenco resta quello di `scheda_cliente` (contatto CRM, cliente collegato, email): qui si leggono solo i campi
 * che le azioni richiedono, per gli id che la scheda ha già trovato. I preventivi dei moduli non sono in `quotes`
 * e restano collegamenti.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { oggiRoma } from "@/lib/clienti/schedaCliente";
import {
  PreventiviCommittente, type CommessaScheda, type PreventivoAltro, type PreventivoScheda,
} from "@/components/committenti/PreventiviCommittente";

export function PreventiviCliente({ customerId, companyId, elenco }: {
  customerId: string;
  companyId: string;
  /** I preventivi che la scheda ha trovato (anche quelli dei moduli). */
  elenco: PreventivoAltro[];
}) {
  const permessi = usePermissions();
  const ids = useMemo(() => elenco.map((p) => p.id).sort(), [elenco]);

  const preventivi = useQuery({
    queryKey: ["preventivi-cliente", companyId, customerId, ids],
    enabled: !!companyId && ids.length > 0,
    queryFn: async (): Promise<PreventivoScheda[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("quotes")
        .select("id, quote_number, title, total, status, created_at, sent_at, expires_at, signed_at, revision_number, parent_quote_id, refused_motivo, refused_reason, variante_id, version, source")
        .eq("company_id", companyId).is("deleted_at", null).in("id", ids)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PreventivoScheda[];
    },
  });

  const commesse = useQuery({
    queryKey: ["preventivi-cliente", "commesse", companyId, customerId],
    enabled: !!companyId && !!customerId,
    queryFn: async (): Promise<CommessaScheda[]> => {
      const { data, error } = await supabase.from("orders")
        .select("id, order_code, description, quote_id")
        .eq("company_id", companyId).eq("customer_id", customerId).is("deleted_at", null)
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as CommessaScheda[];
    },
  });

  const classici = preventivi.data ?? [];
  const altri = useMemo(() => {
    const visti = new Set(classici.map((q) => q.id));
    return elenco.filter((p) => !visti.has(p.id));
  }, [elenco, classici]);

  return (
    <PreventiviCommittente
      perPrivato
      committenteId={customerId}
      companyId={companyId}
      preventivi={classici}
      altri={preventivi.isLoading ? [] : altri}
      caricamento={preventivi.isLoading || commesse.isLoading}
      errore={preventivi.isError || commesse.isError}
      commesse={commesse.data ?? []}
      oggi={oggiRoma()}
      vedeImporti={permessi.canViewOrderAmounts}
      puoPreventivi={permessi.isAdmin || permessi.canEditPreventivi}
      puoCommesse={permessi.isAdmin || permessi.canEditOrders}
    />
  );
}
