import { AutomationsConfig } from "@/components/settings/AutomationsConfig";

export default function Automations() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Automazioni</h1>
        <p className="text-muted-foreground">
          Configura flussi automatici per gestire commesse, attività e promemoria.
        </p>
      </div>
      <AutomationsConfig />
    </div>
  );
}
