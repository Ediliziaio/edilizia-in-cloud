import { Bot } from "lucide-react";

export default function MarketingAiAgent() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
      <Bot className="h-16 w-16 text-muted-foreground/40" />
      <h1 className="text-2xl font-bold">Agente AI</h1>
      <p className="text-muted-foreground max-w-md">
        Questa sezione è in fase di sviluppo. Presto avrai un assistente AI per generare contenuti e gestire le comunicazioni commerciali.
      </p>
    </div>
  );
}
