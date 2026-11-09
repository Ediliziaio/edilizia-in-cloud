/** I pulsanti per raggiungere una persona, uguali nelle schede cliente e committente. */
import type { ReactNode } from "react";
import { CalendarDays, Mail, MessageSquare, Phone } from "lucide-react";
import { WebCallButton } from "@/components/telephony/WebCallButton";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Il link wa.me di un telefono, col prefisso italiano se manca; null senza numero. */
export function linkWhatsApp(telefono: string | null | undefined): string | null {
  const cifre = (telefono ?? "").replace(/\D/g, "");
  if (!cifre) return null;
  return `https://wa.me/${cifre.startsWith("39") || cifre.length > 10 ? cifre : `39${cifre}`}`;
}

interface Props {
  telefono: string | null;
  nome: string;
  contactId?: string;
  email: string | null;
  onEmail: () => void;
  onAppuntamento: () => void;
}

/** Il nome di un pulsante a icona, passandoci sopra. */
export function IconaScheda({ etichetta, children }: { etichetta: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild><span className="inline-flex">{children}</span></TooltipTrigger>
      <TooltipContent>{etichetta}</TooltipContent>
    </Tooltip>
  );
}

const ICONA = "h-9 w-9";

/** Da computer, in fila nella testata: icone uguali, senza colori che si fanno concorrenza. */
export function AzioniContattoScheda({ telefono, nome, contactId, email, onEmail, onAppuntamento }: Props) {
  const waHref = linkWhatsApp(telefono);
  return (
    <>
      {telefono && (
        <IconaScheda etichetta="Chiama">
          <WebCallButton phone={telefono} name={nome} contactId={contactId} label="Chiama" variant="outline" size="icon" iconOnly className={ICONA} />
        </IconaScheda>
      )}
      {email && (
        <IconaScheda etichetta="Email">
          <Button variant="outline" size="icon" className={ICONA} onClick={onEmail} aria-label="Email"><Mail className="h-4 w-4" /></Button>
        </IconaScheda>
      )}
      {waHref && (
        <IconaScheda etichetta="WhatsApp">
          <Button asChild variant="outline" size="icon" className={ICONA}>
            <a href={waHref} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp"><MessageSquare className="h-4 w-4" /></a>
          </Button>
        </IconaScheda>
      )}
      <IconaScheda etichetta="Appuntamento">
        <Button variant="outline" size="icon" className={ICONA} onClick={onAppuntamento} aria-label="Appuntamento"><CalendarDays className="h-4 w-4" /></Button>
      </IconaScheda>
    </>
  );
}

/** Da telefono, sotto il nome. */
export function AzioniContattoSchedaMobile({ telefono, email, onEmail, onAppuntamento }: Omit<Props, "nome" | "contactId">) {
  const waHref = linkWhatsApp(telefono);
  return (
    <div className="mt-3 flex md:hidden flex-wrap gap-1.5">
      {telefono && (
        <Button asChild variant="outline" size="sm" className="flex-1 min-w-[80px] gap-1.5 border-emerald-200 bg-emerald-50 text-emerald-700">
          <a href={`tel:${telefono}`}><Phone className="h-3.5 w-3.5" /> Chiama</a>
        </Button>
      )}
      {email && (
        <Button variant="outline" size="sm" className="flex-1 min-w-[80px] gap-1.5 border-violet-200 bg-violet-50 text-violet-700" onClick={onEmail}>
          <Mail className="h-3.5 w-3.5" /> Email
        </Button>
      )}
      {waHref && (
        <Button asChild variant="outline" size="sm" className="flex-1 min-w-[80px] gap-1.5 border-emerald-300 bg-emerald-100 text-emerald-800">
          <a href={waHref} target="_blank" rel="noopener noreferrer">
            <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
          </a>
        </Button>
      )}
      <Button variant="outline" size="sm" className="flex-1 min-w-[80px] gap-1.5" onClick={onAppuntamento}>
        <CalendarDays className="h-3.5 w-3.5" /> Appuntamento
      </Button>
    </div>
  );
}
