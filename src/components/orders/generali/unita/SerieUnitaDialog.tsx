// src/components/orders/generali/unita/SerieUnitaDialog.tsx
// «Nuove unità in serie»: A1…A6 in un colpo, scritte nella tabella o incollate da Excel, con
// il controllo riga per riga prima di salvare. Ogni riga diventa una commessa figlia con la
// sua unità. Solo da tablet e computer.
import { useMemo, useState, type ClipboardEvent } from "react";
import { Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { messaggioGenerale } from "@/hooks/useCommesseGenerali";
import { useCreaUnitaInSerie } from "@/hooks/useGeneraleUnita";
import { TIPOLOGIE_SUGGERITE } from "@/lib/orders/generali/unita";
import { formattaNumero } from "@/lib/orders/generali/unitaConti";
import {
  COLONNE_SERIE, MAX_SERIE, NOMI_COLONNA, controllaSerie, generaSigle, incollaInTabella, isIncollaDaFoglio, rigaVuota,
  type ColonnaSerie, type RigaSerie,
} from "@/lib/orders/generali/unitaSerie";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  generaleId: string;
  sigleEsistenti: string[];
  vedeImporti: boolean;
}

export function SerieUnitaDialog({ open, onOpenChange, ...resto }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        {/* Il modulo nasce a ogni apertura: si riparte da una tabella vuota. */}
        <Modulo onOpenChange={onOpenChange} {...resto} />
      </DialogContent>
    </Dialog>
  );
}

const LARGHEZZE: Record<ColonnaSerie, string> = {
  sigla: "w-24", edificio: "w-28", piano: "w-20", tipologia: "w-36", mq: "w-24", millesimi: "w-24", listino: "w-32",
};

function Modulo({ onOpenChange, generaleId, sigleEsistenti, vedeImporti }: Omit<Props, "open">) {
  const crea = useCreaUnitaInSerie(generaleId);
  const [righe, setRighe] = useState<RigaSerie[]>(() => Array.from({ length: 6 }, rigaVuota));
  const [prefisso, setPrefisso] = useState("A");
  const [da, setDa] = useState("1");
  const [a, setA] = useState("6");
  const colonne = COLONNE_SERIE.filter((c) => vedeImporti || c !== "listino");

  const controllo = useMemo(() => controllaSerie(righe, sigleEsistenti), [righe, sigleEsistenti]);
  const errori = controllo.righe.flatMap((r) => r.errori.map((e) => ({ riga: righe.indexOf(r.riga) + 1, errore: e })));
  const totaleMq = controllo.unita.reduce((t, u) => t + (u.mq_commerciali ?? 0), 0);
  const totaleMillesimi = controllo.unita.reduce((t, u) => t + (u.millesimi ?? 0), 0);
  const quante = controllo.unita.length;

  const scrivi = (i: number, c: ColonnaSerie, valore: string) =>
    setRighe((rr) => rr.map((r, k) => (k === i ? { ...r, [c]: valore } : r)));

  const incolla = (i: number, c: ColonnaSerie) => (ev: ClipboardEvent<HTMLInputElement>) => {
    const testo = ev.clipboardData.getData("text/plain");
    if (!isIncollaDaFoglio(testo)) return;
    ev.preventDefault();
    setRighe((rr) => incollaInTabella(rr, testo, i, c));
  };

  const riempiSigle = () => {
    const sigle = generaSigle(prefisso, Number(da), Number(a));
    if (sigle.length === 0) return;
    setRighe((rr) => sigle.map((s, k) => ({ ...(rr[k] ?? rigaVuota()), sigla: s })));
  };

  const conferma = () => {
    if (quante === 0 || controllo.errori > 0 || crea.isPending) return;
    crea.mutate(controllo.unita.map((u) => (vedeImporti ? u : { ...u, prezzo_listino: null })), {
      onSuccess: (n) => {
        toast.success(n === 1 ? "1 unità creata" : `${n} unità create`, { description: "Ognuna ha la sua commessa, dentro questa generale." });
        onOpenChange(false);
      },
      onError: (e) => toast.error(messaggioGenerale(e, "le unità")),
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Nuove unità in serie</DialogTitle>
        <DialogDescription>
          Scrivi le unità o incolla le righe da Excel (anche con le intestazioni). Ogni unità diventa una commessa dentro questa generale.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/30 px-3 py-2">
        <div className="space-y-1">
          <Label htmlFor="serie-prefisso">Sigle</Label>
          <Input id="serie-prefisso" className="h-8 w-20" value={prefisso} onChange={(e) => setPrefisso(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="serie-da">da</Label>
          <Input id="serie-da" className="h-8 w-16" inputMode="numeric" value={da} onChange={(e) => setDa(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="serie-a">a</Label>
          <Input id="serie-a" className="h-8 w-16" inputMode="numeric" value={a} onChange={(e) => setA(e.target.value)} />
        </div>
        <Button type="button" size="sm" variant="outline" className="h-8" onClick={riempiSigle}>
          <Wand2 className="mr-1.5 h-3.5 w-3.5" /> Prepara {generaSigle(prefisso, Number(da), Number(a)).length || ""} righe
        </Button>
      </div>

      <div className="max-h-[50vh] overflow-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background">
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="w-8 px-2 py-1.5 font-medium">#</th>
              {colonne.map((c) => <th key={c} className="px-1 py-1.5 font-medium">{NOMI_COLONNA[c]}</th>)}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {righe.map((r, i) => {
              const conErrori = controllo.righe.find((x) => x.riga === r)?.errori.length;
              return (
                <tr key={i} className={cn("border-b last:border-0", conErrori && "bg-destructive/5")}>
                  <td className="px-2 text-xs text-muted-foreground tabular-nums">{i + 1}</td>
                  {colonne.map((c) => (
                    <td key={c} className="px-1 py-0.5">
                      <Input
                        aria-label={`${NOMI_COLONNA[c]}, riga ${i + 1}`}
                        className={cn("h-8", LARGHEZZE[c], (c === "mq" || c === "millesimi" || c === "listino") && "text-right")}
                        inputMode={c === "mq" || c === "millesimi" || c === "listino" ? "decimal" : undefined}
                        list={c === "tipologia" ? "serie-tipologie" : undefined}
                        value={r[c]}
                        onChange={(e) => scrivi(i, c, e.target.value)}
                        onPaste={incolla(i, c)}
                      />
                    </td>
                  ))}
                  <td className="px-1">
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Togli la riga ${i + 1}`}
                      onClick={() => setRighe((rr) => rr.filter((_, k) => k !== i))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <datalist id="serie-tipologie">
          {TIPOLOGIE_SUGGERITE.map((t) => <option key={t} value={t} />)}
        </datalist>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <Button type="button" size="sm" variant="ghost" disabled={righe.length >= MAX_SERIE} onClick={() => setRighe((rr) => [...rr, rigaVuota()])}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Aggiungi una riga
        </Button>
        <span className="text-muted-foreground">
          {quante === 1 ? "1 unità" : `${quante} unità`}
          {totaleMq > 0 && ` · ${formattaNumero(totaleMq)} m²`}
          {totaleMillesimi > 0 && ` · ${formattaNumero(totaleMillesimi)} ‰`}
        </span>
      </div>
      {errori.length > 0 && (
        <ul role="alert" className="space-y-0.5 text-xs text-destructive">
          {errori.slice(0, 5).map((e, k) => <li key={k}>Riga {e.riga}: {e.errore}</li>)}
          {errori.length > 5 && <li>… e altri {errori.length - 5}.</li>}
        </ul>
      )}

      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annulla</Button>
        <Button type="button" onClick={conferma} disabled={quante === 0 || controllo.errori > 0 || crea.isPending}>
          {crea.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {quante === 1 ? "Crea 1 unità" : `Crea ${quante} unità`}
        </Button>
      </DialogFooter>
    </>
  );
}
