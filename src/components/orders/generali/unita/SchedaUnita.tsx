// src/components/orders/generali/unita/SchedaUnita.tsx
// La scheda «Unità e vendite» della generale: tabellone disponibilità (o tabella), avviso delle
// garanzie per gli immobili da costruire, nuove unità in serie, l'unità aperta.
// Da telefono si guarda il tabellone e si cambia lo stato di vendita, nient'altro.
import { useMemo, useState } from "react";
import { LayoutGrid, Plus, ShieldAlert, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { PropsScheda } from "@/components/orders/generali/tipiScheda";
import { DividiUnitaDialog } from "@/components/orders/generali/unita/DividiUnitaDialog";
import { SerieUnitaDialog } from "@/components/orders/generali/unita/SerieUnitaDialog";
import { TabellaUnita } from "@/components/orders/generali/unita/TabellaUnita";
import { TabelloneUnita } from "@/components/orders/generali/unita/TabelloneUnita";
import { UnitaDialog } from "@/components/orders/generali/unita/UnitaDialog";
import { STILE_STATO, dataBreve, euro } from "@/components/orders/generali/unita/aspetto";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUnitaGenerale } from "@/hooks/useGeneraleUnita";
import { NOMI_STATO, STATI_VENDITA, confrontaSigle } from "@/lib/orders/generali/unita";
import { avvisoGaranzie, contiUnita, riepilogoVendite } from "@/lib/orders/generali/unitaConti";
import { cn } from "@/lib/utils";

export function SchedaUnita({ riepilogo, puoModificare }: PropsScheda) {
  const generaleId = riepilogo.generale.id;
  const telefono = useIsMobile();
  const { data: e, isLoading, isError, refetch } = useUnitaGenerale(generaleId);
  const [vista, setVista] = useState<"tabellone" | "tabella">("tabellone");
  const [aperta, setAperta] = useState<string | null>(null);
  const [daDividere, setDaDividere] = useState<string | null>(null);
  const [serie, setSerie] = useState(false);

  const conti = useMemo(() => (e ? contiUnita(e) : null), [e]);
  const vendite = useMemo(() => (e ? riepilogoVendite(e) : null), [e]);

  if (isLoading) return <Skeleton className="h-64 w-full rounded-lg" />;
  if (isError || !e || !conti || !vendite) {
    return (
      <div role="alert" className="space-y-3 rounded-lg border p-4">
        <p className="text-sm">Non riesco a leggere le unità.</p>
        <Button size="sm" onClick={() => void refetch()}>Riprova</Button>
      </div>
    );
  }

  // Serie, divisione, prezzi e pagamenti: da tablet e computer, con il permesso di modificare.
  const gestisci = puoModificare && e.permessi.modifica && !telefono;
  const garanzie = avvisoGaranzie(e);
  const sigle = e.unita.map((u) => u.sigla);
  const unitaAperta = e.unita.find((u) => u.orderId === aperta) ?? null;
  const divise = e.unita.filter((u) => u.divisaIl).sort((a, b) => confrontaSigle(a.sigla, b.sigla));
  const vuota = vendite.unita === 0;

  return (
    <div className="space-y-3">
      {!vuota && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <ul aria-label="Unità per stato" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {STATI_VENDITA.map((s) => (
              <li key={s} className="inline-flex items-center gap-1.5">
                <span className={cn("h-2.5 w-2.5 rounded-sm", STILE_STATO[s].punto)} aria-hidden="true" />
                <span className="text-muted-foreground">{NOMI_STATO[s].tante}</span>
                <span className="font-medium tabular-nums">{vendite.conteggi[s]}</span>
              </li>
            ))}
          </ul>
          {!telefono && e.permessi.importi && (
            <span className="text-xs text-muted-foreground">
              Venduto {euro(vendite.venduto)} · incassato {euro(vendite.incassato)}
            </span>
          )}
          {!telefono && (
            <div className="ml-auto flex items-center gap-2">
              <ToggleGroup type="single" size="sm" value={vista} onValueChange={(v) => v && setVista(v as typeof vista)} aria-label="Vista">
                <ToggleGroupItem value="tabellone" aria-label="Tabellone"><LayoutGrid className="mr-1.5 h-3.5 w-3.5" /> Tabellone</ToggleGroupItem>
                <ToggleGroupItem value="tabella" aria-label="Tabella"><Table2 className="mr-1.5 h-3.5 w-3.5" /> Tabella</ToggleGroupItem>
              </ToggleGroup>
              {gestisci && (
                <Button size="sm" onClick={() => setSerie(true)}><Plus className="mr-1.5 h-3.5 w-3.5" /> Nuove unità in serie</Button>
              )}
            </div>
          )}
        </div>
      )}

      {garanzie && (
        <div role="note" className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {telefono ? `Garanzie D.Lgs. 122/2005 per ${garanzie.sigle.join(", ")}.` : (
              <>
                Immobili da costruire: su {garanzie.sigle.join(", ")} ci sono somme versate prima del rogito
                {garanzie.somme !== null && <> ({euro(garanzie.somme)})</>}. Se l'acquirente è una persona fisica serve una
                fideiussione di pari importo e, al rogito, la polizza assicurativa decennale (D.Lgs. 122/2005).
              </>
            )}
          </p>
        </div>
      )}

      {vuota ? (
        <div className="rounded-lg border bg-card px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">
            {telefono ? "Nessuna unità." : "Scrivi le unità tutte insieme: A1, A2… con piano, m², millesimi e prezzo di listino, anche incollandole da Excel."}
          </p>
          {gestisci && (
            <Button size="sm" className="mt-3" onClick={() => setSerie(true)}><Plus className="mr-1.5 h-3.5 w-3.5" /> Nuove unità in serie</Button>
          )}
        </div>
      ) : vista === "tabella" && !telefono ? (
        <TabellaUnita elenco={e} conti={conti} riepilogo={vendite} onApri={setAperta} />
      ) : (
        <div className={cn(!telefono && "rounded-lg border bg-card p-3")}>
          <TabelloneUnita unita={e.unita} vedeImporti={e.permessi.importi} onApri={setAperta} telefono={telefono} />
        </div>
      )}

      {!telefono && divise.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {divise.map((d) => {
            const parti = e.unita.filter((u) => u.origineId === d.id).map((u) => u.sigla).sort(confrontaSigle);
            return `${d.sigla} divisa il ${dataBreve(d.divisaIl)}${parti.length ? ` in ${parti.join(", ")}` : ""}`;
          }).join(" · ")}
        </p>
      )}

      <UnitaDialog
        generaleId={generaleId}
        unita={unitaAperta}
        elenco={e}
        conti={conti}
        gestisci={gestisci}
        telefono={telefono}
        onChiudi={() => setAperta(null)}
        onDividi={(id) => { setAperta(null); setDaDividere(id); }}
      />
      {gestisci && (
        <>
          <SerieUnitaDialog open={serie} onOpenChange={setSerie} generaleId={generaleId} sigleEsistenti={sigle} vedeImporti={e.permessi.importi} />
          <DividiUnitaDialog
            generaleId={generaleId}
            unita={e.unita.find((u) => u.orderId === daDividere) ?? null}
            sigleEsistenti={sigle}
            vedeImporti={e.permessi.importi}
            onChiudi={() => setDaDividere(null)}
          />
        </>
      )}
    </div>
  );
}
