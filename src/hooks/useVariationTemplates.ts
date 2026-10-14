import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { validateVariationTemplate, type VariationTemplateContent, type VariationTemplateRow } from "@/lib/orders/variationTemplates";

type TemplateDatabase = { public: { Tables: { order_variation_templates: { Row: VariationTemplateRow; Insert: VariationTemplateContent & { id?: string; company_id: string }; Update: Partial<VariationTemplateRow>; Relationships: [] } }; Views: Record<string, never>; Functions: Record<string, never>; Enums: Record<string, never>; CompositeTypes: Record<string, never> } };
const db = supabase as unknown as SupabaseClient<TemplateDatabase>;
export function useVariationTemplates(companyId?: string, enabled = true, includeArchived = false) {
  const permissions = usePermissions();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["variation-templates", companyId, includeArchived], enabled: enabled && !!companyId,
    staleTime: 60_000, retry: false,
    queryFn: async () => {
      let request = db.from("order_variation_templates").select("*").eq("company_id", companyId!);
      if(!includeArchived) request = request.eq("is_active", true);
      const { data, error } = await request.order("name");
      if (error) throw new Error("Modelli aziendali non disponibili. Riprova; puoi comunque partire da un esempio.");
      if ((data ?? []).length >= 1000) throw new Error("Elenco modelli incompleto: verifica il numero di modelli prima di continuare.");
      return (data ?? []).map(row => {
        if (row.company_id !== companyId) throw new Error("Ambito dei modelli non verificabile.");
        return { ...row, ...validateVariationTemplate(row) };
      });
    } });
  const save = useMutation({ mutationFn: async ({ content, previous, creationId }: { content: VariationTemplateContent; previous?: VariationTemplateRow; creationId?: string }) => {
    if (!companyId || !(permissions.isAdmin || permissions.canEditSettingsPricing)) throw new Error("Non puoi modificare i modelli aziendali.");
    const valid = validateVariationTemplate(content);
    if (!previous && (!creationId || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(creationId))) throw new Error("Identificativo della bozza mancante. Riapri il modello.");
    if (previous && previous.company_id !== companyId) throw new Error("Modello di un'altra azienda.");
    const operation = previous ? db.from("order_variation_templates").update({ ...valid, revision: previous.revision + 1, updated_at: new Date().toISOString() }).eq("id", previous.id).eq("company_id", companyId).eq("revision", previous.revision).eq("is_active", true) :
      db.from("order_variation_templates").insert({ ...valid, id: creationId!, company_id: companyId });
    const { data, error } = await operation.select("*").single();
    if (error || !data?.id || data.company_id !== companyId || (!previous && data.id !== creationId) || (previous && (data.id !== previous.id || data.revision !== previous.revision + 1)) || Object.keys(valid).some(key => data[key as keyof VariationTemplateContent] !== valid[key as keyof VariationTemplateContent])) throw new Error("Salvataggio non confermato o modello modificato da un altro utente. Ricarica l'elenco prima di riprovare: il testo è conservato.");
    return data;
  }, onSuccess: () => client.invalidateQueries({ queryKey: ["variation-templates", companyId] }),
     onError: () => client.invalidateQueries({ queryKey: ["variation-templates", companyId] }) });
  const archive = useMutation({ mutationFn: async (row: VariationTemplateRow) => {
    if (!companyId || row.company_id !== companyId || !(permissions.isAdmin || permissions.canEditSettingsPricing)) throw new Error("Non puoi archiviare questo modello.");
    const { data, error } = await db.from("order_variation_templates").update({ is_active: false, revision: row.revision + 1, updated_at: new Date().toISOString() }).eq("company_id", companyId).eq("id", row.id).eq("revision", row.revision).eq("is_active", true).select("id").single();
    if (error || !data) throw new Error("Archiviazione non confermata: ricarica l'elenco.");
  }, onSuccess: () => client.invalidateQueries({ queryKey: ["variation-templates", companyId] }) });
  const restore = useMutation({mutationFn: async (row: VariationTemplateRow) => {
    if(!companyId || row.company_id !== companyId || !(permissions.isAdmin || permissions.canEditSettingsPricing))throw new Error("Non puoi ripristinare questo modello.");
    const {data,error}=await db.from("order_variation_templates").update({is_active:true,revision:row.revision+1,updated_at:new Date().toISOString()}).eq("company_id",companyId).eq("id",row.id).eq("revision",row.revision).eq("is_active",false).select("id").single();
    if(error || data?.id!==row.id)throw new Error("Ripristino non confermato. Ricarica l'elenco.");
  },onSuccess:()=>client.invalidateQueries({queryKey:["variation-templates",companyId]})});
  return { ...query, save, archive, restore };
}
