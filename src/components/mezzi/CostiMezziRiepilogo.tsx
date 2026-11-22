import { useState } from "react";
import { ArrowRight, Truck } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { orderDetailLocation } from "@/lib/orders/detailNavigation";
import { usePermissions } from "@/hooks/usePermissions";
import { usePianoMezziCantiere } from "@/hooks/usePianoMezziCantiere";
import { useMezziPianoEconomia } from "@/hooks/useMezziPianoEconomia";
import { useMezzi } from "@/hooks/useMezzi";
import { economiaPianiMezzi } from "@/lib/mezzi/economiaPiani";
import { formatCurrency } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PianoMezziCantiere } from "./PianoMezziCantiere";
import { PercorrenzeMezzi } from "./PercorrenzeMezzi";
type RisorsaEconomica = {
  id: string; tipo: string; nome: string; assegnazioni: number; previsto: number; registrato: number; invalidi: number; daValorizzare: number;
};

const categoriaPossesso: Record<string, string> = {
  proprieta: "Mezzi e attrezzature di proprietà",
  leasing: "Leasing",
  noleggio_breve: "Noleggi a breve termine",
  noleggio_lungo: "Noleggi a lungo termine",
};

export function CostiMezziRiepilogo({ orderId }: { orderId: string }) {
  const p = usePermissions();
  const location = useLocation();
  const enabled = p.canViewCosts && (p.canViewMezzi || p.isAdmin);
  const { piani, prezzi } = usePianoMezziCantiere(orderId, enabled, true);
  const { fonti } = useMezziPianoEconomia(orderId, enabled);
  const { data: mezzi = [] } = useMezzi();
  const [open, setOpen] = useState(false);
  if (!enabled) return null;
  const loading =
    piani.isLoading ||
    (piani.data?.length && (prezzi.isPending || fonti.isPending));
  const error = piani.isError || prezzi.isError || fonti.isError;

  const e = economiaPianiMezzi(
    piani.data ?? [],
    prezzi.data ?? {},
    fonti.data ?? { fonti: [], legami: [] },
  );
  const risorse = new Map(mezzi.map(m => [m.id, m]));
  const gruppi = new Map<string, RisorsaEconomica>();
  for (const r of e.righe) {
    if (r.piano.annullato && !r.registrato && !r.invalidi) continue;
    const mezzo = risorse.get(r.piano.mezzo_id);
    const noleggioPianificato = Boolean(r.piano.origine_noleggio_id || r.piano.fornitore_noleggio);
    const possesso = mezzo?.possesso;
    const tipo = noleggioPianificato && (!possesso || possesso === "proprieta")
      ? "Noleggi"
      : categoriaPossesso[possesso ?? ""] ?? "Risorse archiviate";
    const chiave = `${tipo}:${r.piano.mezzo_id}`;
    const gruppo = gruppi.get(chiave) ?? {
      id: chiave, tipo, nome: mezzo?.nome ?? "Risorsa", assegnazioni: 0, previsto: 0, registrato: 0, invalidi: 0, daValorizzare: 0,
    };
    gruppo.assegnazioni++;
    gruppo.previsto += r.previsto ?? 0;
    gruppo.registrato += r.registrato;
    gruppo.invalidi += r.invalidi;
    gruppo.daValorizzare += Number(r.previsto === null);
    gruppi.set(chiave, gruppo);
  }
  const categorie = new Map<string, RisorsaEconomica[]>();
  for (const r of gruppi.values()) {
    const gruppo = categorie.get(r.tipo);
    if (gruppo) gruppo.push(r);
    else categorie.set(r.tipo, [r]);
  }
  return (
    <section
      className="mt-3 space-y-2.5 rounded-xl border bg-card p-2.5 sm:p-3"
      aria-label="Economia mezzi e noleggi"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Truck className="size-4 text-primary" />
          Mezzi e noleggi
        </h3>
        <div className="flex flex-wrap gap-1.5">
          <Button asChild variant="ghost" size="sm">
            <Link to={{ pathname: location.pathname, ...orderDetailLocation(location.search, { tab: "cantiere", cantiereView: "lavorazioni", section: "section-viaggi" }) }}>
              Registro viaggi <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </Button>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Gestisci risorse e spese</Button>
        </div>
      </div>
      <PercorrenzeMezzi ordine={orderId} costi compatto />
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          Dati mezzi non disponibili.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              void piani.refetch();
              void prezzi.refetch();
              void fonti.refetch();
            }}
          >
            Riprova
          </button>
        </p>
      ) : loading ? (
        <p className="text-xs">Caricamento costi mezzi…</p>
      ) : gruppi.size ? (
        <>
          {[...categorie].map(([tipo, righe]) => <details key={tipo} className="rounded-lg border">
            <summary className="cursor-pointer px-3 py-2 text-sm hover:bg-muted/30">
              <span className="font-semibold">{tipo}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {righe.length} {righe.length === 1 ? "risorsa" : "risorse"} · {formatCurrency(righe.reduce((n, r) => n + r.previsto, 0))} previsto
                {righe.some(r => r.daValorizzare > 0) && " · Importi da completare"}
                {" · "}{righe.some(r => r.invalidi) ? "Da riconciliare" : `${formatCurrency(righe.reduce((n, r) => n + r.registrato, 0))} collegato`}
              </span>
            </summary>
            <ul className="divide-y border-t">
              {righe.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-xs">
                <span><strong>{r.nome}</strong> <span className="text-muted-foreground">· {r.assegnazioni} {r.assegnazioni === 1 ? "assegnazione" : "assegnazioni"}</span></span>
                <span className="tabular-nums text-muted-foreground">
                  {formatCurrency(r.previsto)} previsto{r.daValorizzare ? ` · ${r.daValorizzare} da valorizzare` : ""}
                  {" · "}{r.invalidi ? "Collegamenti da verificare" : `${formatCurrency(r.registrato)} collegato`}
                </span>
              </li>)}
            </ul>
          </details>)}
          {e.invalidi > 0 && (
            <p role="alert" className="text-xs text-amber-800">
              Un costo è stato modificato, spostato o annullato: ricontrolla le
              quote collegate prima di confrontare il consuntivo.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Importi netti IVA. I costi collegati sono già inclusi nel consuntivo della commessa.
          </p>
        </>
      ) : <p className="px-0.5 text-xs text-muted-foreground">Nessun mezzo o noleggio pianificato.</p>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Mezzi, noleggi e spese</DialogTitle>
            <DialogDescription>
              Gestisci assegnazioni e documenti senza uscire dalla commessa.
            </DialogDescription>
          </DialogHeader>
          {open && <PianoMezziCantiere orderId={orderId} />}
        </DialogContent>
      </Dialog>
    </section>
  );
}
