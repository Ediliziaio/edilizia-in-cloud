import { MessageCircle, Construction } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function AgentWhatsAppPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4">
      <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
        <MessageCircle className="h-8 w-8 text-primary" />
      </div>
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold">WhatsApp</h1>
        <Badge variant="outline" className="text-xs">Alpha</Badge>
      </div>
      <p className="text-muted-foreground max-w-md">
        Collega i tuoi agenti AI a WhatsApp per gestire conversazioni automatiche con i tuoi clienti.
      </p>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Construction className="h-4 w-4" />
        <span>In fase di sviluppo</span>
      </div>
    </div>
  );
}
