// src/components/orders/generali/contratto/AttiAggiuntivi.tsx
// Atti aggiuntivi, varianti (in più o in meno) e proroghe: cambiano il valore e la fine dei lavori.
import { useState } from "react";
import { FileText, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { openAttachmentInTab } from "@/components/orders/filePreviewUtils";
import { useEliminaAtto, useSalvaAtto, type AttoDaSalvare } from "@/hooks/useGeneraleContratto";
import { TIPI_ATTO, messaggioContratto, oggiIso, type AttoAggiuntivo, type TipoAtto } from "@/lib/orders/generali/contratto";
import { cn } from "@/lib/utils";
import { Campo, CampoNumero } from "./campi";
import { dataIt, euro, haNumeriSbagliati } from "./formato";

export function AttiAggiuntivi({ generaleId, atti, puoModificare }: { generaleId: string; atti: AttoAggiuntivo[]; puoModificare: boolean }) {
  const [inModifica, setInModifica] = useState<AttoAggiuntivo | "nuovo" | null>(null);
  const elimina = useEliminaAtto(generaleId);
  const confirm = useConfirm();
  const togli = async (a: AttoAggiuntivo) => {
    if (!(await confirm({ title: `Togliere «${a.descrizione}»?`, description: "Il valore e la fine dei lavori tornano come senza questo atto. Il documento resta nell'archivio.", confirmLabel: "Togli", variant: "destructive" }))) return;
    elimina.mutate(a.id, {
      onSuccess: () => toast.success("Atto tolto"),
      onError: (e) => toast.error(messaggioContratto(e, "l'atto")),
    });
  };

  return (
    <section aria-labelledby="atti-titolo" className="rounded-lg border bg-card">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h3 id="atti-titolo" className="text-sm font-semibold">Atti aggiuntivi, varianti e proroghe</h3>
        {puoModificare && (
          <Button size="sm" variant="outline" onClick={() => setInModifica("nuovo")}><Plus className="mr-1.5 h-3.5 w-3.5" /> Aggiungi</Button>
        )}
      </header>
      {atti.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">Nessun atto: il contratto vale com'è stato firmato.</p>
      ) : (
        <ul className="divide-y">
          {atti.map((a) => (
            <li key={a.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {TIPI_ATTO[a.tipo]}{a.numero ? ` n. ${a.numero}` : ""} · <span className="font-normal">{a.descrizione}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {dataIt(a.data)}
                  {a.giorniProroga > 0 && ` · +${a.giorniProroga} giorni alla fine lavori`}
                </p>
                {a.allegato && (
                  <button type="button" onClick={() => void openAttachmentInTab(a.allegato!.percorso)} className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <FileText className="h-3 w-3" /> {a.allegato.nome}
                  </button>
                )}
              </div>
              {a.tipo !== "proroga" && (
                <span className={cn("shrink-0 tabular-nums", a.importo < 0 && "text-destructive")}>{a.importo > 0 ? "+" : ""}{euro(a.importo)}</span>
              )}
              {puoModificare && (
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Modifica ${a.descrizione}`} onClick={() => setInModifica(a)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label={`Togli ${a.descrizione}`} onClick={() => void togli(a)} disabled={elimina.isPending}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <Dialog open={inModifica !== null} onOpenChange={(o) => { if (!o) setInModifica(null); }}>
        <DialogContent className="max-w-md">
          {inModifica !== null && (
            <ModuloAtto generaleId={generaleId} atto={inModifica === "nuovo" ? null : inModifica} chiudi={() => setInModifica(null)} />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ModuloAtto({ generaleId, atto, chiudi }: { generaleId: string; atto: AttoAggiuntivo | null; chiudi: () => void }) {
  const salva = useSalvaAtto(generaleId);
  const [a, setA] = useState<AttoDaSalvare>(() => atto
    ? { id: atto.id, tipo: atto.tipo, numero: atto.numero, data: atto.data, descrizione: atto.descrizione, importo: atto.importo, giorniProroga: atto.giorniProroga }
    : { tipo: "atto_aggiuntivo", numero: null, data: oggiIso(), descrizione: "", importo: 0, giorniProroga: 0 });
  const [file, setFile] = useState<File | null>(null);
  const proroga = a.tipo === "proroga";
  const puoSalvare = a.descrizione.trim() !== "" && /^\d{4}-\d{2}-\d{2}$/.test(a.data) && !haNumeriSbagliati(a)
    && (proroga ? a.giorniProroga > 0 : a.importo !== 0 || a.giorniProroga > 0);

  const conferma = () => {
    if (!puoSalvare) return;
    salva.mutate({ ...a, descrizione: a.descrizione.trim(), file }, {
      onSuccess: () => { toast.success(atto ? "Atto aggiornato" : "Atto aggiunto: valore e fine lavori sono aggiornati"); chiudi(); },
      onError: (e) => toast.error(messaggioContratto(e, "l'atto")),
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{atto ? "Modifica l'atto" : "Nuovo atto"}</DialogTitle>
        <DialogDescription>Un importo in più o in meno cambia il valore del contratto; i giorni di proroga spostano la fine dei lavori.</DialogDescription>
      </DialogHeader>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); conferma(); }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etichetta="Tipo">
            {(id) => (
              <Select value={a.tipo} onValueChange={(v) => setA((x) => ({ ...x, tipo: v as TipoAtto, importo: v === "proroga" ? 0 : x.importo }))}>
                <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TIPI_ATTO) as TipoAtto[]).map((t) => <SelectItem key={t} value={t}>{TIPI_ATTO[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </Campo>
          <Campo etichetta="Data">{(id) => <Input id={id} type="date" value={a.data} onChange={(e) => setA((x) => ({ ...x, data: e.target.value }))} />}</Campo>
        </div>
        <Campo etichetta="Descrizione">
          {(id) => <Input id={id} value={a.descrizione} onChange={(e) => setA((x) => ({ ...x, descrizione: e.target.value }))} placeholder="Lavori aggiuntivi alla scuola Rodari" />}
        </Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etichetta="Numero">{(id) => <Input id={id} value={a.numero ?? ""} onChange={(e) => setA((x) => ({ ...x, numero: e.target.value.trim() || null }))} />}</Campo>
          {!proroga && (
            <CampoNumero etichetta="Importo (− se in meno)" valore={a.importo} segno onChange={(v) => setA((x) => ({ ...x, importo: v ?? 0 }))} suffisso="€" />
          )}
          <CampoNumero etichetta="Giorni di proroga" valore={a.giorniProroga} decimali={0} onChange={(v) => setA((x) => ({ ...x, giorniProroga: v === null ? 0 : Number.isNaN(v) ? v : Math.round(v) }))} />
        </div>
        <Campo etichetta={atto?.allegato ? `Documento (ora: ${atto.allegato.nome})` : "Documento"} aiuto="Va nell'archivio della commessa generale.">
          {(id) => <Input id={id} type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />}
        </Campo>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={chiudi}>Annulla</Button>
          <Button type="submit" disabled={!puoSalvare || salva.isPending}>
            {salva.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salva
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
