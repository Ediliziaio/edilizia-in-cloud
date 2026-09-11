/**
 * Costi del mese inseriti a mano per un cliente (campaign_costs): quello che
 * Meta e Google non dicono da soli — TikTok, un'agenzia esterna, un volantino.
 * La console li somma alla spesa pubblicitaria del mese.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCostiManuali, useEliminaCostoManuale, useSalvaCostoManuale } from "./useClientiMarketing";
import { fineMeseOOggi, type ClienteMarketing } from "./provvigioni";
import { dataBreve, eur } from "./formato";

const FONTI = [
  { value: "meta", label: "Meta (inserito a mano)" },
  { value: "google", label: "Google (inserito a mano)" },
  { value: "tiktok", label: "TikTok" },
  { value: "agenzia", label: "Agenzia / freelance" },
  { value: "altro", label: "Altro" },
];

interface Props {
  cliente: ClienteMarketing | null;
  mese: string;
  meseLeggibile: string;
  oggi: Date;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function CostiMeseDialog({ cliente, mese, meseLeggibile, oggi, open, onOpenChange }: Props) {
  const companyId = cliente?.company_id ?? null;
  const { data: costi = [], isLoading } = useCostiManuali(open ? companyId : null, mese);
  const salva = useSalvaCostoManuale(mese);
  const elimina = useEliminaCostoManuale(mese);
  const [fonte, setFonte] = useState("altro");
  const [campagna, setCampagna] = useState("");
  const [data, setData] = useState(() => fineMeseOOggi(mese, oggi));
  const [importo, setImporto] = useState("");
  const [note, setNote] = useState("");
  const totale = costi.reduce((s, c) => s + c.spend_amount, 0);
  const ultimoGiorno = fineMeseOOggi(mese, oggi);
  const valido = !!companyId && Number(importo) > 0 && data >= mese && data <= ultimoGiorno;

  const aggiungi = async () => {
    if (!companyId || !valido) return;
    try {
      await salva.mutateAsync({ company_id: companyId, source: fonte, campaign_name: campagna.trim() || null, date: data, spend_amount: Number(importo), notes: note.trim() || null });
      setImporto(""); setCampagna(""); setNote("");
      toast.success("Costo registrato");
    } catch (e) {
      toast.error("Costo non salvato", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Costi di {meseLeggibile} · {cliente?.cliente_nome ?? ""}</DialogTitle>
          <DialogDescription>
            I costi pubblicitari che non arrivano da soli. La spesa Meta dell'account collegato si scarica con «Aggiorna costi Meta»: non inserirla anche qui, verrebbe contata due volte.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 rounded-lg border p-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Fonte</Label>
              <Select value={fonte} onValueChange={setFonte}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FONTI.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Data</Label>
              <Input type="date" value={data} min={mese} max={ultimoGiorno} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Importo € (imponibile)</Label>
              <Input type="number" min={0} step="0.01" value={importo} onChange={(e) => setImporto(e.target.value)} placeholder="0" />
            </div>
            <div className="grid gap-1.5">
              <Label>Campagna (facoltativa)</Label>
              <Input value={campagna} onChange={(e) => setCampagna(e.target.value)} placeholder="es. Reel settembre" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Nota</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="facoltativa" />
          </div>
          <Button size="sm" className="w-fit gap-1.5" disabled={!valido || salva.isPending} onClick={() => void aggiungi()}>
            {salva.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Aggiungi costo
          </Button>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Costi inseriti a mano in {meseLeggibile}</span>
            <span className="font-medium tabular-nums text-foreground">{eur(totale, 2)}</span>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : costi.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">Nessun costo a mano in questo mese.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {costi.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="w-16 shrink-0 text-xs text-muted-foreground">{dataBreve(c.date, false, oggi)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {FONTI.find((f) => f.value === c.source)?.label ?? c.source}
                    {c.campaign_name ? <span className="text-muted-foreground"> · {c.campaign_name}</span> : null}
                    {c.notes ? <span className="text-muted-foreground"> — {c.notes}</span> : null}
                  </span>
                  <span className="tabular-nums font-medium">{eur(c.spend_amount, 2)}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" aria-label="Elimina costo"
                    disabled={elimina.isPending}
                    onClick={() => elimina.mutate(c.id, { onSuccess: () => toast.success("Costo eliminato"), onError: (e) => toast.error("Non eliminato", { description: e instanceof Error ? e.message : String(e) }) })}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
