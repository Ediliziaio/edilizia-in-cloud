import { Target } from "lucide-react";

export default function MarketingOpportunities() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
      <Target className="h-16 w-16 text-muted-foreground/40" />
      <h1 className="text-2xl font-bold">Opportunità</h1>
      <p className="text-muted-foreground max-w-md">
        Questa sezione è in fase di sviluppo. Presto potrai tracciare e gestire le tue opportunità di vendita.
      </p>
    </div>
  );
}
