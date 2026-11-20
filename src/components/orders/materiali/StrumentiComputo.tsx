import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { computoLetto, useComputiCommessa } from "@/hooks/useComputoCommessa";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AbacoComputo } from "./AbacoComputo";
import { PianoAcquistiCommessa } from "./PianoAcquistiCommessa";
import { PianoRisorseComputo, type AzioniNoleggiComputo } from "./PianoRisorseComputo";

const Documento = lazy(() => import("@/components/computo/commessa/OrderComputoTab"));
type Sezione = "acquisti" | "abaco" | "servizi" | "documento";
export function StrumentiComputo({ companyId, orderId, nomeFase, fase, voceIds = [], leggiQuery = false, iniziale = "acquisti", etichetta, onSelezionaArticoli, noleggi, soloSeDocumento = false }: {
  companyId: string; orderId: string; nomeFase: (id: string | null) => string;
  fase?: { id: string; nome: string }; voceIds?: string[]; leggiQuery?: boolean; iniziale?: Sezione; etichetta?: string;
  onSelezionaArticoli?: (ids: string[]) => void;
  noleggi?: AzioniNoleggiComputo;
  soloSeDocumento?: boolean;
}) {
  const query = new URLSearchParams(window.location.search);
  const [aperto, setAperto] = useState(() => leggiQuery && ["piano_acquisti", "abaco", "servizi"].some(k => query.get(k) === "1"));
  const [sezione, setSezione] = useState<Sezione>(() => leggiQuery
    ? query.get("piano_acquisti") === "1" ? "acquisti" : query.get("abaco") === "1" ? "abaco" : query.get("servizi") === "1" ? "servizi" : iniziale : iniziale);
  const [scelto, setScelto] = useState("");
  const permessi = usePermissions();
  const computi = useComputiCommessa(orderId, companyId);
  const letti = (computi.data ?? []).filter(computoLetto).filter(c => c.stato !== "archiviato");
  const computo = letti.find(c => c.id === scelto) ?? letti.find(c => c.stato === "contrattuale") ?? letti[0];
  const legami = useQuery({
    queryKey: ["strumenti-computo-voci", companyId, orderId, fase?.id],
    enabled: aperto && !!fase?.id && sezione === "abaco",
    queryFn: async () => {
      const { data, error } = await supabase.from("order_work_phase_voci").select("origine_id")
        .eq("company_id", companyId).eq("order_id", orderId).eq("phase_id", fase!.id);
      if (error) throw error;
      return (data ?? []).flatMap(v => v.origine_id ? [v.origine_id] : []);
    },
  });
  const idVoci = fase ? [...new Set([...voceIds, ...(legami.data ?? [])])] : undefined;
  if (soloSeDocumento && !computo) return null;
  return <>
    <Button type="button" size="sm" variant="outline" className={fase ? "tap-compact h-7 px-1.5 text-xs" : "tap-compact h-8 px-2.5 text-xs"}
      title={fase ? "Acquisti, abaco e servizi della fase" : "Acquisti, abaco, servizi e documento"}
      aria-label={fase ? "Acquisti, abaco e servizi di " + fase.nome : "Strumenti del computo"}
      onClick={() => setAperto(true)}><FileText className="h-3.5 w-3.5" aria-hidden /><span className={fase ? "ml-1 max-lg:sr-only" : "ml-1"}>{etichetta ?? "Computo"}</span></Button>
    <Dialog open={aperto} onOpenChange={setAperto}>
      <DialogContent className="flex max-h-[92dvh] max-w-6xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-5 pb-3 pt-4 text-left">
          <DialogTitle>{fase ? fase.nome : "Strumenti del computo"}</DialogTitle>
          <DialogDescription>{fase ? "Acquisti e risorse della fase, con le voci del documento collegate." : "Disponibilità, abaco e servizi della commessa, raccolti nello stesso punto."}</DialogDescription>
          {letti.length > 1 && <select aria-label="Computo degli strumenti" className="mt-2 h-8 max-w-md rounded border bg-background px-2 text-xs" value={computo?.id ?? ""} onChange={e => setScelto(e.target.value)}>
            {letti.map(c => <option key={c.id} value={c.id}>{c.titolo ?? c.file_name}</option>)}
          </select>}
        </DialogHeader>
        <Tabs value={sezione} onValueChange={v => setSezione(v as Sezione)} className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 overflow-x-auto border-b px-4 py-2"><TabsList className="w-max">
            <TabsTrigger value="acquisti">Da comprare</TabsTrigger><TabsTrigger value="abaco">Abaco serramenti</TabsTrigger>
            <TabsTrigger value="servizi">Noleggi e servizi</TabsTrigger><TabsTrigger value="documento">Documento e misure</TabsTrigger>
          </TabsList></div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <TabsContent value="acquisti" className="mt-0"><PianoAcquistiCommessa companyId={companyId} orderId={orderId} nomeFase={nomeFase} integrato faseId={fase?.id} puoVerificare={!!permessi.canEditOrders}
              puoDatare={!!(permessi.canEditOrders || permessi.canManagePurchasing)} onSelezionaArticoli={onSelezionaArticoli ? ids => { setAperto(false); onSelezionaArticoli(ids); } : undefined} /></TabsContent>
            <TabsContent value="abaco" className="mt-0">
              {!computo ? <p className="text-sm text-muted-foreground">Non c'è ancora un computo con le misure dei serramenti.</p>
                : fase && legami.isPending ? <p role="status">Collego le voci della fase…</p>
                : fase && legami.isError ? <p role="alert">Non riesco a collegare le voci alla fase. <button type="button" className="underline" onClick={() => void legami.refetch()}>Riprova</button></p>
                : <AbacoComputo companyId={companyId} orderId={orderId} computoId={computo.id} integrato voceIds={idVoci} />}
            </TabsContent>
            <TabsContent value="servizi" className="mt-0">{computo ? <PianoRisorseComputo companyId={companyId} orderId={orderId} computoId={computo.id} integrato faseId={fase?.id}
              noleggi={noleggi && { ...noleggi, apri: (id, proposta) => { setAperto(false); noleggi.apri(id, proposta); } }} />
              : <p className="text-sm text-muted-foreground">Carica un computo per preparare noleggi e servizi.</p>}</TabsContent>
            <TabsContent value="documento" className="mt-0"><Suspense fallback={<p role="status">Carico il documento…</p>}>
              <Documento key={computo?.id ?? "nessuno"} orderId={orderId} companyId={companyId} computoInizialeId={computo?.id} soloEsistenti canEdit={!!permessi.canEditOrders} canViewAmounts={!!permessi.canViewOrderAmounts} />
            </Suspense></TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  </>;
}
