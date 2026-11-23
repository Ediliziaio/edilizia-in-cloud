import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { CampoScorteFurgone } from "@/components/campo/CampoScorteFurgone";
import { CampoInventario } from "@/components/campo/CampoInventario";
import { CampoPrelievi, PrelieviInCoda } from "@/components/campo/CampoPrelievi";
import { Button } from "@/components/ui/button";
import { useCampoMagazzinoConfig } from "@/hooks/campo/useCampoPrelievo";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

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
  const schedaIniziale = parametri.get("tab") === "prelievi" ? "prelievi" : undefined;

  return <Magazzino key={`${config.companyId}:${config.userId}:${cantiereIniziale ?? ""}:${schedaIniziale ?? ""}:${apriBozza}`}
    config={config} cantiereIniziale={cantiereIniziale} apriBozza={apriBozza} schedaIniziale={schedaIniziale} />;
}

function Magazzino({ config, cantiereIniziale, apriBozza, schedaIniziale }: {
  config: ReturnType<typeof useCampoMagazzinoConfig>;
  cantiereIniziale?: string;
  apriBozza: boolean;
  schedaIniziale?: Scheda;
}) {
  const t = useT();
  const [schedaScelta, setSchedaScelta] = useState<Scheda | undefined>(schedaIniziale);
  const vedeInventario = !config.isError && !!config.data && config.data.livello !== "nessuno";
  const puoPrelevare = vedeInventario && config.data?.livello === "prelievi";
  const schedeVisibili = vedeInventario ? schede : schede.filter((s) => s.id === "furgone");
  const scheda = schedeVisibili.find((s) => s.id === schedaScelta)?.id ?? schedeVisibili[0].id;

  if (!config.companyId || !config.userId || config.isLoading) return (
    <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
      <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" /> {t("Carico il magazzino…")}
    </div>
  );

  return (
    <section className="mx-auto w-full max-w-2xl">
      <h1 className="px-1 pb-1 pt-0.5 text-lg font-bold sm:px-4 sm:pb-2 sm:pt-3 sm:text-xl">
        {vedeInventario ? t("Magazzino") : t("Scorte del furgone")}
      </h1>
      {vedeInventario && (
        <nav aria-label={t("Sezioni magazzino")} className="sticky top-0 z-10 grid grid-cols-3 gap-1.5 rounded-lg bg-muted p-1">
          {schedeVisibili.map((s) => (
            <button
              key={s.id}
              onClick={() => setSchedaScelta(s.id)}
              aria-pressed={scheda === s.id}
              className={cn("min-h-11 rounded-md px-1 text-xs font-semibold sm:text-sm",
                scheda === s.id ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:bg-background/60")}
            >
              {t(s.label)}
            </button>
          ))}
        </nav>
      )}

      <div className="py-2 sm:px-4 sm:py-4">
        {config.isError && (
          <div role="alert" className="mb-4 flex items-center gap-2 rounded-xl border p-3 text-sm">
            <p className="flex-1">{t("Non riesco a verificare l’accesso al magazzino.")}</p>
            <Button variant="outline" size="sm" onClick={() => void config.refetch()} disabled={config.isFetching}>{t("Riprova")}</Button>
          </div>
        )}
        {vedeInventario && (
          <div hidden={scheda !== "inventario"} className="space-y-3 sm:space-y-4">
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
        {scheda === "prelievi" && <>
          <PrelieviInCoda companyId={config.companyId} userId={config.userId} />
          <CampoPrelievi companyId={config.companyId} puoPrelevare={puoPrelevare} />
        </>}
        {scheda === "furgone" && <CampoScorteFurgone companyId={config.companyId} />}
      </div>
    </section>
  );
}
