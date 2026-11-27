/**
 * Cantiere → Rapportini → Rendiconti al committente (27/11/2026): il foglio per il committente, un rendiconto
 * PER GIORNO, coi prezzi. Nasce prendendo le voci di tutti i rapportini di quel giorno (o si scrive a mano);
 * i confermati entrano nel rendiconto del periodo (Finanza → Rendiconto). Senza il permesso sugli importi
 * la scheda dice perché non mostra l'elenco.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Plus, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePermissions } from "@/hooks/usePermissions";
import { formatCurrency } from "@/lib/formatters";
import { messaggioErrore } from "@/lib/messaggioErrore";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { cn } from "@/lib/utils";
import { categorieRigheRendiconti, elencoRendiconti, riassuntoRighe, rendicontiDaRapportini, rendicontoDelGiorno, type EsitoDaRapportini, type StatoRendiconto } from "@/lib/rendiconti/rendicontiGiornalieri";
import { PulsantePdfRendiconto } from "@/components/orders/PulsantePdfRendiconto";
import { RendicontoGiornalieroEditor } from "@/components/orders/RendicontoGiornalieroEditor";

const oggi = () => new Date().toLocaleDateString("en-CA");
const giorno = (d: string) => { const [a, m, g] = d.split("-"); return `${g}/${m}/${a}`; };

export function RendicontiGiornalieri({ orderId, apriId, onApriConsumato }: {
  orderId: string;
  /** Un rendiconto da aprire subito (arriva da «Crea il rendiconto di questo giorno»). */
  apriId?: string | null;
  onApriConsumato?: () => void;
}) {
  const tr = useT();
  const qc = useQueryClient();
  const { canViewOrderAmounts, canEditOrders } = usePermissions();
  const [aperto, setAperto] = useState<{ id: string | null } | null>(null);
  const [prova, setProva] = useState<EsitoDaRapportini | null>(null);
  // «Nuovo rendiconto del giorno» chiede prima il giorno: lo stesso giorno apre sempre lo stesso rendiconto.
  const [scegliGiorno, setScegliGiorno] = useState<string | null>(null);

  const [apriVisto, setApriVisto] = useState<string | null>(null);
  if ((apriId ?? null) !== apriVisto) {
    setApriVisto(apriId ?? null);
    if (apriId) setAperto({ id: apriId });
  }
  useEffect(() => { if (apriId) onApriConsumato?.(); }, [apriId, onApriConsumato]);

  const elenco = useQuery({
    queryKey: ["rendiconti-giornalieri", orderId],
    enabled: canViewOrderAmounts,
    queryFn: () => elencoRendiconti(orderId),
  });

  // Chi non ha descrizione dice cosa contiene: una sola lettura per tutto l'elenco.
  const senzaDescrizione = (elenco.data ?? []).filter((r) => !r.descrizione_lavori?.trim()).map((r) => r.id);
  const contenuto = useQuery({
    queryKey: ["rendiconti-giornalieri-contenuto", orderId, senzaDescrizione.join(",")],
    enabled: canViewOrderAmounts && senzaDescrizione.length > 0,
    queryFn: () => categorieRigheRendiconti(senzaDescrizione),
  });

  const calcola = useMutation({
    mutationFn: () => rendicontiDaRapportini(orderId, true),
    onSuccess: setProva,
    onError: (e) => toast.error(messaggioErrore(e, tr("Controllo non riuscito"))),
  });
  const apriGiorno = useMutation({
    mutationFn: (data: string) => rendicontoDelGiorno(orderId, data),
    onSuccess: (r) => {
      setScegliGiorno(null);
      if (r.aggiunti > 0) toast.success(tr("Prese le voci di {n} rapportini", { n: r.rapportini }));
      void qc.invalidateQueries({ queryKey: ["rendiconti-giornalieri", orderId] });
      setAperto({ id: r.id });
    },
    onError: (e) => toast.error(messaggioErrore(e, tr("Rendiconto non aperto"))),
  });
  const crea = useMutation({
    mutationFn: () => rendicontiDaRapportini(orderId, false),
    onSuccess: (r) => {
      setProva(null);
      toast.success(tr("{n} rendiconti creati in bozza", { n: r.creati.length }));
      // Un rapportino difettoso non ferma gli altri: chi non è passato va detto, col motivo.
      if (r.errori?.length) toast.error(tr("{n} giorni non trasformati: {motivo}", { n: r.errori.length, motivo: r.errori[0].errore }));
      void qc.invalidateQueries({ queryKey: ["rendiconti-giornalieri", orderId] });
    },
    onError: (e) => toast.error(messaggioErrore(e, tr("Rendiconti non creati"))),
  });

  if (!canViewOrderAmounts) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        {tr("I rendiconti hanno i prezzi: per vederli serve il permesso «Venduto e importi». Chiedilo al titolare.")}
      </p>
    );
  }

  const righe = elenco.data ?? [];
  const nomeStato: Record<StatoRendiconto, string> = { bozza: tr("Bozza"), confermato: tr("Confermato"), annullato: tr("Annullato") };
  const colore: Record<StatoRendiconto, string> = {
    bozza: "border-slate-300 bg-slate-100 text-slate-600",
    confermato: "border-green-600 bg-green-600 text-white",
    annullato: "border-red-300 bg-red-50 text-red-600",
  };

  return (
    <section aria-label={tr("Rendiconti")} className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold"><FileText className="h-4 w-4" />{tr("Rendiconti")} ({elenco.isLoading ? "…" : righe.length})</h2>
        {canEditOrders && (
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 text-xs" disabled={calcola.isPending} onClick={() => calcola.mutate()}>
              {calcola.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}{tr("Crea dai rapportini")}
            </Button>
            <Button type="button" size="sm" className="h-8 gap-1 px-3 text-xs font-semibold" onClick={() => setScegliGiorno(oggi())}>
              <Plus className="h-3.5 w-3.5" />{tr("Nuovo rendiconto del giorno")}
            </Button>
          </div>
        )}
      </div>

      {elenco.isError && <p className="text-sm text-destructive">{messaggioErrore(elenco.error, tr("Elenco non caricato"))}</p>}
      {!elenco.isLoading && !elenco.isError && righe.length === 0 && (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{tr("Nessun rendiconto. Aprine uno per il giorno, o crealo dai rapportini già scritti.")}</p>
      )}
      {righe.length > 0 && (
        <ul className="divide-y rounded-lg border bg-card">
          {righe.map((r) => (
            <li key={r.id} className={cn("flex items-center", r.stato === "annullato" && "opacity-60")}>
              <button type="button" onClick={() => setAperto({ id: r.id })}
                /* Sul telefono due righe: sopra numero, giorno, totale e stato — il giorno non si
                   taglia mai; sotto la descrizione, che è l'unica cosa che si accorcia. Da sm in su
                   torna la riga sola di prima. Ogni pezzo sta nel DOM una volta sola: a spostarlo
                   è la griglia, così chi legge con la voce non si sente dire due volte il totale. */
                className="grid min-w-0 flex-1 grid-cols-[2.5rem_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5 px-3 py-1.5 text-left text-[13px] hover:bg-muted/50 sm:grid-cols-[3rem_5.5rem_minmax(0,1fr)_auto] sm:gap-x-3">
                <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">n. {r.numero}</span>
                <span className="whitespace-nowrap tabular-nums">{giorno(r.data)}</span>
                <span className="col-start-3 row-start-1 flex items-center justify-self-end gap-2 sm:col-start-4">
                  <span className="font-medium tabular-nums">{formatCurrency(r.totale)}</span>
                  <span className={cn("rounded border px-1.5 text-[10px]", colore[r.stato])}>{nomeStato[r.stato]}</span>
                </span>
                <span className="col-span-3 row-start-2 min-w-0 truncate sm:col-span-1 sm:col-start-3 sm:row-start-1">
                  <span className="font-medium">{r.descrizione_lavori?.trim() || (contenuto.data ? riassuntoRighe(contenuto.data.get(r.id) ?? [], tr) : (r.righe === 0 ? tr("Vuoto") : "…"))}</span>
                  <span className="ml-2 text-[11px] text-muted-foreground">{r.righe === 1 ? tr("1 riga") : tr("{n} righe", { n: r.righe })}</span>
                  {r.rapportini > 0 && <span className="ml-2 text-[11px] text-muted-foreground">{r.rapportini === 1 ? tr("da 1 rapportino") : tr("da {n} rapportini", { n: r.rapportini })}</span>}
                  {r.rapportini_nuovi > 0 && <span className="ml-2 text-[11px] font-medium text-amber-700">{r.rapportini_nuovi === 1 ? tr("1 rapportino nuovo") : tr("{n} rapportini nuovi", { n: r.rapportini_nuovi })}</span>}
                  {r.rapportini_ritirati > 0 && <span className="ml-2 text-[11px] font-medium text-red-700">{r.rapportini_ritirati === 1 ? tr("1 rapportino rifiutato dentro: riaprilo e controlla") : tr("{n} rapportini rifiutati dentro: riaprilo e controlla", { n: r.rapportini_ritirati })}</span>}
                  {r.senza_prezzo > 0 && <span className="ml-2 text-[11px] font-medium text-amber-700">{tr("{n} senza prezzo", { n: r.senza_prezzo })}</span>}
                  {r.sal_id && <span className="ml-2 text-[11px] text-blue-800">{tr("nel rendiconto del periodo")}</span>}
                </span>
              </button>
              {r.stato !== "annullato" && <span className="pr-2"><PulsantePdfRendiconto rendicontoId={r.id} className="h-7 px-2 text-xs" /></span>}
            </li>
          ))}
        </ul>
      )}

      {aperto && (
        <RendicontoGiornalieroEditor key={aperto.id ?? "nuovo"} orderId={orderId} rendicontoId={aperto.id} puoModificare={canEditOrders}
          onClose={() => { setAperto(null); void qc.invalidateQueries({ queryKey: ["rendiconti-giornalieri", orderId] }); }} />
      )}

      <Dialog open={scegliGiorno !== null} onOpenChange={(o) => { if (!o) setScegliGiorno(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{tr("Nuovo rendiconto del giorno")}</DialogTitle>
            <DialogDescription>{tr("Se quel giorno ci sono rapportini, il rendiconto prende le loro voci.")}</DialogDescription>
          </DialogHeader>
          <label className="grid gap-1 text-xs text-muted-foreground">{tr("Giorno")}
            <Input type="date" aria-label={tr("Giorno")} className="h-9 w-40" value={scegliGiorno ?? ""} onChange={(e) => setScegliGiorno(e.target.value)} />
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => setScegliGiorno(null)}>{tr("Annulla")}</Button>
            <Button type="button" size="sm" disabled={!scegliGiorno || apriGiorno.isPending} onClick={() => scegliGiorno && apriGiorno.mutate(scegliGiorno)}>
              {apriGiorno.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}{tr("Apri")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!prova} onOpenChange={(o) => { if (!o) setProva(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tr("Crea dai rapportini")}</DialogTitle>
            <DialogDescription>
              {prova && (prova.da_creare > 0 || prova.da_aggiornare > 0)
                ? tr("Creo {n} rendiconti, uno per giorno; aggiorno {m} bozze.", { n: prova.da_creare, m: prova.da_aggiornare })
                : tr("Non c'è niente da creare.")}
            </DialogDescription>
          </DialogHeader>
          {prova && (
            <ul className="space-y-0.5 text-sm text-muted-foreground">
              <li>{tr("Giorni con rapportini: {n}", { n: prova.giorni })}</li>
              <li>{tr("Da creare: {n}", { n: prova.da_creare })}</li>
              <li>{tr("Da aggiornare: {n}", { n: prova.da_aggiornare })}</li>
              <li>{tr("Già fatti: {n}", { n: prova.gia_fatti })}</li>
            </ul>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => setProva(null)}>{tr("Chiudi")}</Button>
            <Button type="button" size="sm" disabled={!prova || (prova.da_creare === 0 && prova.da_aggiornare === 0) || crea.isPending} onClick={() => crea.mutate()}>
              {crea.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}{tr("Crea")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
