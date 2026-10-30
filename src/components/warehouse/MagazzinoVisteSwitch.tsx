/**
 * La scelta della vista del magazzino: quattro gruppi in alto, le sotto-viste
 * del gruppo scelto nella riga sotto (src/lib/magazzino/vistaMagazzino.ts).
 * Prima erano undici schede in fila (29/10/2026).
 */
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ViewMode } from "@/hooks/useWarehouseData";
import type { Gruppo, GruppoMagazzino } from "@/lib/magazzino/vistaMagazzino";

export function MagazzinoVisteSwitch({
  gruppi,
  gruppoAttivo,
  vista,
  onGruppo,
  onVista,
}: {
  gruppi: Gruppo[];
  gruppoAttivo: GruppoMagazzino;
  vista: ViewMode;
  onGruppo: (gruppo: GruppoMagazzino) => void;
  onVista: (vista: ViewMode) => void;
}) {
  const sottoViste = gruppi.find((g) => g.key === gruppoAttivo)?.viste ?? [];
  return (
    <div className="min-w-0 space-y-2">
      <Tabs value={gruppoAttivo} onValueChange={(v) => onGruppo(v as GruppoMagazzino)} className="min-w-0">
        <TabsList className="flex h-auto w-full max-w-full justify-start gap-1 rounded-xl p-1 max-sm:grid max-sm:grid-cols-2 sm:w-fit">
          {gruppi.map((g) => (
            <TabsTrigger key={g.key} value={g.key} className="shrink-0 px-3 text-[11px] sm:text-sm">
              {g.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {sottoViste.length > 1 && (
        <div role="group" aria-label="Vista" className="flex flex-wrap gap-1">
          {sottoViste.map((v) => (
            <Button
              key={v.key}
              size="sm"
              variant={vista === v.key ? "secondary" : "ghost"}
              aria-pressed={vista === v.key}
              className="h-7 px-2.5 text-xs"
              onClick={() => onVista(v.key)}
            >
              {v.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
