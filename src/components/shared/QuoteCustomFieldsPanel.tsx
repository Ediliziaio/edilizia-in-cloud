import { useState } from "react";
// Da `react-router`, non da `-dom`: è lo stesso contesto (il -dom lo riesporta), ma i test
// dei wizard sostituiscono `react-router-dom` con un finto che non ha questo hook, e il
// pannello, che sta nel guscio comune, li faceva cadere tutti.
import { useInRouterContext, useLocation } from "react-router";
import { useEntityCustomFields } from "@/hooks/useEntityCustomFields";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { quoteFieldContext } from "@/lib/custom-fields/quoteContext";
import { EntityCustomFieldsSection } from "./EntityCustomFieldsSection";

/** Lazy, internal header fields only. No changes to the wizard's native save payload or signed PDF. */
export function QuoteCustomFieldsPanel() {
  const inRouter = useInRouterContext();
  return inRouter ? <RoutedQuoteFields /> : null;
}
function RoutedQuoteFields() {
  const { pathname } = useLocation();
  const context = quoteFieldContext(pathname);
  return context ? <SavedQuoteFields key={`${context.entityType}:${context.id}`} {...context} /> : null;
}
function SavedQuoteFields({ entityType, id }: { entityType: string; id: string }) {
  const [open, setOpen] = useState(false);
  const fields = useEntityCustomFields("quote");
  const { effectiveCompany, user } = useAuth();
  const access = useQuery({
    queryKey: ["custom-quote-write-access", effectiveCompany?.id, user?.id, entityType, id],
    enabled: open && !!effectiveCompany?.id && !!fields.data?.length,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("cf_can_access" as never, { p_company: effectiveCompany!.id, p_type: entityType, p_id: id, p_write: true } as never);
      if (error) throw error;
      return data === true;
    }, staleTime: 0, retry: false,
  });
  if (!fields.isError && !fields.data?.length) return null;
  return <details className="mt-4 rounded-xl border bg-white p-4" open={open} onToggle={e => setOpen(e.currentTarget.open)}>
    <summary className="cursor-pointer text-sm font-semibold">Campi aggiuntivi del preventivo</summary>
    <p className="my-2 text-xs text-muted-foreground">Dati interni della testata, salvati separatamente con «Salva campo». Non modificano importi, IVA o documento cliente. Per stamparli serve una mappatura esplicita nel modello.</p>
    {open && access.isError && <p role="alert" className="text-xs text-destructive">Non è possibile verificare il permesso di scrittura. I campi restano in sola lettura.</p>}
    {open && <EntityCustomFieldsSection entityType={entityType} definitionType="quote" entityId={id} disabled={access.data !== true} />}
  </details>;
}
