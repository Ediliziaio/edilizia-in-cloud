import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Mail, Phone, MapPin } from "lucide-react";

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
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-600">
            <User className="h-4 w-4" />
            Cliente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Cliente non disponibile</p>
        </CardContent>
      </Card>
    );
  }

  const initials = `${customer.first_name[0] ?? ""}${customer.last_name[0] ?? ""}`.toUpperCase();
  const fullName = `${customer.first_name} ${customer.last_name}`;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-600">
          <User className="h-4 w-4" />
          Cliente
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-sm font-semibold shrink-0">
            {initials}
          </div>
          <Link
            to={`/azienda/clienti/${customer.id}`}
            className="font-semibold text-gray-900 hover:text-orange-600 hover:underline leading-tight"
          >
            {fullName}
          </Link>
        </div>
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center gap-2 text-gray-500">
            <Mail className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{customer.email}</span>
          </div>
          {customer.phone && (
            <div className="flex items-center gap-2 text-gray-500">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              <span>{customer.phone}</span>
            </div>
          )}
          {customer.address && (
            <div className="flex items-start gap-2 text-gray-500">
              <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{customer.address}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
