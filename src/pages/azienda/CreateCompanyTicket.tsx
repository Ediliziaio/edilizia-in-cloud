/**
 * Pagina «Crea Ticket» — raggiunta dai link profondi (?order=, ?tipo=,
 * ?customer_id=, ?impiantoId=). Il modulo è lo stesso del popup «Nuovo Ticket»
 * (NuovoTicketForm), così le due strade sono identiche e complete.
 */
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Wrench, Headset } from "lucide-react";
import { NuovoTicketForm } from "@/components/tickets/NuovoTicketForm";

export default function CreateCompanyTicket() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const rawTipo = searchParams.get("tipo") ?? "supporto";
  const tipo = ["intervento", "emergenza", "supporto"].includes(rawTipo) ? rawTipo : "supporto";
  const isIntervento = tipo === "intervento" || tipo === "emergenza";

  const initial = {
    customerId: searchParams.get("customer_id") ?? undefined,
    orderId: searchParams.get("order") ?? undefined,
    tipo,
    impiantoId: searchParams.get("impiantoId") ?? undefined,
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={() => navigate(isIntervento ? "/azienda/assistenza?tipo=intervento" : "/azienda/assistenza")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          {isIntervento ? <Wrench className="h-5 w-5 text-orange-500" /> : <Headset className="h-5 w-5 text-primary" />}
          <div>
            <h1 className="text-xl font-bold">{isIntervento ? "Crea Intervento" : "Crea Ticket"}</h1>
            <p className="text-sm text-muted-foreground">{isIntervento ? "Pianifica un intervento tecnico" : "Apri un ticket per conto di un cliente"}</p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isIntervento ? <Wrench className="h-4 w-4 text-orange-500" /> : <Headset className="h-4 w-4 text-primary" />}
            {isIntervento ? "Nuovo Intervento" : "Nuovo Ticket"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <NuovoTicketForm initial={initial} variant="page" />
        </CardContent>
      </Card>
    </div>
  );
}
