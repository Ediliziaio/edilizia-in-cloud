import {useSalMatura} from "@/hooks/useSalMatura";
import {usePermissions} from "@/hooks/usePermissions";
import {useQueryClient} from "@tanstack/react-query";
import {Button} from "@/components/ui/button";
import type {Installment} from "@/lib/orderUtils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
/** Shared explanation; company rule is never silently presented as a per-order override. */
export function SalPlanInfo({companyId,installments,creating=false}:{companyId:string;installments:readonly Installment[];creating?:boolean}){
  const t=useT();
  const rule=useSalMatura(companyId);const permissions=usePermissions();const qc=useQueryClient();
  const expected=installments.filter(r=>r.trigger_evento==="sal_numero");
  return <div className="rounded-lg border bg-muted/20 p-3 text-sm space-y-2" aria-label={t("Come funzionano i SAL")}>
    <p className="font-medium">{creating ? t("SAL e pagamenti di questa commessa") : t("Come funziona il SAL")}</p>
    <p className="text-xs text-muted-foreground">{creating ? t("{n} rate legate a un SAL. Creando la commessa si prepara il piano, non si generano verbali o fatture.", { n: expected.length }) : t("Il SAL certifica il lavoro eseguito fino a oggi. Non è una fattura né un incasso.")}</p>
    <p className="text-xs text-muted-foreground">{rule===null ? t("Regola aziendale non verificata: nessuna maturazione viene presunta.") : rule==="approvato" ? t("La rata collegata matura quando registri l'approvazione oppure il cliente firma il SAL.") : t("La rata collegata matura quando il SAL viene emesso.")} {t("La scelta vale per tutte le commesse dell'azienda.")}</p>
    {rule===null && <Button variant="outline" size="sm" onClick={()=>void qc.invalidateQueries({queryKey:["sal-matura",companyId]})}>{t("Rileggi regola SAL")}</Button>}
    {permissions.canViewSettingsOrders && <a href="/azienda/impostazioni/modelli-pagamento#sal" className="inline-block text-xs text-primary underline">{t("Impostazioni SAL e modelli di pagamento")}</a>}
    {creating && <p className="text-xs text-muted-foreground">{t("Dopo la creazione: Economia → Varianti, SAL e documenti → Crea verbale. Le fasi suggeriscono le voci; l'ufficio verifica prezzi e avanzamento.")}</p>}
  </div>;
}
