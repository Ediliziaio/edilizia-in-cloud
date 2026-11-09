/** I pulsanti per raggiungere una persona, uguali nelle schede cliente e committente. */
import { CalendarDays, Mail, MessageSquare, Phone } from "lucide-react";
import { AiCallButton } from "@/components/telephony/AiCallButton";
import { WebCallButton } from "@/components/telephony/WebCallButton";
import { Button } from "@/components/ui/button";

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

/** Da computer, in fila nella testata. */
export function AzioniContattoScheda({ telefono, nome, contactId, email, onEmail, onAppuntamento }: Props) {
  const waHref = linkWhatsApp(telefono);
  return (
    <>
      {telefono && (
        <WebCallButton
          phone={telefono}
          name={nome}
          contactId={contactId}
          label="Chiama"
          variant="outline"
          size="sm"
          className="gap-1.5 h-9 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
        />
      )}
      {telefono && (
        <AiCallButton
          phone={telefono}
          contactId={contactId}
          contactName={nome}
          variant="outline"
          size="sm"
          label="AI"
          className="gap-1.5 h-9 border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
        />
      )}
      {email && (
        <Button
          variant="outline" size="sm"
          className="gap-1.5 h-9 border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"
          onClick={onEmail}
        >
          <Mail className="h-3.5 w-3.5" /> Email
        </Button>
      )}
      {waHref && (
        <Button asChild variant="outline" size="sm" className="gap-1.5 h-9 border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-200">
          <a href={waHref} target="_blank" rel="noopener noreferrer">
            <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
          </a>
        </Button>
      )}
      <Button variant="outline" size="sm" className="gap-1.5 h-9" onClick={onAppuntamento}>
        <CalendarDays className="h-3.5 w-3.5" /> Appuntamento
      </Button>
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
