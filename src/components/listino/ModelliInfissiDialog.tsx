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

const SUGGERITI = ["PVC Aluplast", "PVC Salamander", "PVC Rehau", "Alluminio"];
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  giaPresenti: string[];
}

export function ModelliInfissiDialog({ open, onOpenChange, companyId, giaPresenti }: Props) {
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
      toast.success(esito.prodotti_nuovi ? `${esito.prodotti_nuovi} configurazioni aggiunte in ${esito.linee} linee` : "Le configurazioni sono già presenti", {
        description: "I prezzi mancanti seguono la base della stessa linea, se presente. Prezzi già impostati invariati; verifica la gamma col fornitore.",
      });
      setNomi([]);
      setBozza("");
      onOpenChange(false);
    } catch (e) {
      toast.error("Linee non create", { description: e instanceof Error ? e.message : "Riprova." });
    } finally { invioInCorso.current = false; }
  };
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!inCorso) onOpenChange(v); }}>
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Layers className="h-5 w-5" /> Linee di infissi</DialogTitle>
          <DialogDescription>Ogni linea riceve {TIPOLOGIE_DISEGNO.length} configurazioni standard con disegno. Una linea nuova richiede prezzi, colori e vetri: la disponibilità geometrica non certifica la gamma del produttore.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 overflow-y-auto">
          <div className="flex gap-2">
            <Input value={bozza} onChange={(e) => setBozza(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aggiungi(bozza); } }}
              placeholder="Es. PVC Rehau Synego" aria-label="Nome della linea" maxLength={160} disabled={inCorso} />
            <Button type="button" size="icon" variant="outline" aria-label="Aggiungi linea" onClick={() => aggiungi(bozza)} disabled={inCorso || !bozza.trim()}><Plus className="h-4 w-4" /></Button>
          </div>
          {!nomi.length && <div className="flex flex-wrap gap-1.5">{SUGGERITI.map((s) => <Button key={s} type="button" size="sm" variant="ghost" className="h-7 border border-dashed px-2" disabled={inCorso} onClick={() => aggiungi(s)}>{s}</Button>)}</div>}
          {!!nomi.length && <ul className="flex flex-wrap gap-1.5">{nomi.map((n) => <li key={n} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-1 pl-3 pr-1 text-sm">{n}<button type="button" className="rounded-full p-1 hover:bg-muted" onClick={() => setNomi((p) => p.filter((x) => x !== n))} aria-label={`Togli ${n}`} disabled={inCorso}><X className="h-3.5 w-3.5" /></button></li>)}</ul>}
          {!!giaPresenti.length && <p className="text-xs text-muted-foreground">Hai già: {giaPresenti.join(", ")}. Riscrivendo una linea si completano solo le configurazioni mancanti.</p>}
          <p className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">Puoi impostare il prezzo nel listino o inserirlo manualmente nel preventivo. Prezzi già impostati, prodotti nascosti/disattivati e preventivi salvati restano invariati. Gli archivi restano in archivio. Nelle linee esistenti, i prezzi mancanti seguono la base prevalente della stessa linea, se presente.</p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={inCorso}>Non ora</Button>
          <Button onClick={crea} disabled={inCorso || !companyId || !elenco.length || elenco.length > 20}>{inCorso ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creo le linee…</> : "Prepara le linee"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
