/**
 * «Telaio strutturale»: si scrivono le campate (luci in metri) nelle due direzioni e si ottiene la griglia
 * con pilastri, travi e solaio, gli allineamenti numerati e le quote. Poi ogni elemento si può spostare o cambiare.
 */
import { useMemo, useState } from "react";
import { Grid3x3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { leggiCampate, LIMITE_CAMPATE, type ParametriTelaio } from "./telaio";

interface Props {
  aperto: boolean;
  onChiudi: () => void;
  /** Quanti piani ha la pianta: con più di uno si può ripetere il telaio su tutti. */
  piani: number;
  onCrea: (p: Omit<ParametriTelaio, "origine" | "stato">, suTuttiIPiani: boolean) => void;
}

const num = (s: string, min: number, max: number) => {
  const v = Number(s.replace(",", "."));
  return Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : null;
};

export function TelaioStrutturale({ aperto, onChiudi, piani, onCrea }: Props) {
  const [x, setX] = useState("5; 4; 5");
  const [y, setY] = useState("4; 4");
  const [pl, setPl] = useState("30");
  const [pp, setPp] = useState("30");
  const [tl, setTl] = useState("30");
  const [ta, setTa] = useState("50");
  const [sol, setSol] = useState("25");
  const [etichette, setEtichette] = useState(true);
  const [tutti, setTutti] = useState(true);

  const campateX = leggiCampate(x), campateY = leggiCampate(y);
  const valori = useMemo(() => ({ pl: num(pl, 15, 120), pp: num(pp, 15, 120), tl: num(tl, 15, 100), ta: num(ta, 20, 120), sol: num(sol, 0, 60) }), [pl, pp, tl, ta, sol]);
  const valido = !!campateX && !!campateY && Object.values(valori).every((v) => v !== null);
  const riepilogo = campateX && campateY
    ? `${(campateX.length + 1) * (campateY.length + 1)} pilastri · ${campateX.length * (campateY.length + 1) + campateY.length * (campateX.length + 1)} travi · ${(campateX.reduce((a, b) => a + b, 0) / 100).toLocaleString("it-IT")} × ${(campateY.reduce((a, b) => a + b, 0) / 100).toLocaleString("it-IT")} m`
    : null;

  const crea = () => {
    if (!valido || !campateX || !campateY) return;
    onCrea({
      campateX, campateY,
      pilastro: { larghezza: valori.pl!, profondita: valori.pp! },
      trave: { larghezza: valori.tl!, altezza: valori.ta! },
      solaio: valori.sol!,
      etichette,
    }, tutti && piani > 1);
    onChiudi();
  };

  return (
    <Dialog open={aperto} onOpenChange={(o) => { if (!o) onChiudi(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Grid3x3 className="h-5 w-5" />Telaio strutturale</DialogTitle>
          <DialogDescription>Scrivi le luci delle campate in metri, separate da punto e virgola: pilastri, travi e solaio nascono da soli.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-1">
            <Label htmlFor="tel-x">Campate in orizzontale (m)</Label>
            <Input id="tel-x" value={x} onChange={(e) => setX(e.target.value)} aria-invalid={!campateX} placeholder="5; 4; 5" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tel-y">Campate in verticale (m)</Label>
            <Input id="tel-y" value={y} onChange={(e) => setY(e.target.value)} aria-invalid={!campateY} placeholder="4; 4" />
          </div>
          {(!campateX || !campateY) && <p className="text-xs text-destructive">Ogni campata da 1,5 a 15 m, al massimo {LIMITE_CAMPATE} per direzione.</p>}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Pilastro (cm)</Label>
              <div className="flex items-center gap-1"><Input value={pl} onChange={(e) => setPl(e.target.value)} inputMode="numeric" /><span>×</span><Input value={pp} onChange={(e) => setPp(e.target.value)} inputMode="numeric" /></div>
            </div>
            <div className="space-y-1">
              <Label>Trave: larga × alta (cm)</Label>
              <div className="flex items-center gap-1"><Input value={tl} onChange={(e) => setTl(e.target.value)} inputMode="numeric" /><span>×</span><Input value={ta} onChange={(e) => setTa(e.target.value)} inputMode="numeric" /></div>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="tel-sol">Spessore del solaio (cm, 0 = senza)</Label>
            <Input id="tel-sol" value={sol} onChange={(e) => setSol(e.target.value)} inputMode="numeric" className="w-24" />
          </div>
          <div className="flex items-center gap-2"><Switch id="tel-etichette" checked={etichette} onCheckedChange={setEtichette} /><Label htmlFor="tel-etichette">Numeri, lettere e quote degli allineamenti</Label></div>
          {piani > 1 && <div className="flex items-center gap-2"><Switch id="tel-tutti" checked={tutti} onCheckedChange={setTutti} /><Label htmlFor="tel-tutti">Ripeti su tutti i {piani} piani</Label></div>}
          {riepilogo && <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{riepilogo}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onChiudi}>Annulla</Button>
          <Button onClick={crea} disabled={!valido}>Crea il telaio</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
