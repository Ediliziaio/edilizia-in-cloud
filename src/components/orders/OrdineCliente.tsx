import { Link } from "react-router-dom";
import { User, Mail, Phone, MapPin, HardHat, ExternalLink } from "lucide-react";
import { QuoteCard } from "@/components/marketing/preventivi/ui/builderUI";

interface Cliente {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  address: string | null;
}

interface OrdineClienteProps {
  customer: Cliente | null;
  /** Indirizzo del CANTIERE (orders.indirizzo_lavori): non è quello del
   *  cliente — prima viveva solo dentro il titolo libero della commessa. */
  indirizzoLavori?: string | null;
}

/** Blocco "Cantiere": indirizzo dei lavori + navigazione. Chi parte col
 *  furgone cerca questo, non la residenza del cliente. */
function BloccoCantiere({ indirizzo }: { indirizzo?: string | null }) {
  const pulito = indirizzo?.trim();
  if (!pulito) return null;
  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        <HardHat className="h-3.5 w-3.5 text-orange-500" />
        Cantiere
      </p>
      <div className="flex items-start justify-between gap-2 text-sm">
        <span className="text-slate-600">{pulito}</span>
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pulito)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-orange-600 hover:underline"
        >
          Naviga
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

export function OrdineCliente({ customer, indirizzoLavori }: OrdineClienteProps) {
  if (!customer) {
    return (
      <QuoteCard title="Cliente" icon={<User className="h-4 w-4" />}>
        <p className="text-sm text-slate-500">Cliente non disponibile</p>
        <BloccoCantiere indirizzo={indirizzoLavori} />
      </QuoteCard>
    );
  }

  const initials = `${(customer.first_name || "")[0] ?? ""}${(customer.last_name || "")[0] ?? ""}`.toUpperCase();
  const fullName = `${customer.first_name} ${customer.last_name}`;

  return (
    <QuoteCard title="Cliente" icon={<User className="h-4 w-4" />}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-100 to-amber-100 text-orange-700 flex items-center justify-center text-sm font-semibold shrink-0 ring-1 ring-orange-200">
          {initials}
        </div>
        <Link
          to={`/azienda/clienti/${customer.id}`}
          className="font-semibold text-slate-900 hover:text-orange-600 hover:underline leading-tight"
        >
          {fullName}
        </Link>
      </div>
      <div className="space-y-1.5 text-sm">
        <div className="flex items-center gap-2 text-slate-500">
          <Mail className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{customer.email}</span>
        </div>
        {customer.phone && (
          <div className="flex items-center gap-2 text-slate-500">
            <Phone className="h-3.5 w-3.5 shrink-0" />
            <span>{customer.phone}</span>
          </div>
        )}
        {customer.address && (
          <div className="flex items-start gap-2 text-slate-500">
            <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{customer.address}</span>
          </div>
        )}
      </div>
      <BloccoCantiere indirizzo={indirizzoLavori} />
    </QuoteCard>
  );
}
