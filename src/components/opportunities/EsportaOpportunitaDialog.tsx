/**
 * «Esporta opportunità»: quali fasi, quali stati (aperte, vinte, perse) e in che formato.
 * L'Excel ha un foglio per fase e, se ci sono perse, il riepilogo dei motivi di perdita.
 */
import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { NOMI_STATO } from "@/lib/opportunita/esportaOpportunita";

export type FormatoEsportazioneOpportunita = "xlsx" | "csv";
export interface SceltaDialog { fasi: Set<string>; stati: Set<string>; formato: FormatoEsportazioneOpportunita }

interface Props {
  aperto: boolean;
  onChiudi: () => void;
  fasi: Array<{ id: string; name: string }>;
  /** Quanti filtri della pagina sono attivi (si applicano anche all'esportazione). */
  filtriAttivi: number;
  inCorso: boolean;
  onEsporta: (s: SceltaDialog) => void;
}

export function EsportaOpportunitaDialog({ aperto, onChiudi, fasi, filtriAttivi, inCorso, onEsporta }: Props) {
  const [scelteFasi, setScelteFasi] = useState<Set<string>>(new Set());
  const [stati, setStati] = useState<Set<string>>(new Set());
  const [formato, setFormato] = useState<FormatoEsportazioneOpportunita>("xlsx");
  useEffect(() => { if (aperto) { setScelteFasi(new Set()); setStati(new Set()); } }, [aperto]);
  const alterna = (s: Set<string>, v: string, on: boolean) => { const n = new Set(s); if (on) n.add(v); else n.delete(v); return n; };

  return (
    <Dialog open={aperto} onOpenChange={(v) => { if (!v && !inCorso) onChiudi(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Esporta opportunità</DialogTitle>
          <DialogDescription>Scegli le fasi e gli stati. Nel file ci sono fase, stato e, per le perse, motivo, dettaglio, concorrente e note.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Fasi</Label>
            <button type="button" className="text-xs text-primary hover:underline" onClick={() => setScelteFasi(scelteFasi.size ? new Set() : new Set(fasi.map((f) => f.id)))}>
              {scelteFasi.size ? "Tutte le fasi" : "Seleziona tutte"}
            </button>
          </div>
          <div className="grid max-h-56 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
            {fasi.map((f) => (
              <label key={f.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
                <Checkbox checked={scelteFasi.has(f.id)} onCheckedChange={(v) => setScelteFasi((s) => alterna(s, f.id, !!v))} />
                <span className="truncate">{f.name}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{scelteFasi.size ? `${scelteFasi.size} ${scelteFasi.size === 1 ? "fase" : "fasi"} scelte.` : "Nessuna fase scelta: si esportano tutte."}</p>
        </div>

        <div className="space-y-2">
          <Label>Stato</Label>
          <div className="flex flex-wrap gap-3">
            {(["open", "won", "lost"] as const).map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm">
                <Checkbox checked={stati.has(s)} onCheckedChange={(v) => setStati((x) => alterna(x, s, !!v))} />
                {NOMI_STATO[s] === "Aperta" ? "Aperte" : NOMI_STATO[s] === "Vinta" ? "Vinte" : "Perse"}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{stati.size ? "" : "Nessuno stato scelto: tutte. "}Solo «Perse» per l'elenco dei persi con il motivo.</p>
        </div>

        <div className="space-y-2">
          <Label>Formato</Label>
          <RadioGroup value={formato} onValueChange={(v) => setFormato(v as FormatoEsportazioneOpportunita)} className="gap-2">
            <label className="flex items-start gap-2 text-sm"><RadioGroupItem value="xlsx" className="mt-0.5" /><span><span className="font-medium">Excel</span> — un foglio con tutte, uno per ogni fase e il riepilogo dei motivi di perdita</span></label>
            <label className="flex items-start gap-2 text-sm"><RadioGroupItem value="csv" className="mt-0.5" /><span><span className="font-medium">CSV</span> — un solo elenco</span></label>
          </RadioGroup>
        </div>

        {filtriAttivi > 0 && <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">Valgono anche la ricerca e i {filtriAttivi === 1 ? "filtro attivo" : `${filtriAttivi} filtri attivi`} della pagina.</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onChiudi} disabled={inCorso}>Annulla</Button>
          <Button onClick={() => onEsporta({ fasi: scelteFasi, stati, formato })} disabled={inCorso}>
            {inCorso ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Esporta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
