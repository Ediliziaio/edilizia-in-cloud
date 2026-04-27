import { Link } from "react-router-dom";
import { User, Mail, Phone, MapPin } from "lucide-react";
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
}

export function OrdineCliente({ customer }: OrdineClienteProps) {
  if (!customer) {
    return (
      <QuoteCard title="Cliente" icon={<User className="h-4 w-4" />}>
        <p className="text-sm text-slate-500">Cliente non disponibile</p>
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
    </QuoteCard>
  );
}
