import { useOfficePeople } from "@/hooks/useOfficePeople";
import type { OfficeStep } from "@/lib/orders/contractPreparation";
import { OfficeSelect } from "./OfficeSelect";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
export function ContractOfficeAssignments({companyId,steps,value,onChange}:{companyId?:string;steps:OfficeStep[];value:Record<string,string>;onChange:(v:Record<string,string>)=>void}) {
  const t=useT();
  const roster=useOfficePeople(companyId);
  if(!steps.length)return null;
  return <section aria-label={t("Responsabili ufficio del contratto")} className="space-y-3 rounded-lg border bg-white p-4"><h3 className="font-semibold">{t("A chi vanno le attività d’ufficio?")}</h3><p className="text-sm text-muted-foreground">{t("Scegli persone dell’ufficio. Finché i nomi non sono confermati, le attività rimangono da assegnare.")}</p>
    {steps.map(s=><label key={s.nome} className="block text-sm">{s.nome}<span className="mt-1 block"><OfficeSelect
      label={t("Responsabile proposto: {nome}", { nome: s.nome })}
      value={value[s.nome]??""}
      disabled={roster.isLoading||roster.isError}
      onValueChange={v=>onChange({...value,[s.nome]:v})}
      options={[{value:"",label:t("Da assegnare")},...roster.people.map(p=>({value:p.id,label:p.label}))]}
    /></span></label>)}
    {roster.isError&&<p role="alert">{t("Elenco dell’ufficio non disponibile: riprova prima di assegnare.")}</p>}
    {roster.unlinked.length>0&&<p className="text-sm text-muted-foreground">{t("{n} persone d’ufficio richiedono ancora il collegamento a un account.", { n: roster.unlinked.length })}</p>}
  </section>;
}
