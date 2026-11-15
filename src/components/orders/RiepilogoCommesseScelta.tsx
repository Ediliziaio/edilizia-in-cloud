import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useSalvaRiepilogoCommesse } from "@/hooks/useRiepilogoCommesse";
import {
  CATALOGO_RIQUADRI, CATALOGO_SERIE, SCELTA_PREDEFINITA,
  type RiquadroRiepilogo, type SceltaRiepilogo, type SerieGrafico,
} from "@/lib/orders/riepilogoCommesse";

const ETICHETTA_PERMESSO = { nessuno: "", importi: "serve «Venduto e importi»", costi: "serve «Costi»", margini: "serve «Margini»" } as const;

/** Sceglie, per tutta l'azienda, i 4 riquadri del riepilogo commesse e cosa mostra il grafico accanto. */
export function RiepilogoCommesseScelta({ open, onOpenChange, companyId, scelta }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  scelta: SceltaRiepilogo;
}) {
  const [bozza, setBozza] = useState<SceltaRiepilogo>(scelta);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- ogni apertura riparte dalla scelta salvata
  useEffect(() => { if (open) setBozza(scelta); }, [open, scelta]);
  const salva = useSalvaRiepilogoCommesse(companyId);
  const { toast } = useToast();

  const posti = [0, 1, 2, 3];
  const cambiaPosto = (indice: number, valore: string) => setBozza((b) => {
    const riquadri = [...b.riquadri];
    if (valore === "") riquadri.splice(indice, 1);
    else if (indice < riquadri.length) riquadri[indice] = valore as RiquadroRiepilogo;
    else riquadri.push(valore as RiquadroRiepilogo);
    return { ...b, riquadri: [...new Set(riquadri)] };
  });
  const cambiaSerie = (id: SerieGrafico) => setBozza((b) => ({
    ...b,
    graficoSerie: b.graficoSerie.includes(id) ? b.graficoSerie.filter((s) => s !== id)
      : CATALOGO_SERIE.map((s) => s.id).filter((s) => s === id || b.graficoSerie.includes(s)),
  }));
  const valida = bozza.riquadri.length >= 1 && bozza.graficoSerie.length >= 1;

  const conferma = async () => {
    try {
      await salva.mutateAsync(bozza);
      toast({ title: "Riepilogo aggiornato", description: "Vale per tutte le persone dell'azienda." });
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Non salvato", description: e instanceof Error ? e.message : "Riprova.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Personalizza il riepilogo commesse</DialogTitle>
          <DialogDescription>
            Vale per tutta l'azienda. Chi non ha il permesso di vedere importi, costi o margini vede al loro posto un riquadro operativo, mai le cifre.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-semibold text-slate-900">I 4 riquadri</legend>
          {posti.map((indice) => {
            const valore = bozza.riquadri[indice] ?? "";
            if (indice > bozza.riquadri.length) return null;
            return (
              <label key={indice} className="flex items-center gap-2 text-sm">
                <span className="w-20 shrink-0 text-slate-500">Riquadro {indice + 1}</span>
                <select
                  aria-label={`Riquadro ${indice + 1}`}
                  value={valore}
                  onChange={(e) => cambiaPosto(indice, e.target.value)}
                  className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 text-sm"
                >
                  {indice > 0 && <option value="">— nessuno —</option>}
                  {CATALOGO_RIQUADRI.map((v) => (
                    <option key={v.id} value={v.id} disabled={v.id !== valore && bozza.riquadri.includes(v.id)}>
                      {v.nome}{v.permesso !== "nessuno" ? ` (${ETICHETTA_PERMESSO[v.permesso]})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-semibold text-slate-900">Grafico «Andamento commesse»</legend>
          <div className="flex flex-wrap gap-3 text-sm" role="group" aria-label="Linee del grafico">
            {CATALOGO_SERIE.map((s) => (
              <label key={s.id} className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={bozza.graficoSerie.includes(s.id)} onChange={() => cambiaSerie(s.id)} />
                <i className="h-2 w-2 rounded-full" style={{ background: s.colore }} />
                {s.nome}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <span role="radiogroup" aria-label="All'apertura mostra" className="inline-flex items-center gap-3">
              <span className="text-slate-500">All'apertura:</span>
              {([["importi", "Importi"], ["numero", "Numero commesse"]] as const).map(([v, n]) => (
                <label key={v} className="inline-flex items-center gap-1">
                  <input type="radio" name="grafico-vista" checked={bozza.graficoVista === v} onChange={() => setBozza((b) => ({ ...b, graficoVista: v }))} />{n}
                </label>
              ))}
            </span>
            <span role="radiogroup" aria-label="Forma" className="inline-flex items-center gap-3">
              <span className="text-slate-500">Forma:</span>
              {([["linee", "Linee"], ["barre", "Barre"]] as const).map(([v, n]) => (
                <label key={v} className="inline-flex items-center gap-1">
                  <input type="radio" name="grafico-forma" checked={bozza.graficoForma === v} onChange={() => setBozza((b) => ({ ...b, graficoForma: v }))} />{n}
                </label>
              ))}
            </span>
          </div>
          <p className="text-xs text-slate-500">Il grafico si vede solo con il permesso «Venduto e importi». Chi guarda può sempre cambiare vista per sé, senza salvare.</p>
        </fieldset>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => setBozza(SCELTA_PREDEFINITA)}>Torna ai predefiniti</Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
            <Button type="button" onClick={() => void conferma()} disabled={!valida || salva.isPending}>
              {salva.isPending ? "Salvo…" : "Salva per l'azienda"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
