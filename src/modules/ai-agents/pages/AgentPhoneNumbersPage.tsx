import { Phone, Construction } from "lucide-react";

export default function AgentPhoneNumbersPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4">
      <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
        <Phone className="h-8 w-8 text-primary" />
      </div>
      <h1 className="text-2xl font-bold">Numeri di Telefono</h1>
      <p className="text-muted-foreground max-w-md">
        Gestisci i numeri di telefono collegati ai tuoi agenti AI. Assegna numeri, configura orari di attività e messaggi fuori orario.
      </p>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Construction className="h-4 w-4" />
        <span>In fase di sviluppo</span>
      </div>
    </div>
  );
}
