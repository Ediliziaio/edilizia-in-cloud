import { CentralinoCallHistory } from "./CentralinoCallHistory";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import { WebCallButton } from "./WebCallButton";
import { AiCallButton } from "./AiCallButton";
import { Phone } from "lucide-react";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
interface ContactCallHistoryProps {contactId?:string|null;customerId?:string|null;phone?:string|null;name?:string|null;showActions?:boolean;className?:string;}
export function ContactCallHistory({contactId,customerId,phone,name,showActions=true,className}:ContactCallHistoryProps){
  const t = useT();
 return <Card className={className}><CardHeader className="flex flex-row items-center justify-between gap-2 pb-2"><CardTitle className="flex items-center gap-2 text-base"><Phone className="h-4 w-4 text-primary"/>{t("Chiamate")}</CardTitle>{showActions && (!!contactId || !!phone) && <div className="flex items-center gap-1.5"><WebCallButton phone={phone} name={name} contactId={contactId} label={t("Chiama")} size="sm" variant="outline" className="h-8"/><AiCallButton phone={phone} contactId={contactId} contactName={name} label="AI" size="sm" variant="outline" className="h-8"/></div>}</CardHeader><CardContent className="p-3"><CentralinoCallHistory contactId={contactId} customerId={customerId} phone={phone} compact/></CardContent></Card>;
}
