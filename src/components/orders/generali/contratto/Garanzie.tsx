// src/components/orders/generali/contratto/Garanzie.tsx
// Le garanzie date al committente (cauzione definitiva, garanzia dell'anticipazione, CAR…), con
// scadenza e svincolo: quelle in scadenza compaiono anche in Panoramica.
import { useState } from "react";
import { FileText, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { openAttachmentInTab } from "@/components/orders/filePreviewUtils";
import { useEliminaGaranzia, useSalvaGaranzia, type GaranziaDaSalvare } from "@/hooks/useGeneraleContratto";
import { TIPI_GARANZIA, giorniTra, messaggioContratto, oggiIso, type Garanzia, type TipoGaranzia } from "@/lib/orders/generali/contratto";
import { Campo, CampoNumero } from "./campi";
import { dataIt, euro, haNumeriSbagliati } from "./formato";

function StatoGaranzia({ g, oggi }: { g: Garanzia; oggi: string }) {
  if (g.svincolataIl) return <Badge variant="secondary" className="font-normal">Svincolata il {dataIt(g.svincolataIl)}</Badge>;
  if (!g.scadenza) return <Badge variant="outline" className="font-normal">Senza scadenza</Badge>;
  const mancano = giorniTra(oggi, g.scadenza);
  if (mancano < 0) return <Badge variant="destructive" className="font-normal">Scaduta il {dataIt(g.scadenza)}</Badge>;
  if (mancano <= 30) return <Badge className="bg-amber-500 font-normal text-white hover:bg-amber-500">Scade il {dataIt(g.scadenza)}</Badge>;
  return <Badge variant="outline" className="font-normal">Scade il {dataIt(g.scadenza)}</Badge>;
}

export function Garanzie({ generaleId, garanzie, puoModificare }: { generaleId: string; garanzie: Garanzia[]; puoModificare: boolean }) {
  const [inModifica, setInModifica] = useState<Garanzia | "nuova" | null>(null);
  const elimina = useEliminaGaranzia(generaleId);
  const confirm = useConfirm();
  const oggi = oggiIso();
  const togli = async (g: Garanzia) => {
    if (!(await confirm({ title: `Togliere ${TIPI_GARANZIA[g.tipo].toLowerCase()}?`, description: "Se è stata restituita, segna invece la data di svincolo. Il documento resta nell'archivio.", confirmLabel: "Togli", variant: "destructive" }))) return;
    elimina.mutate(g.id, {
      onSuccess: () => toast.success("Garanzia tolta"),
      onError: (e) => toast.error(messaggioContratto(e, "la garanzia")),
    });
  };

  return (
    <section aria-labelledby="garanzie-titolo" className="rounded-lg border bg-card">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h3 id="garanzie-titolo" className="text-sm font-semibold">Garanzie date al committente</h3>
        {puoModificare && (
          <Button size="sm" variant="outline" onClick={() => setInModifica("nuova")}><Plus className="mr-1.5 h-3.5 w-3.5" /> Aggiungi</Button>
        )}
      </header>
      {garanzie.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">Aggiungi la cauzione definitiva e le polizze: ti avvisiamo prima che scadano.</p>
      ) : (
        <ul className="divide-y">
          {garanzie.map((g) => (
            <li key={g.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{TIPI_GARANZIA[g.tipo]}</p>
                <p className="text-xs text-muted-foreground">
                  {[g.garante, g.numero && `n. ${g.numero}`, g.dataEmissione && `emessa il ${dataIt(g.dataEmissione)}`].filter(Boolean).join(" · ") || "Garante non indicato"}
                </p>
                {g.allegato && (
                  <button type="button" onClick={() => void openAttachmentInTab(g.allegato!.percorso)} className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <FileText className="h-3 w-3" /> {g.allegato.nome}
                  </button>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {g.importo !== null && <span className="tabular-nums">{euro(g.importo)}</span>}
                <StatoGaranzia g={g} oggi={oggi} />
              </div>
              {puoModificare && (
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Modifica ${TIPI_GARANZIA[g.tipo]}`} onClick={() => setInModifica(g)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label={`Togli ${TIPI_GARANZIA[g.tipo]}`} onClick={() => void togli(g)} disabled={elimina.isPending}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <Dialog open={inModifica !== null} onOpenChange={(o) => { if (!o) setInModifica(null); }}>
        <DialogContent className="max-w-md">
          {inModifica !== null && (
            <ModuloGaranzia generaleId={generaleId} garanzia={inModifica === "nuova" ? null : inModifica} chiudi={() => setInModifica(null)} />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ModuloGaranzia({ generaleId, garanzia, chiudi }: { generaleId: string; garanzia: Garanzia | null; chiudi: () => void }) {
  const salva = useSalvaGaranzia(generaleId);
  const [g, setG] = useState<GaranziaDaSalvare>(() => garanzia
    ? { id: garanzia.id, tipo: garanzia.tipo, garante: garanzia.garante, numero: garanzia.numero, importo: garanzia.importo, dataEmissione: garanzia.dataEmissione, scadenza: garanzia.scadenza, svincolataIl: garanzia.svincolataIl, note: garanzia.note }
    : { tipo: "cauzione_definitiva", garante: null, numero: null, importo: null, dataEmissione: null, scadenza: null, svincolataIl: null, note: null });
  const [file, setFile] = useState<File | null>(null);
  const data = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const puoSalvare = !haNumeriSbagliati(g) && !salva.isPending;

  const conferma = () => {
    if (!puoSalvare) return;
    salva.mutate({ ...g, file }, {
      onSuccess: () => { toast.success(garanzia ? "Garanzia aggiornata" : "Garanzia aggiunta"); chiudi(); },
      onError: (e) => toast.error(messaggioContratto(e, "la garanzia")),
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{garanzia ? "Modifica la garanzia" : "Nuova garanzia"}</DialogTitle>
        <DialogDescription>Con la scadenza ti avvisiamo in Panoramica 60 giorni prima.</DialogDescription>
      </DialogHeader>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); conferma(); }}>
        <Campo etichetta="Tipo">
          {(id) => (
            <Select value={g.tipo} onValueChange={(v) => setG((x) => ({ ...x, tipo: v as TipoGaranzia }))}>
              <SelectTrigger id={id}><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TIPI_GARANZIA) as TipoGaranzia[]).map((t) => <SelectItem key={t} value={t}>{TIPI_GARANZIA[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etichetta="Banca o assicurazione">{(id) => <Input id={id} value={g.garante ?? ""} onChange={(e) => setG((x) => ({ ...x, garante: e.target.value.trim() ? e.target.value : null }))} />}</Campo>
          <Campo etichetta="Numero della polizza">{(id) => <Input id={id} value={g.numero ?? ""} onChange={(e) => setG((x) => ({ ...x, numero: e.target.value.trim() || null }))} />}</Campo>
          <CampoNumero etichetta="Importo garantito" valore={g.importo} onChange={(v) => setG((x) => ({ ...x, importo: v }))} suffisso="€" />
          <Campo etichetta="Emessa il">{(id) => <Input id={id} type="date" value={g.dataEmissione ?? ""} onChange={(e) => setG((x) => ({ ...x, dataEmissione: data(e.target.value) }))} />}</Campo>
          <Campo etichetta="Scade il">{(id) => <Input id={id} type="date" value={g.scadenza ?? ""} onChange={(e) => setG((x) => ({ ...x, scadenza: data(e.target.value) }))} />}</Campo>
          <Campo etichetta="Svincolata il" aiuto="Quando il committente la restituisce.">
            {(id) => <Input id={id} type="date" value={g.svincolataIl ?? ""} onChange={(e) => setG((x) => ({ ...x, svincolataIl: data(e.target.value) }))} />}
          </Campo>
        </div>
        <Campo etichetta={garanzia?.allegato ? `Documento (ora: ${garanzia.allegato.nome})` : "Documento"} aiuto="Va nell'archivio della commessa generale.">
          {(id) => <Input id={id} type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />}
        </Campo>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={chiudi}>Annulla</Button>
          <Button type="submit" disabled={!puoSalvare}>
            {salva.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salva
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
