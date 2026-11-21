import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronRight, Loader2 } from "lucide-react";
import { CampoScorteFurgone } from "@/components/campo/CampoScorteFurgone";
import { CampoInventario } from "@/components/campo/CampoInventario";
import { CampoPrelievi } from "@/components/campo/CampoPrelievi";
import { Button } from "@/components/ui/button";
import { useCampoMagazzinoConfig } from "@/hooks/campo/useCampoPrelievo";
import { bozzeCantieriPrelievo } from "@/lib/campo/bozzaPrelievo";
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
  const apriBozza = parametri.get("riprendi") === "1";

  return <Magazzino key={`${config.companyId}:${config.userId}:${cantiereIniziale ?? ""}`}
    config={config} cantiereIniziale={cantiereIniziale} apriBozza={apriBozza} />;
}

function Magazzino({ config, cantiereIniziale, apriBozza }: {
  config: ReturnType<typeof useCampoMagazzinoConfig>;
  cantiereIniziale?: string;
  apriBozza: boolean;
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
          <div hidden={scheda !== "inventario"} className="space-y-4">
            {puoPrelevare && !cantiereIniziale && <BozzeDaRiprendere companyId={config.companyId} userId={config.userId} />}
            <CampoInventario
              key={config.data!.livello}
              companyId={config.companyId}
              userId={config.userId}
              attivo={scheda === "inventario"}
              puoPrelevare={puoPrelevare}
              richiedeConferma={config.data!.conferma}
              cantiereIniziale={cantiereIniziale}
              apriBozza={apriBozza}
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

function BozzeDaRiprendere({ companyId, userId }: { companyId: string; userId: string }) {
  const [bozze, setBozze] = useState(() => bozzeCantieriPrelievo(companyId, userId));
  useEffect(() => {
    const aggiorna = () => setBozze(bozzeCantieriPrelievo(companyId, userId));
    window.addEventListener("storage", aggiorna);
    return () => window.removeEventListener("storage", aggiorna);
  }, [companyId, userId]);
  if (!bozze.length) return null;

  return (
    <section aria-labelledby="bozze-prelievi" className="rounded-xl border bg-card p-3">
      <h2 id="bozze-prelievi" className="px-2 text-sm font-semibold">Prelievi da riprendere</h2>
      <ul className="mt-1 divide-y">
        {bozze.map(({ cantiere, bozza }) => (
          <li key={cantiere}>
            <Link to={`/campo/magazzino?order_id=${encodeURIComponent(cantiere)}&riprendi=1`}
              className="flex min-h-12 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm">
              <span className="min-w-0 break-words">
                <span className="block font-medium">{bozza.nomeCantiere || bozza.righe[0].articolo.name}</span>
                <span className="text-xs text-muted-foreground">{bozza.inVerifica ? "Invio da verificare" : "Bozza da inviare"}</span>
              </span>
              <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
