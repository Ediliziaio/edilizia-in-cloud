/**
 * Un solo catalogo geometrico per le linee nuove, senza prezzi o schede di Demo.
 * Ogni creazione è atomica e ripetibile: articoli e prezzi già presenti restano intatti.
 */
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Layers, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useOrganizzaListino } from "@/hooks/useOrganizzaListino";
import { chiaveTesto } from "@/lib/listino/areeStandard";
import { TIPOLOGIE_DISEGNO } from "@/lib/serramenti/disegnoSerramento";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const SUGGERITI = ["PVC Aluplast", "PVC Salamander", "PVC Rehau", "Alluminio"];
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  giaPresenti: string[];
}

export function ModelliInfissiDialog({ open, onOpenChange, companyId, giaPresenti }: Props) {
  const tr = useT();
  const { preparaModelliInfissi } = useOrganizzaListino();
  const [nomi, setNomi] = useState<string[]>([]);
  const [bozza, setBozza] = useState("");
  const invioInCorso = useRef(false);
  const inCorso = preparaModelliInfissi.isPending;
  const elenco = [...new Map([...nomi, bozza.trim()].filter(Boolean).map((n) => [chiaveTesto(n), n])).values()];
  const aggiungi = (testo: string) => {
    const t = testo.trim();
    if (!t) return;
    setNomi((prima) => prima.some((n) => chiaveTesto(n) === chiaveTesto(t)) ? prima : [...prima, t]);
    setBozza("");
  };
  const crea = async () => {
    if (!companyId || elenco.length === 0 || invioInCorso.current) return;
    invioInCorso.current = true;
    try {
      const esito = await preparaModelliInfissi.mutateAsync(elenco);
      toast.success(esito.prodotti_nuovi ? tr("{prodotti_nuovi} configurazioni aggiunte in {linee} linee", { prodotti_nuovi: esito.prodotti_nuovi, linee: esito.linee }) : tr("Le configurazioni sono già presenti"), {
        description: tr("I prezzi mancanti seguono la base della stessa linea, se presente. Prezzi già impostati invariati; verifica la gamma col fornitore."),
      });
      setNomi([]);
      setBozza("");
      onOpenChange(false);
    } catch (e) {
      toast.error(tr("Linee non create"), { description: e instanceof Error ? e.message : tr("Riprova.") });
    } finally { invioInCorso.current = false; }
  };
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!inCorso) onOpenChange(v); }}>
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Layers className="h-5 w-5" /> {tr("Linee di infissi")}</DialogTitle>
          <DialogDescription>{tr("Ogni linea riceve {n} configurazioni standard con disegno. Una linea nuova richiede prezzi, colori e vetri: la disponibilità geometrica non certifica la gamma del produttore.", { n: TIPOLOGIE_DISEGNO.length })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 overflow-y-auto">
          <div className="flex gap-2">
            <Input value={bozza} onChange={(e) => setBozza(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aggiungi(bozza); } }}
              placeholder={tr("Es. PVC Rehau Synego")} aria-label={tr("Nome della linea")} maxLength={160} disabled={inCorso} />
            <Button type="button" size="icon" variant="outline" aria-label={tr("Aggiungi linea")} onClick={() => aggiungi(bozza)} disabled={inCorso || !bozza.trim()}><Plus className="h-4 w-4" /></Button>
          </div>
          {!nomi.length && <div className="flex flex-wrap gap-1.5">{SUGGERITI.map((s) => <Button key={s} type="button" size="sm" variant="ghost" className="h-7 border border-dashed px-2" disabled={inCorso} onClick={() => aggiungi(s)}>{s}</Button>)}</div>}
          {!!nomi.length && <ul className="flex flex-wrap gap-1.5">{nomi.map((n) => <li key={n} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-1 pl-3 pr-1 text-sm">{n}<button type="button" className="rounded-full p-1 hover:bg-muted" onClick={() => setNomi((p) => p.filter((x) => x !== n))} aria-label={tr("Togli {n}", { n })} disabled={inCorso}><X className="h-3.5 w-3.5" /></button></li>)}</ul>}
          {!!giaPresenti.length && <p className="text-xs text-muted-foreground">{tr("Hai già: {valore}. Riscrivendo una linea si completano solo le configurazioni mancanti.", { valore: giaPresenti.join(", ") })}</p>}
          <p className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">{tr("Puoi impostare il prezzo nel listino o inserirlo manualmente nel preventivo. Prezzi già impostati, prodotti nascosti/disattivati e preventivi salvati restano invariati. Gli archivi restano in archivio. Nelle linee esistenti, i prezzi mancanti seguono la base prevalente della stessa linea, se presente.")}</p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={inCorso}>{tr("Non ora")}</Button>
          <Button onClick={crea} disabled={inCorso || !companyId || !elenco.length || elenco.length > 20}>{inCorso ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{tr("Creo le linee…")}</> : tr("Prepara le linee")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
