/**
 * La guida di Silvio nella chat della scheda (24/11/2026): la domanda di adesso con i suoi
 * bottoni, e sotto, piccole, le cose che vengono dopo. Vedi `guidaProgetto.ts`.
 */
import { useMemo } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { passiGuidaProgetto, type DestinazioneGuida } from "@/lib/planimetrie/guidaProgetto";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";

export function GuidaProgetto({ documento, ambito, onVai }: { documento: Planimetria; ambito: string; onVai: (verso: DestinazioneGuida) => void }) {
  const t = useT();
  const passi = useMemo(() => passiGuidaProgetto(documento, ambito), [documento, ambito]);
  const [ora, ...dopo] = passi;
  if (!ora) return null;
  return <div role="region" aria-label={t("Guida di Silvio")} className="space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-3">
    <p className="flex gap-2 text-sm font-medium"><Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />{t(ora.domanda)}</p>
    {ora.dettaglio && <p className="text-xs text-muted-foreground">{t(ora.dettaglio)}</p>}
    <div className="flex flex-wrap gap-1.5">
      {ora.azioni.map((a) => <Button key={a.etichetta} type="button" size="sm" variant="outline" className="h-8 gap-1" onClick={() => onVai(a.verso)}>
        {t(a.etichetta)}<ArrowRight className="size-3.5" aria-hidden="true" />
      </Button>)}
    </div>
    {dopo.length > 0 && <p className="text-xs text-muted-foreground">
      {t("Dopo:")} {dopo.map((p) => p.id === "consegne" ? t("tavole, 3D e costi") : p.id === "unita" ? t("le unità") : p.id === "lotto" ? t("il lotto") : p.id === "completezza" ? t("cosa manca al progetto") : t("il tipo di lavori")).join(" · ")}
    </p>}
  </div>;
}
