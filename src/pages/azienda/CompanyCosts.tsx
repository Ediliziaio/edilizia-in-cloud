import CompanyCostsManager from "@/components/forecast/CompanyCostsManager";

export default function CompanyCosts() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Costi Aziendali</h1>
        <p className="text-muted-foreground">
          Gestisci i costi fissi e variabili della tua azienda
        </p>
      </div>
      <CompanyCostsManager />
    </div>
  );
}
