import { UniformSelect } from "@/components/ui/uniform-select";
import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {Label} from '@/components/ui/label';
import { useT } from "@/lib/campo/lingua/LinguaCampo";
export function InboundWebhookPicker({companyId,flowId,value,onChange}:{companyId?:string;flowId?:string;value:string;onChange:(id:string,objectType:string)=>void}){
  const t = useT();
 const q=useQuery({queryKey:['webhook-trigger-endpoints',companyId,flowId],enabled:!!companyId&&!!flowId,queryFn:async()=>{const{data,error}=await supabase.from('automation_webhook_endpoints' as never).select('id,name,is_active,mapping_json').eq('company_id',companyId!).eq('flow_id',flowId!);if(error)throw error;return(data??[])as unknown as {id:string;name:string;is_active:boolean;mapping_json:{entity_type:string}}[];}});
 return <div className="space-y-2"><Label htmlFor="webhook-trigger-endpoint">{t("Ingresso webhook")}</Label><UniformSelect id="webhook-trigger-endpoint" className="h-10 w-full rounded border bg-background px-3" value={value} onChange={e=>{const row=q.data?.find(x=>x.id===e.target.value);onChange(e.target.value,row?.mapping_json.entity_type??'contact');}}><option value="">{t("Scegli un ingresso di questo flusso")}</option>{q.data?.map(x=><option key={x.id} value={x.id}>{x.name}{x.is_active?'':` ${t("· sospeso")}`}</option>)}</UniformSelect>{q.isError?<p role="alert">{t("Impossibile leggere gli ingressi.")}</p>:<p className="text-xs text-muted-foreground">{t("Crea l’ingresso in Impostazioni → Integrazioni → Webhook, scegliendo questa automazione. Poi riapri il trigger.")}</p>}</div>;
}
