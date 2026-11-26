/**
 * «Avvisa la sera dove si lavora domani» (26/11/2026, piano campo completo, punto 1.2).
 *
 * Alle 19 chi domani lavora in un cantiere diverso da oggi riceve una notifica con cantiere e indirizzo
 * (campo_promemoria, slot «domani»). Spento di default; si salva subito, come la bozza serale.
 * Lettura e scrittura passano dalle RPC campo_avvisi_azienda_leggi / _salva (permesso «Configurazione Ordini»).
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SezioneImpostazione } from "@/components/impostazioni/SezioneImpostazione";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { motivoDelRifiuto } from "@/lib/impostazioni/erroriPerUtente";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

type Rpc = "campo_avvisi_azienda_leggi" | "campo_avvisi_azienda_salva" | "campo_avvisi_azienda_salva_pagamenti_sub" | "campo_avvisi_azienda_salva_timbratura";
const db = () => supabase as unknown as {
  rpc: (nome: Rpc, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
const chiave = (companyId: string) => ["campo-avvisi-azienda", companyId];

export function AvvisoDomaniConfig({ companyId, canEdit, evidenziata }: { companyId: string; canEdit: boolean; evidenziata?: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const [inSalvataggio, setInSalvataggio] = useState(false);
  const { data: impostazioni, isLoading, isError, refetch } = useQuery({
    queryKey: chiave(companyId),
    queryFn: async (): Promise<{ domani: boolean; pagamentiSub: boolean; timbratura: boolean }> => {
      const { data, error } = await db().rpc("campo_avvisi_azienda_leggi", { p_company_id: companyId });
      if (error) throw error;
      const d = data as { avviso_domani?: boolean; sub_vede_pagamenti?: boolean; timbratura_app?: boolean } | null;
      return { domani: d?.avviso_domani === true, pagamentiSub: d?.sub_vede_pagamenti !== false, timbratura: d?.timbratura_app !== false };
    },
  });
  const acceso = impostazioni?.domani;

  const cambia = async (valore: boolean) => {
    setInSalvataggio(true);
    try {
      const { error } = await db().rpc("campo_avvisi_azienda_salva", { p_company_id: companyId, p_avviso_domani: valore });
      if (error) throw error;
      qc.setQueryData(chiave(companyId), { ...impostazioni, domani: valore, pagamentiSub: impostazioni?.pagamentiSub ?? true, timbratura: impostazioni?.timbratura ?? true });
      toast.success(valore ? t("Avviso della sera acceso") : t("Avviso della sera spento"));
    } catch (e) {
      toast.error(motivoDelRifiuto(e, t("Non sono riuscito a salvare: riprova.")));
    } finally {
      setInSalvataggio(false);
    }
  };

  // Contratto e pagamenti visibili alla ditta subappaltatrice (piano campo completo 3.3), acceso di default.
  const cambiaPagamentiSub = async (valore: boolean) => {
    setInSalvataggio(true);
    try {
      const { error } = await db().rpc("campo_avvisi_azienda_salva_pagamenti_sub", { p_company_id: companyId, p_attivo: valore });
      if (error) throw error;
      qc.setQueryData(chiave(companyId), { domani: impostazioni?.domani ?? false, pagamentiSub: valore, timbratura: impostazioni?.timbratura ?? true });
      toast.success(t("Impostazione salvata"));
    } catch (e) {
      toast.error(motivoDelRifiuto(e, t("Non sono riuscito a salvare: riprova.")));
    } finally {
      setInSalvataggio(false);
    }
  };

  // Si timbra dall'app in questa azienda? (26/11/2026) La persona può essere spenta a parte nella sua scheda.
  const cambiaTimbratura = async (valore: boolean) => {
    setInSalvataggio(true);
    try {
      const { error } = await db().rpc("campo_avvisi_azienda_salva_timbratura", { p_company_id: companyId, p_attivo: valore });
      if (error) throw error;
      qc.setQueryData(chiave(companyId), { domani: impostazioni?.domani ?? false, pagamentiSub: impostazioni?.pagamentiSub ?? true, timbratura: valore });
      toast.success(t("Impostazione salvata"));
    } catch (e) {
      toast.error(motivoDelRifiuto(e, t("Non sono riuscito a salvare: riprova.")));
    } finally {
      setInSalvataggio(false);
    }
  };

  return (
    <SezioneImpostazione id="avviso-domani" evidenziata={evidenziata} titolo={t("Timbratura, avvisi e pagamenti nell’app")}
      descrizione={t("Si salva subito, senza «Salva modifiche».")}>
      {isError ? (
        <div className="p-4 text-sm text-muted-foreground">
          {t("Non riesco a leggere questa impostazione.")}{" "}
          <button type="button" className="underline" onClick={() => void refetch()}>{t("Riprova")}</button>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-4 p-4">
          <div className="min-w-0">
            <Label htmlFor="avviso-domani" className="text-sm font-medium">{t("Avvisa la sera chi domani cambia cantiere")}</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("Alle 19 una notifica con il cantiere e l'indirizzo di domani, solo a chi domani lavora in un posto diverso da oggi.")}</p>
            {!canEdit && <p className="mt-1 text-xs text-muted-foreground">{t("La cambia chi può modificare la configurazione delle commesse.")}</p>}
          </div>
          <Switch id="avviso-domani" checked={acceso === true} disabled={!canEdit || isLoading || inSalvataggio}
            onCheckedChange={(v) => void cambia(v)} />
        </div>
      )}
      {!isError && (
        <div className="flex items-start justify-between gap-4 border-t p-4">
          <div className="min-w-0">
            <Label htmlFor="timbratura-app" className="text-sm font-medium">{t("In questa azienda si timbra dall'app")}</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("Spento: nessuno vede la timbratura nell'app, le ore le segnano il caposquadra o l'ufficio. Acceso: timbra chi ha «Timbra dall'app» acceso nella sua scheda del personale.")}</p>
          </div>
          <Switch id="timbratura-app" checked={impostazioni?.timbratura !== false} disabled={!canEdit || isLoading || inSalvataggio}
            onCheckedChange={(v) => void cambiaTimbratura(v)} />
        </div>
      )}
      {!isError && (
        <div className="flex items-start justify-between gap-4 border-t p-4">
          <div className="min-w-0">
            <Label htmlFor="sub-vede-pagamenti" className="text-sm font-medium">{t("Le ditte subappaltatrici vedono contratto e pagamenti")}</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("Nell'app vedono solo i propri contratti: importo, SAL, pagato e da pagare.")}</p>
          </div>
          <Switch id="sub-vede-pagamenti" checked={impostazioni?.pagamentiSub !== false} disabled={!canEdit || isLoading || inSalvataggio}
            onCheckedChange={(v) => void cambiaPagamentiSub(v)} />
        </div>
      )}
    </SezioneImpostazione>
  );
}
