import { MarketingAutomationsConfig } from "@/components/marketing/MarketingAutomationsConfig";

export default function MarketingAutomations() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Automazioni Marketing</h1>
        <p className="text-muted-foreground">
          Configura flussi automatici per nurturing, follow-up e gestione lead.
        </p>
      </div>
      <MarketingAutomationsConfig />
    </div>
  );
}
