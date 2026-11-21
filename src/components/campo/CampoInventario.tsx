import { useRef, useState } from "react";
import { Check, Loader2, Search, ShoppingCart, Warehouse, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { UniformSelect } from "@/components/ui/uniform-select";
import {
  useCampoCantieriPrelievo, useCampoInventario, usePrelievoRegistra,
  type StockCampo,
} from "@/hooks/campo/useCampoPrelievo";
import { useDebounce } from "@/hooks/useDebounce";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { cn } from "@/lib/utils";

import { formatoQuantitaMagazzino, nomeCantierePrelievo, quantitaPrelievo } from "@/lib/campo/magazzino";

interface RigaCarrello {
  articolo: StockCampo;
  quantita: string;
}

export function CampoInventario({ companyId, attivo, puoPrelevare, richiedeConferma, onRegistrato }: {
  companyId: string;
  attivo: boolean;
  puoPrelevare: boolean;
  richiedeConferma: boolean;
  onRegistrato: () => void;
}) {
  const [ricerca, setRicerca] = useState("");
  const cerca = useDebounce(ricerca.trim(), 250);
  const [righe, setRighe] = useState<RigaCarrello[]>([]);
  const [aperto, setAperto] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [note, setNote] = useState("");
  const ultimoTentativo = useRef<{ firma: string; id: string } | null>(null);
  const inInvio = useRef(false);
  const online = useOnlineStatus();
  const inventario = useCampoInventario(companyId, cerca, attivo);
  const cantieri = useCampoCantieriPrelievo(companyId, attivo && puoPrelevare && aperto);
  const prelievo = usePrelievoRegistra(companyId);

  const articoli = inventario.data?.pages.flat() ?? [];
  const articoliVisibili = new Map(articoli.map((articolo) => [articolo.id, articolo]));
  const carrello = new Map(righe.map((riga) => [riga.articolo.id, riga]));
  const primaRiga = righe[0];
  const warehouseId = primaRiga?.articolo.warehouse_id ?? null;
  const magazzino = primaRiga?.articolo.magazzino ?? "Senza ubicazione";
  const soloCantiere = cantieri.data?.length === 1 ? cantieri.data[0].id : "";
  const cantiere = orderId || soloCantiere;
  const cantiereValido = !cantieri.isError && !!cantieri.data?.some((item) => item.id === cantiere);
  const righeValide = righe.length > 0 && righe.every(({ articolo, quantita }) => {
    const qta = quantitaPrelievo(quantita);
    return qta > 0 && qta <= (articoliVisibili.get(articolo.id)?.disponibile ?? articolo.disponibile);
  });

  const rimuovi = (id: string) => setRighe((prev) => prev.filter((riga) => riga.articolo.id !== id));
  const aggiorna = (id: string, quantita: string) =>
    setRighe((prev) => prev.map((riga) => riga.articolo.id === id ? { ...riga, quantita } : riga));

  const aggiungi = (articolo: StockCampo) => {
    setRighe((prev) => prev.length >= 100
      || prev.some((riga) => riga.articolo.id === articolo.id || riga.articolo.warehouse_id !== articolo.warehouse_id)
      ? prev
      : [...prev, { articolo, quantita: String(Math.min(1, articolo.disponibile)).replace(".", ",") }]);
  };

  const apriRiepilogo = () => {
    prelievo.reset();
    setAperto(true);
  };

  const registra = async () => {
    if (inInvio.current || !online || !puoPrelevare || !righeValide || !cantiereValido) return;
    const materiale = righe.map((riga) => ({ stock_item_id: riga.articolo.id, quantita: quantitaPrelievo(riga.quantita) }));
    const dati = { orderId: cantiere, warehouseId, righe: materiale, note: note.trim() };
    const firma = JSON.stringify(dati);
    if (ultimoTentativo.current?.firma !== firma) ultimoTentativo.current = { firma, id: crypto.randomUUID() };
    inInvio.current = true;
    try {
      const esito = await prelievo.mutateAsync({ ...dati, requestId: ultimoTentativo.current.id });
      const messaggio = esito.stato === "consegnato"
        ? "Prelievo registrato. Giacenze aggiornate."
        : esito.stato === "rifiutato" ? "Questo prelievo è stato rifiutato." : "Richiesta inviata al magazzino.";
      if (esito.stato === "rifiutato") toast.info(messaggio);
      else toast.success(messaggio);
      ultimoTentativo.current = null;
      setRighe([]);
      setNote("");
      setOrderId("");
      setAperto(false);
      onRegistrato();
    } catch {
      // Il riepilogo resta aperto e il tentativo mantiene il suo identificativo.
    } finally {
      inInvio.current = false;
    }
  };

  return (
    <div className={cn("space-y-3", puoPrelevare && righe.length > 0 && "pb-24")}>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Cerca nell’inventario"
          value={ricerca}
          onChange={(e) => setRicerca(e.target.value)}
          placeholder="Cerca materiale o codice"
          className="min-h-12 rounded-xl pl-9 text-base"
        />
      </div>

      {inventario.isLoading ? (
        <div role="status" className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /><span className="sr-only">Carico l’inventario</span></div>
      ) : inventario.isError && !inventario.isFetchNextPageError ? (
        <div role="alert" className="space-y-2 rounded-xl border p-4 text-sm">
          <p>Non riesco a caricare l’inventario.</p>
          <Button variant="outline" size="sm" onClick={() => void inventario.refetch()}>Riprova</Button>
        </div>
      ) : articoli.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          <Warehouse aria-hidden="true" className="mx-auto mb-2 h-7 w-7" />
          <p className="text-sm">{cerca ? "Nessun materiale trovato." : "Nessun articolo disponibile nei magazzini visibili."}</p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {articoli.map((articolo) => {
            const riga = carrello.get(articolo.id);
            const stessaUbicazione = !primaRiga || articolo.warehouse_id === warehouseId;
            const puoAggiungere = puoPrelevare && articolo.disponibile > 0 && stessaUbicazione;
            return (
              <li key={articolo.id} className={cn("rounded-xl border bg-card p-3.5", riga && "border-primary")}>
                <div className="flex justify-between gap-4">
                  <div className="min-w-0">
                    <p className="break-words font-semibold">{articolo.name}</p>
                    <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                      {articolo.internal_code && <span>{articolo.internal_code}</span>}
                      <span>{articolo.magazzino ?? "Senza ubicazione"}</span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-bold tabular-nums">{formatoQuantitaMagazzino.format(articolo.disponibile)} {articolo.unita_misura}</p>
                    <p className="text-xs text-muted-foreground">Disponibili</p>
                  </div>
                </div>
                {puoAggiungere && !riga && (
                  <Button type="button" variant="outline" className="mt-2 min-h-11 w-full" disabled={righe.length >= 100}
                    onClick={() => aggiungi(articolo)} aria-label={`Aggiungi ${articolo.name} al prelievo`}>
                    Aggiungi al prelievo
                  </Button>
                )}
                {puoPrelevare && riga && (
                  <div className="mt-3 flex items-center gap-2">
                    <Label htmlFor={`qta-${articolo.id}`} className="flex-1">Quantità</Label>
                    <Input id={`qta-${articolo.id}`} inputMode="decimal"
                      aria-label={`Quantità di ${articolo.name}`}
                      value={riga.quantita} onChange={(e) => aggiorna(articolo.id, e.target.value)}
                      className="min-h-11 w-24 text-right text-base tabular-nums" />
                    <Button type="button" variant="ghost" size="icon" className="h-11 w-11"
                      aria-label={`Rimuovi ${articolo.name}`} onClick={() => rimuovi(articolo.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                {puoPrelevare && !stessaUbicazione && articolo.disponibile > 0 &&
                  <p className="mt-2 text-xs text-muted-foreground">Per questo articolo apri un prelievo da {articolo.magazzino ?? "un’altra ubicazione"}.</p>}
              </li>
            );
          })}
        </ul>
      )}
      {inventario.hasNextPage && (
        <Button type="button" variant="outline" className="min-h-11 w-full" disabled={inventario.isFetchingNextPage}
          onClick={() => void inventario.fetchNextPage()}>
          {inventario.isFetchingNextPage ? "Carico…" : inventario.isFetchNextPageError ? "Riprova a caricare" : "Altri articoli"}
        </Button>
      )}

      {attivo && puoPrelevare && righe.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-2xl px-4 md:bottom-4">
          <Button type="button" className="h-12 w-full gap-2 rounded-xl text-sm font-semibold shadow-lg" onClick={apriRiepilogo}>
            <ShoppingCart className="h-4 w-4 shrink-0" />
            Rivedi prelievo · {righe.length} {righe.length === 1 ? "articolo" : "articoli"}
          </Button>
        </div>
      )}

      <Sheet open={attivo && puoPrelevare && aperto} onOpenChange={(value) => {
        if (!inInvio.current) setAperto(value);
      }}>
        <SheetContent side="bottom" className="mx-auto max-h-[88dvh] max-w-2xl overflow-y-auto rounded-t-2xl px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <SheetHeader className="pr-7 text-left">
            <SheetTitle>Materiale per il cantiere</SheetTitle>
            <SheetDescription>
              {richiedeConferma ? "Il magazzino conferma la richiesta prima di scalare le giacenze." : "La registrazione aggiorna subito le giacenze."}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="prelievo-cantiere">Cantiere di destinazione</Label>
              {cantieri.isError ? (
                <div role="alert" className="flex items-center justify-between gap-2 text-sm">
                  <span>Non riesco a caricare i cantieri.</span>
                  <Button type="button" variant="outline" size="sm" onClick={() => void cantieri.refetch()}>Riprova</Button>
                </div>
              ) : (
                <>
                  <UniformSelect id="prelievo-cantiere" value={cantiereValido ? cantiere : ""} required
                    disabled={prelievo.isPending || cantieri.isLoading || !cantieri.data?.length}
                    onChange={(event) => setOrderId(event.target.value)}
                    className="min-h-11 w-full rounded-lg border bg-background px-3 text-base">
                    <option value="" disabled>{cantieri.isLoading ? "Carico i cantieri…" : "Scegli un cantiere"}</option>
                    {cantieri.data?.map((item) => <option key={item.id} value={item.id}>{nomeCantierePrelievo(item)}</option>)}
                  </UniformSelect>
                  {cantieri.data?.length === 0 && <p className="text-sm text-muted-foreground">Nessun cantiere aperto assegnato. Chiedi un’assegnazione all’ufficio.</p>}
                </>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Warehouse aria-hidden="true" className="h-4 w-4" /> {magazzino}
              </div>
              <ul className="divide-y rounded-xl border">
                {righe.map(({ articolo, quantita }) => (
                  <li key={articolo.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1 break-words text-sm">{articolo.name}</span>
                    <Input aria-label={`Verifica quantità di ${articolo.name}`} inputMode="decimal"
                      value={quantita} disabled={prelievo.isPending} onChange={(e) => aggiorna(articolo.id, e.target.value)}
                      className="min-h-11 w-20 text-right text-base tabular-nums" />
                    {articolo.unita_misura && <span className="text-xs text-muted-foreground">{articolo.unita_misura}</span>}
                    <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0"
                      disabled={prelievo.isPending}
                      aria-label={`Togli ${articolo.name} dal riepilogo`} onClick={() => rimuovi(articolo.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
              {righe.length > 0 && !righeValide && <p role="alert" className="text-xs text-destructive">Indica quantità positive entro la disponibilità.</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prelievo-note">Note facoltative</Label>
              <Textarea id="prelievo-note" rows={2} value={note} disabled={prelievo.isPending}
                onChange={(e) => setNote(e.target.value)} />
            </div>

            {!online && <p role="status" className="text-sm text-muted-foreground">Attendi che torni la connessione per inviare il prelievo.</p>}
            {prelievo.isError && <p role="alert" className="text-sm text-destructive">{prelievo.error.message}</p>}
            <Button className="h-12 w-full gap-2 text-base" onClick={() => void registra()}
              disabled={prelievo.isPending || !online || !cantiereValido || !righeValide}>
              {prelievo.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
              {richiedeConferma ? "Invia richiesta" : "Registra prelievo"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
