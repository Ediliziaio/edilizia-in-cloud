import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { CampoScorteFurgone } from "@/components/campo/CampoScorteFurgone";
import { CampoInventario } from "@/components/campo/CampoInventario";
import { CampoPrelievi } from "@/components/campo/CampoPrelievi";
import { Button } from "@/components/ui/button";
import { useCampoMagazzinoConfig } from "@/hooks/campo/useCampoPrelievo";
import { cn } from "@/lib/utils";

const schede = [
  { id: "inventario", label: "Inventario" },
  { id: "prelievi", label: "I miei prelievi" },
  { id: "furgone", label: "Furgone" },
] as const;

type Scheda = typeof schede[number]["id"];

export default function CampoMagazzino() {
  const config = useCampoMagazzinoConfig();
  const [parametri] = useSearchParams();
  const cantiereIniziale = parametri.get("order_id")?.trim() || undefined;

  return <Magazzino key={`${config.companyId}:${config.userId}:${cantiereIniziale ?? ""}`}
    config={config} cantiereIniziale={cantiereIniziale} />;
}

function Magazzino({ config, cantiereIniziale }: {
  config: ReturnType<typeof useCampoMagazzinoConfig>;
  cantiereIniziale?: string;
}) {
  const [schedaScelta, setSchedaScelta] = useState<Scheda>();
  const vedeInventario = !config.isError && !!config.data && config.data.livello !== "nessuno";
  const puoPrelevare = vedeInventario && config.data?.livello === "prelievi";
  const schedeVisibili = vedeInventario ? schede : schede.filter((s) => s.id === "furgone");
  const scheda = schedeVisibili.find((s) => s.id === schedaScelta)?.id ?? schedeVisibili[0].id;

  if (!config.companyId || !config.userId || config.isLoading) return (
    <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
      <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" /> Carico il magazzino…
    </div>
  );

  return (
    <section className="mx-auto w-full max-w-2xl">
      <h1 className="px-4 pb-2 pt-3 text-xl font-bold">{vedeInventario ? "Magazzino" : "Scorte del furgone"}</h1>
      {vedeInventario && (
        <nav aria-label="Sezioni magazzino" className="sticky top-0 z-10 grid grid-cols-3 gap-1.5 border-b bg-background px-4 py-2">
          {schedeVisibili.map((s) => (
            <button
              key={s.id}
              onClick={() => setSchedaScelta(s.id)}
              aria-pressed={scheda === s.id}
              className={cn("min-h-11 rounded-xl px-1.5 text-xs font-semibold sm:text-sm",
                scheda === s.id ? "bg-primary text-primary-foreground" : "bg-muted/60 text-foreground")}
            >
              {s.label}
            </button>
          ))}
        </nav>
      )}

      <div className="px-4 py-4">
        {config.isError && (
          <div role="alert" className="mb-4 flex items-center gap-2 rounded-xl border p-3 text-sm">
            <p className="flex-1">Non riesco a verificare l’accesso al magazzino.</p>
            <Button variant="outline" size="sm" onClick={() => void config.refetch()} disabled={config.isFetching}>Riprova</Button>
          </div>
        )}
        {vedeInventario && (
          <div hidden={scheda !== "inventario"}>
            <CampoInventario
              key={config.data!.livello}
              companyId={config.companyId}
              userId={config.userId}
              attivo={scheda === "inventario"}
              puoPrelevare={puoPrelevare}
              richiedeConferma={config.data!.conferma}
              cantiereIniziale={cantiereIniziale}
              onRegistrato={() => setSchedaScelta("prelievi")}
            />
          </div>
        )}
        {scheda === "prelievi" && <CampoPrelievi companyId={config.companyId} puoPrelevare={puoPrelevare} />}
        {scheda === "furgone" && <CampoScorteFurgone companyId={config.companyId} />}
      </div>
    </section>
  );
}
