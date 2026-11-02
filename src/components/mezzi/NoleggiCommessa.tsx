/**
 * Fatture e costi → Noleggi e mezzi: per ogni mezzo del piano di cantiere il costo previsto, quello
 * registrato e la differenza. Il periodo e il previsto si decidono in Cantiere → Lavorazioni; il previsto
 * non entra nel margine (non è in v_ordine_marginalita), il costo registrato sì: da qui si registra e si collega.
 */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Truck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useMezzi } from "@/hooks/useMezzi";
import { useMezziPianoEconomia } from "@/hooks/useMezziPianoEconomia";
import { usePermissions } from "@/hooks/usePermissions";
import { usePianoMezziCantiere } from "@/hooks/usePianoMezziCantiere";
import { formatCurrency } from "@/lib/formatters";
import { economiaPianiMezzi, statoCostoMezzo, type StatoCostoMezzo } from "@/lib/mezzi/economiaPiani";
import type { PianoMezzo } from "@/lib/mezzi/pianoCantiere";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";
import { oggiIso } from "@/types/mezzi";
import { NuovoCostoDialog, useCostiCommessa } from "@/components/orders/OrderCostiCommessa";
import { ContatoriFiltro } from "@/components/orders/ContatoriFiltro";
import { dataIt } from "@/components/orders/OrderDocumentiFornitore";
import { RiquadroCommessa, StatoPill, TabellaCommessa, type TonoStato } from "@/components/orders/TabellaCommessa";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SpesePianoMezzo } from "./SpesePianoMezzo";

const TONO: Record<StatoCostoMezzo, TonoStato> = { verifica: "rosso", oltre: "rosso", registrato: "verde", daRegistrare: "ambra", programmato: "blu", senzaPrevisto: "grigio" };

export function NoleggiCommessa({ orderId, puoModificare }: { orderId: string; puoModificare: boolean }) {
  const permessi = usePermissions();
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const vede = !!permessi.canViewCosts && (!!permessi.canViewMezzi || !!permessi.isAdmin);
  const { piani, prezzi } = usePianoMezziCantiere(orderId, vede, true);
  const { fonti, collega } = useMezziPianoEconomia(orderId, vede);
  const { data: mezzi = [] } = useMezzi();
  const { data: costi } = useCostiCommessa(orderId);
  const [filtro, setFiltro] = useState<string | null>(null);
  const [aperto, setAperto] = useState<PianoMezzo | null>(null);
  const [registra, setRegistra] = useState<PianoMezzo | null>(null);
  const oggi = oggiIso();

  const economia = useMemo(() => economiaPianiMezzi(
    (piani.data ?? []).filter((p) => !p.annullato),
    prezzi.data ?? {},
    fonti.data ?? { fonti: [], legami: [] },
  ), [piani.data, prezzi.data, fonti.data]);
  const stato = (r: typeof economia.righe[number]) => statoCostoMezzo(r, oggi);
  const conta = (chiave: StatoCostoMezzo) => economia.righe.filter((r) => stato(r).chiave === chiave).length;
  const visibili = filtro ? economia.righe.filter((r) => stato(r).chiave === filtro) : economia.righe;
  const nome = (p: PianoMezzo) => mezzi.find((m) => m.id === p.mezzo_id)?.nome ?? "Risorsa archiviata";

  if (!vede) return null;
  const inErrore = piani.isError || prezzi.isError || fonti.isError;
  return (
    <>
      <RiquadroCommessa
        icona={<Truck className="h-5 w-5 text-primary" aria-hidden="true" />}
        titolo="Mezzi del cantiere" conteggio={economia.righe.length}
        riassunto={economia.righe.length > 0 ? `previsti ${formatCurrency(economia.previsto)}, registrati ${formatCurrency(economia.registrato)}` : undefined}
        numeri={economia.righe.length > 0 ? (
          <ContatoriFiltro etichetta="Mezzi per stato del costo" attivo={filtro} onScegli={setFiltro} voci={[
            { chiave: "daRegistrare", etichetta: "Da registrare", valore: conta("daRegistrare"), avviso: true },
            { chiave: "oltre", etichetta: "Oltre il previsto", valore: conta("oltre"), avviso: true },
            { chiave: "registrato", etichetta: "Registrati", valore: conta("registrato") },
            { chiave: "programmato", etichetta: "Programmati", valore: conta("programmato") },
          ]} />
        ) : undefined}
      >
        {inErrore ? (
          <p role="alert" className="text-sm text-destructive">Non riesco a leggere i costi dei mezzi. <button type="button" className="underline" onClick={() => { void piani.refetch(); void prezzi.refetch(); void fonti.refetch(); }}>Riprova</button></p>
        ) : piani.isLoading || fonti.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : economia.righe.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun mezzo nel piano di questa commessa. I mezzi si assegnano in Cantiere → Lavorazioni.</p>
        ) : <>
          <TabellaCommessa etichetta="Mezzi del cantiere" righe={visibili} chiave={(r) => r.piano.id} colonne={[
            { titolo: "Mezzo", principale: true, cella: (r) => <span className="font-medium">{nome(r.piano)}</span> },
            { titolo: "Periodo", cella: (r) => <span className="whitespace-nowrap">{dataIt(r.piano.dal)} – {r.piano.al ? dataIt(r.piano.al) : "aperto"}</span> },
            { titolo: "Fornitore", cella: (r) => prezzi.data?.[r.piano.id]?.fornitore ?? "—" },
            { titolo: "Previsto", destra: true, cella: (r) => (r.previsto != null ? formatCurrency(r.previsto) : "—") },
            { titolo: "Registrato", destra: true, cella: (r) => <span className="font-medium">{formatCurrency(r.registrato)}</span> },
            { titolo: "Stato", cella: (r) => { const s = stato(r); return <StatoPill tono={TONO[s.chiave]}>{s.testo}</StatoPill>; } },
            { titolo: "Azioni", destra: true, cella: (r) => (
              <div className="flex flex-wrap justify-end gap-1">
                {puoModificare && r.registrato === 0 && (
                  <Button size="sm" variant="outline" onClick={() => setRegistra(r.piano)}><Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Registra costo</Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setAperto(r.piano)}>Collega</Button>
              </div>
            ) },
          ]} />
          <p className="mt-2 text-xs text-muted-foreground">Il previsto non entra nel margine: ci entra il costo registrato, o la fattura collegata.</p>
        </>}
      </RiquadroCommessa>

      {aperto && (
        <Dialog open onOpenChange={(o) => { if (!o) setAperto(null); }}>
          <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{nome(aperto)}</DialogTitle>
              <DialogDescription>Collega al mezzo una fattura, un costo o un ordine già registrati sulla commessa.</DialogDescription>
            </DialogHeader>
            <SpesePianoMezzo orderId={orderId} pianoId={aperto.id} supplierId={prezzi.data?.[aperto.id]?.supplier_id} />
          </DialogContent>
        </Dialog>
      )}

      {registra && effectiveCompany?.id && (
        <NuovoCostoDialog
          orderId={orderId}
          companyId={effectiveCompany.id}
          fasi={costi?.fasi ?? []}
          iniziale={{
            descrizione: `Noleggio ${nome(registra)}`, tipo: "noleggio", fornitoreId: prezzi.data?.[registra.id]?.supplier_id ?? null,
            aliquotaIva: "22", senzaFattura: false, pagato: false,
          }}
          onClose={() => setRegistra(null)}
          onSalvato={() => refreshFinancialQueries(queryClient)}
          onCreato={({ id, imponibile }) => collega.mutate(
            { pianoId: registra.id, tipo: "costo", fonteId: id, importo: imponibile },
            { onError: () => toast.warning("Costo salvato, ma non collegato al mezzo: collegalo da «Collega».") },
          )}
        />
      )}
    </>
  );
}
