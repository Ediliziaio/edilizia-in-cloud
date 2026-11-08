// Revisione di un documento di commessa: etichetta e finestra per segnarla.
// Il salvataggio passa da documento_commessa_revisione (migrazione 20281222220000),
// che rende «superata» la revisione approvata di prima con lo stesso codice.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  STATI_REVISIONE, TIPI_DOCUMENTO, etichettaStato, haRevisione, linkDopoApprovazione, proponiDopoApprovazione, testoRevisione,
  type DatiRevisione,
} from "@/lib/commesse/revisioniDocumenti";

// La funzione è nuova e non è ancora nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const COLORE_STATO: Record<string, string> = {
  approvato: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  in_lavorazione: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  superato: "bg-slate-100 text-slate-500 line-through dark:bg-slate-800 dark:text-slate-400",
};

export function EtichettaRevisione({ doc }: { doc: DatiRevisione }) {
  if (!haRevisione(doc)) return null;
  const testo = testoRevisione(doc);
  const stato = etichettaStato(doc.stato_revisione);
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-[11px]">
      {testo && <span className="text-foreground/80">{testo}</span>}
      {stato && <span className={cn("rounded px-1.5 py-0.5 font-medium", COLORE_STATO[doc.stato_revisione ?? ""])}>{stato}</span>}
    </span>
  );
}

const NESSUNO = "_nessuno";

export function RevisioneDocumentoDialog({ open, onOpenChange, doc }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doc: DatiRevisione & { id: string; order_id: string; file_name: string };
}) {
  const qc = useQueryClient();
  const [tipo, setTipo] = useState(doc.tipo_documento ?? NESSUNO);
  const [codice, setCodice] = useState(doc.codice_elaborato ?? "");
  const [revisione, setRevisione] = useState(doc.revisione ?? "");
  const [stato, setStato] = useState(doc.stato_revisione ?? NESSUNO);
  // Approvata una nuova revisione di computo o tavola: la finestra resta aperta e dice cosa fare.
  const [approvata, setApprovata] = useState(false);
  const navigate = useNavigate();
  const link = linkDopoApprovazione(doc.order_id);
  const chiudi = (o: boolean) => { if (!o) setApprovata(false); onOpenChange(o); };

  const salva = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("documento_commessa_revisione", {
        p_id: doc.id,
        p_tipo: tipo === NESSUNO ? null : tipo,
        p_codice: codice.trim() || null,
        p_revisione: revisione.trim() || null,
        p_stato: stato === NESSUNO ? null : stato,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(stato === "approvato" && codice.trim()
        ? "Revisione approvata: quella di prima con lo stesso codice è ora superata"
        : "Revisione salvata");
      qc.invalidateQueries({ queryKey: ["order-attachments", doc.order_id] });
      if (proponiDopoApprovazione(tipo === NESSUNO ? null : tipo, stato === NESSUNO ? null : stato, doc.stato_revisione ?? null)) {
        setApprovata(true);
        return;
      }
      onOpenChange(false);
    },
    onError: (e: unknown) => toast.error("Non riesco a salvare la revisione", { description: e instanceof Error ? e.message : String(e) }),
  });

  return (
    <Dialog open={open} onOpenChange={chiudi}>
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        {approvata ? (
          <>
            <DialogHeader>
              <DialogTitle>{tipo === "computo" ? "Computo approvato" : "Tavola approvata"}: e la commessa?</DialogTitle>
              <DialogDescription>
                Lavorazioni e materiali della commessa vengono dalla revisione di prima e non si aggiornano da soli.
                Se cambiano le quantità o le lavorazioni, apri una variante; poi ricontrolla i materiali da ordinare.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" onClick={() => chiudi(false)}>Non cambia niente</Button>
              <Button variant="outline" onClick={() => { chiudi(false); navigate(link.materiali); }}>Vedi i materiali</Button>
              <Button onClick={() => { chiudi(false); navigate(link.varianti); }}>Apri una variante</Button>
            </DialogFooter>
          </>
        ) : (<>
        <DialogHeader>
          <DialogTitle>Revisione del documento</DialogTitle>
          <DialogDescription className="break-words">
            «{doc.file_name}». Approvando una revisione, quella approvata prima con lo stesso codice diventa superata: resta consultabile, ma si vede quale vale.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="revisione-tipo">Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger id="revisione-tipo"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NESSUNO}>—</SelectItem>
                {TIPI_DOCUMENTO.map((t) => <SelectItem key={t.valore} value={t.valore}>{t.etichetta}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="revisione-codice">Codice elaborato</Label>
            <Input id="revisione-codice" value={codice} onChange={(e) => setCodice(e.target.value)} placeholder="Es. A-01" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="revisione-numero">Revisione</Label>
            <Input id="revisione-numero" value={revisione} onChange={(e) => setRevisione(e.target.value)} placeholder="Es. B o 02" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="revisione-stato">Stato</Label>
            <Select value={stato} onValueChange={setStato}>
              <SelectTrigger id="revisione-stato"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NESSUNO}>—</SelectItem>
                {STATI_REVISIONE.map((s) => <SelectItem key={s.valore} value={s.valore}>{s.etichetta}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        {stato === "approvato" && !codice.trim() && (
          <p className="text-xs text-muted-foreground">Senza codice elaborato le altre revisioni non diventano superate da sole.</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => chiudi(false)}>Annulla</Button>
          <Button onClick={() => salva.mutate()} disabled={salva.isPending}>
            {salva.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />}Salva
          </Button>
        </DialogFooter>
        </>)}
      </DialogContent>
    </Dialog>
  );
}
