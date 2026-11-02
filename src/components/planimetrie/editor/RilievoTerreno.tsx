/**
 * «Rilievo del topografo»: si carica il file dei punti (CSV, TXT o DXF) e lo si mette sotto la
 * casa. All'arrivo il rilievo si centra sulla pianta e la quota zero è la quota mediana dei
 * punti: si aggiustano spostamento, rotazione e quota del piano terra finché torna.
 */
import { useState } from "react";
import { Mountain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { creaRilievo, leggiRilievo, puntiDelRilievo, type Rilievo } from "../../../../shared/planimetrie/rilievo.ts";

interface Props {
  aperto: boolean;
  onChiudi: () => void;
  rilievo: Rilievo | undefined;
  /** Centro della pianta (cm, y in su): il rilievo appena caricato si mette lì. */
  centroPianta: { x: number; y: number };
  onCambia: (r: Rilievo | null) => void;
}

const m = (cm: number) => (cm / 100).toLocaleString("it-IT", { maximumFractionDigits: 2 });
const leggi = (s: string) => { const v = Number(s.replace(",", ".")); return Number.isFinite(v) ? v : null; };

export function RilievoTerreno({ aperto, onChiudi, rilievo, centroPianta, onCambia }: Props) {
  const [bozza, setBozza] = useState<Rilievo | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [scartate, setScartate] = useState(0);
  const r = bozza ?? rilievo ?? null;

  const carica = async (file: File | null) => {
    setErrore(null);
    if (!file) return;
    if (file.size > 30 * 1024 * 1024) { setErrore("Il file è troppo grande (massimo 30 MB)."); return; }
    try {
      const letti = leggiRilievo(await file.text(), file.name);
      const nuovo = creaRilievo(letti.punti, file.name);
      setScartate(letti.scartate);
      setBozza({ ...nuovo, posa: { ...nuovo.posa, dx: Math.round(centroPianta.x), dy: Math.round(centroPianta.y) } });
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Il file non si legge.");
    }
  };
  const posa = (campi: Partial<Rilievo["posa"]>) => r && setBozza({ ...r, posa: { ...r.posa, ...campi } });
  const quote = r ? puntiDelRilievo(r).map((p) => p.quota) : [];
  const chiudi = () => { setBozza(null); setErrore(null); onChiudi(); };

  return (
    <Dialog open={aperto} onOpenChange={(v) => { if (!v) chiudi(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Mountain className="h-5 w-5" /> Rilievo del topografo</DialogTitle>
          <DialogDescription>
            Il file dei punti battuti (CSV o TXT con X, Y e quota in metri, oppure il DXF con punti, polilinee 3D o curve di livello). Il terreno nel 3D e le curve di livello della pianta seguono il rilievo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="file-rilievo">File del rilievo</Label>
          <Input id="file-rilievo" type="file" accept=".csv,.txt,.pts,.xyz,.dxf,text/plain,text/csv" onChange={(e) => carica(e.target.files?.[0] ?? null)} />
          {errore && <p className="text-sm text-destructive">{errore}</p>}
        </div>
        {r && (
          <div className="space-y-3">
            <p className="rounded-md bg-muted p-2 text-xs">
              {r.nome ? <><strong>{r.nome}</strong> · </> : null}{r.punti.length.toLocaleString("it-IT")} punti
              {scartate > 0 && bozza ? `, ${scartate} righe non lette` : ""} · quote da {m(Math.min(...quote))} a {m(Math.max(...quote))} m rispetto al piano terra
              · origine del topografo {r.origine.x.toLocaleString("it-IT")}, {r.origine.y.toLocaleString("it-IT")}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <label className="space-y-0.5 text-xs">
                <span className="text-muted-foreground">Sposta verso est (m)</span>
                <Input key={`dx-${r.posa.dx}`} defaultValue={m(r.posa.dx)} inputMode="decimal" onBlur={(e) => { const v = leggi(e.target.value); if (v !== null) posa({ dx: Math.round(v * 100) }); }} />
              </label>
              <label className="space-y-0.5 text-xs">
                <span className="text-muted-foreground">Sposta verso nord (m)</span>
                <Input key={`dy-${r.posa.dy}`} defaultValue={m(r.posa.dy)} inputMode="decimal" onBlur={(e) => { const v = leggi(e.target.value); if (v !== null) posa({ dy: Math.round(v * 100) }); }} />
              </label>
              <label className="space-y-0.5 text-xs">
                <span className="text-muted-foreground">Ruota (gradi)</span>
                <Input key={`rot-${r.posa.rotazione}`} defaultValue={String(r.posa.rotazione).replace(".", ",")} inputMode="decimal" onBlur={(e) => { const v = leggi(e.target.value); if (v !== null) posa({ rotazione: ((v % 360) + 360) % 360 }); }} />
              </label>
              <label className="col-span-2 space-y-0.5 text-xs sm:col-span-2">
                <span className="text-muted-foreground">Quota del pavimento del piano terra (m s.l.m. del rilievo)</span>
                <Input key={`z0-${r.posa.quotaZero}`} defaultValue={m(r.posa.quotaZero)} inputMode="decimal" onBlur={(e) => { const v = leggi(e.target.value); if (v !== null) posa({ quotaZero: Math.round(v * 100) }); }} />
              </label>
              <label className="flex items-end gap-2 pb-2 text-xs">
                <input type="checkbox" checked={!!r.posa.scambiaXY} onChange={(e) => posa({ scambiaXY: e.target.checked || undefined })} />
                Scambia X e Y
              </label>
            </div>
            <p className="text-[11px] text-muted-foreground">Il rilievo nuovo si mette al centro della casa e la quota zero è la quota media dei punti: scrivi la quota vera del pavimento (dal progetto o dal topografo) e sposta il rilievo finché il confine e i punti noti tornano. «Scambia X e Y» se il file ha prima il nord e poi l'est.</p>
          </div>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          {rilievo ? <Button variant="ghost" className="text-destructive" onClick={() => { onCambia(null); chiudi(); }}>Togli il rilievo</Button> : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={chiudi}>Annulla</Button>
            <Button disabled={!bozza} onClick={() => { if (bozza) onCambia(bozza); chiudi(); }}>Usa il rilievo</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
