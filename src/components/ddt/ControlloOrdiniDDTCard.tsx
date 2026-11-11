import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowLeftRight,
  AlertTriangle,
  CheckCircle2,
  Package,
  Plus,
  X,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OriginaliConfronto } from "@/components/fatturazione/OriginaliConfronto";
import { useOriginaliConfronto } from "@/hooks/useConfrontoFattura";
import { useControlloOrdiniDDT } from "@/hooks/useControlloOrdiniDDT";
import { useConsegneDDT } from "@/hooks/useConsegneDDT";
import { useDDTRighe, type DDTRicezione } from "@/hooks/useDDTRicezione";
import { usePermissions } from "@/hooks/usePermissions";
import { controllaOrdini, progressoOrdine } from "@/lib/ddt/controlloOrdini";
import { documentiDb as db } from "@/lib/ddt/documentiPersistenti";
import { loadCatalogPages } from "@/lib/listino/loadCatalogPages";
import { ProposteOrdiniDDT } from "./ProposteOrdiniDDT";
import { CLASSE_DIALOG_CONFRONTO, RiepilogoConfronto, PannelliConfrontoMobile } from "@/components/acquisti/RiepilogoConfronto";
import { OriginaliOrdineConfronto } from "@/components/acquisti/OriginaliOrdineConfronto";

const numero = (n: number | null) =>
  n == null
    ? "—"
    : Number(n).toLocaleString("it-IT", { maximumFractionDigits: 4 });
const etichette = {
  completa: "Completa",
  parziale: "Parziale",
  da_ricevere: "Da ricevere",
  eccedenza: "Eccedenza",
};

export function ControlloOrdiniDDTCard({ ddt }: { ddt: DDTRicezione }) {
  const [aperto, setAperto] = useState(false);
  const [pannelloMobile,setPannelloMobile]=useState("sinistra");
  const [ordineAttivo,setOrdineAttivo]=useState("tutti");
  const [vistaOrdine,setVistaOrdine]=useState("righe");
  const [filtroRighe,setFiltroRighe]=useState("tutte");
  const [cerca, setCerca] = useState("");
  const [collega, setCollega] = useState(false);
  const qc = useQueryClient();
  const permessi = usePermissions();
  const modificabile =
    !permessi.solaLettura &&
    (permessi.canManagePurchasing ||
      permessi.canEditOrders ||
      permessi.canEditWarehouse);
  const controllo = useControlloOrdiniDDT(ddt);
  const righe = useDDTRighe(ddt.id);
  const consegne = useConsegneDDT(ddt.company_id, ddt.id);
  const originali = useOriginaliConfronto(
    ddt.company_id,
    aperto
      ? {
          id: ddt.id,
          tipo: "ddt",
          numero: ddt.numero_ddt,
          data: ddt.data_ricezione,
          fornitore: "",
          collegato: true,
          righe: [],
          bolle: [],
          dati: ddt as unknown as Record<string, unknown>,
          avviso: null,
        }
      : undefined,
  );
  const candidati = useQuery<
    Array<{ id: string; oda_number: string; status: string }>
  >({
    queryKey: ["ddt-ordini-da-collegare", ddt.company_id, ddt.supplier_id],
    enabled: collega && !!ddt.supplier_id,
    queryFn: () =>
      loadCatalogPages((a, b) =>
        db
          .from("purchase_orders")
          .select("id,oda_number,status")
          .eq("company_id", ddt.company_id)
          .eq("supplier_id", ddt.supplier_id)
          .in("status", ["inviato", "confermato", "parziale", "ricevuto"])
          .order("oda_number", { ascending: false })
          .order("id")
          .range(a, b),
      ),
  });
  const salva = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await db
        .from("ddt_ordini_acquisto")
        .insert({
          company_id: ddt.company_id,
          ddt_id: ddt.id,
          purchase_order_id: id,
        })
        .select("ddt_id")
        .single();
      if (error && error.code !== "23505") throw error;
      if (!error && !data)
        throw new Error("Il collegamento non è stato salvato.");
    },
    onSuccess: () => {
      setCollega(false);
      setCerca("");
      toast.success("Ordine collegato. Le quantità si confermano all’arrivo.");
      for (const key of [
        ["ddt-controllo-ordini"],
        ["ddt-righe-ordine"],
        ["ddt-ricezione"],
        ["fattura-confronto"],
      ])
        void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) =>
      toast.error("Collegamento non salvato", { description: e.message }),
  });
  const rimuovi = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await db
        .from("ddt_ordini_acquisto")
        .delete()
        .eq("company_id", ddt.company_id)
        .eq("ddt_id", ddt.id)
        .eq("purchase_order_id", id)
        .select("ddt_id")
        .maybeSingle();
      if (error) throw error;
      if (!data)
        throw new Error(
          "Il riferimento non è stato rimosso. Aggiorna e riprova.",
        );
    },
    onSuccess: () => {
      for (const key of [
        ["ddt-controllo-ordini"],
        ["ddt-righe-ordine"],
        ["ddt-ricezione"],
        ["fattura-confronto"],
      ])
        void qc.invalidateQueries({ queryKey: key });
      toast.success(
        "Riferimento aggiunto rimosso. Gli arrivi confermati restano conservati.",
      );
    },
    onError: (e: Error) =>
      toast.error("Rimozione non salvata", { description: e.message }),
  });
  const risultati = controllaOrdini(
    controllo.data?.righe ?? [],
    righe.data ?? [],
    consegne.data ?? [],
  );
  const progresso = progressoOrdine(risultati);
  const errore = controllo.isError || righe.isError || consegne.isError;
  const caricamento =
    controllo.isLoading || righe.isLoading || consegne.isLoading;
  const ordineSelezionato=controllo.data?.ordini.find(o=>o.id===ordineAttivo)??controllo.data?.ordini[0];
  const riepilogo = <RiepilogoConfronto indicatori={[
    {label:"Articoli completi",valore:progresso.complete,tono:"verde",attivo:filtroRighe==="complete",onClick:()=>setFiltroRighe(filtroRighe==="complete"?"tutte":"complete")},
    {label:"Da completare",valore:progresso.daCompletare,tono:"ambra",attivo:filtroRighe==="aperte",onClick:()=>setFiltroRighe(filtroRighe==="aperte"?"tutte":"aperte")},
    {label:"DDT collegati",valore:controllo.data?.bolle.length??0,onClick:()=>setFiltroRighe("tutte")},
  ]}/>;
  const tabella = (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[520px] table-fixed text-[13px]">
        <caption className="sr-only">
          Quantità ordinate, ricevute su tutti i DDT e ancora da ricevere
        </caption>
        <colgroup>
          {[34, 10, 12, 14, 10, 20].map((width, i) => (
            <col key={i} style={{ width: `${width}%` }} />
          ))}
        </colgroup>
        <thead className="h-10 bg-slate-50 text-[11px] text-slate-600">
          <tr>
            {[
              "Ordine / articolo",
              "Ordinati",
              "Ricevuti totali",
              "In questo DDT",
              "Mancano",
              "Stato",
            ].map((t, i) => (
              <th
                key={t}
                className={`px-2 py-2 font-medium ${i ? "text-right" : "text-left"}`}
              >
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {risultati.filter(r=>(ordineAttivo==="tutti"||r.purchase_order_id===ordineAttivo)&&(filtroRighe==="tutte"||filtroRighe==="complete"&&r.stato==="completa"||filtroRighe==="aperte"&&r.stato!=="completa")).map((r) => (
            <tr key={r.id} className="h-14 border-t hover:bg-slate-50/60">
              <td className="max-w-72 px-2 py-2">
                <Link
                  to={`/azienda/ordini-acquisto/${r.purchase_order_id}`}
                  className="block text-xs text-blue-700 hover:underline"
                >
                  {r.oda_number}
                </Link>
                <span
                  className="block truncate font-medium"
                  title={r.description ?? undefined}
                >
                  {r.description || "Articolo"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {r.unit_of_measure || "Unità da verificare"}
                </span>
              </td>
              <td className="px-2 text-right tabular-nums">
                {numero(Number(r.quantity))}
              </td>
              <td className="px-2 text-right tabular-nums">
                {numero(Number(r.quantity_received ?? 0))}
              </td>
              <td
                className="px-2 text-right tabular-nums"
                title={`Accettati da questo DDT: ${numero(r.accettataQui)}`}
              >
                {numero(r.inBolla)}
                <span className="block text-xs text-muted-foreground">
                  {numero(r.accettataQui)} accettati
                </span>
              </td>
              <td
                className={`px-2 text-right font-semibold tabular-nums ${r.daRicevere ? "text-amber-800" : "text-emerald-700"}`}
              >
                {numero(r.daRicevere)}
              </td>
              <td className="px-2 text-right">
                <span
                  className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${r.stato === "completa" ? "bg-emerald-50 text-emerald-800" : r.stato === "eccedenza" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}
                >
                  {etichette[r.stato]}
                  {r.eccedenza ? ` +${numero(r.eccedenza)}` : ""}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ArrowLeftRight className="h-4 w-4 text-orange-600" />
            Controllo ordini e consegne
          </CardTitle>
          <div className="flex gap-2">
            {modificabile && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCollega((v) => !v)}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Collega ordine
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={caricamento || errore}
              onClick={() => setAperto(true)}
            >
              Apri confronto
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Un ordine può arrivare con più DDT; una bolla può consegnare più
          ordini. Contano solo le quantità confermate all’arrivo.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!!controllo.data?.ordini.length && (
          <div
            className="flex flex-wrap gap-2"
            aria-label="Ordini collegati al DDT"
          >
            {controllo.data.ordini.map((o) => (
              <span
                key={o.id}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
              >
                <Link
                  className="text-blue-700 hover:underline"
                  to={`/azienda/ordini-acquisto/${o.id}`}
                >
                  {o.oda_number}
                </Link>
                {modificabile && controllo.data.manuali?.includes(o.id) && (
                  <button
                    type="button"
                    aria-label={`Rimuovi il riferimento aggiunto ${o.oda_number}`}
                    disabled={rimuovi.isPending}
                    onClick={() => rimuovi.mutate(o.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        {collega && (
          <div className="space-y-2 rounded-xl border bg-slate-50 p-3">
            <Input
              aria-label="Cerca ordine da collegare"
              placeholder="Cerca il numero dell’ordine…"
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
            />
            {!ddt.supplier_id ? (
              <p className="text-sm">Scegli prima il fornitore della bolla.</p>
            ) : candidati.isError ? (
              <p role="alert" className="text-sm text-destructive">
                Ordini non disponibili.{" "}
                <button
                  className="underline"
                  onClick={() => void candidati.refetch()}
                >
                  Riprova
                </button>
              </p>
            ) : candidati.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ul className="max-h-48 overflow-y-auto">
                {(candidati.data ?? [])
                  .filter(
                    (o) =>
                      !controllo.data?.ordini.some((c) => c.id === o.id) &&
                      o.oda_number.toLowerCase().includes(cerca.toLowerCase()),
                  )
                  .map((o) => (
                    <li key={o.id}>
                      <Button
                        className="w-full justify-between"
                        variant="ghost"
                        disabled={salva.isPending}
                        onClick={() => salva.mutate(o.id)}
                      >
                        {o.oda_number}
                        <Plus className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              Il collegamento conserva il riferimento e non registra merce né
              costi.
            </p>
          </div>
        )}
        {caricamento ? (
          <p className="text-sm text-muted-foreground">
            Controllo delle consegne…
          </p>
        ) : errore ? (
          <p role="alert" className="text-sm text-destructive">
            Confronto non disponibile.{" "}
            <button
              className="underline"
              onClick={() => {
                void controllo.refetch();
                void righe.refetch();
                void consegne.refetch();
              }}
            >
              Riprova
            </button>
          </p>
        ) : !risultati.length ? (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-muted-foreground">
            Nessun ordine collegato. Puoi collegarlo oppure registrare questa
            consegna senza OdA.
          </p>
        ) : (
          <>
            {riepilogo}
            {tabella}
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              {progresso.daCompletare ? (
                <Package className="h-4 w-4 shrink-0 text-amber-700" />
              ) : (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
              )}
              {progresso.daCompletare
                ? "Le quantità mancanti restano aperte per le prossime consegne, anche se questa bolla è già verificata."
                : "Quantità degli ordini completate. La verifica del documento e le eventuali non conformità restano separate."}
            </p>
          </>
        )}
      </CardContent>
      <Dialog open={aperto} onOpenChange={setAperto}>
        <DialogContent className={CLASSE_DIALOG_CONFRONTO}>
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>Confronto DDT e ordini</DialogTitle>
            <DialogDescription>
              {ddt.numero_ddt} · Controlla le righe e il residuo di ogni ordine.
            </DialogDescription>
          </DialogHeader>
          {modificabile&&<div className="shrink-0 border-b px-5 py-2"><ProposteOrdiniDDT compatto ddtId={ddt.id} righe={righe.data??[]} ordini={controllo.data?.righe??[]}/></div>}
          <div className="shrink-0 border-b px-5 py-2">{riepilogo}</div>
          <PannelliConfrontoMobile valore={pannelloMobile} onChange={setPannelloMobile} sinistra="DDT" destra="Ordini e conferme"/>
          <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-2">
            <section className={`${pannelloMobile==="sinistra"?"block":"hidden lg:block"} min-w-0 space-y-3 border-r p-4`}>
              <h3 className="font-semibold">DDT {ddt.numero_ddt}</h3>
              <Tabs defaultValue="righe">
                <TabsList>
                  <TabsTrigger value="righe">Righe della bolla</TabsTrigger>
                  <TabsTrigger value="originale">
                    PDF / foto originali
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="righe">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="h-10 bg-slate-50 text-xs">
                        <tr>
                          <th className="p-3 text-left">Articolo</th>
                          <th className="p-3 text-right">Quantità</th>
                          <th className="p-3 text-right">UM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(righe.data ?? []).map((r) => (
                          <tr key={r.id} className="h-20 border-b">
                            <td className="p-3">{r.descrizione}</td>
                            <td className="p-3 text-right tabular-nums">
                              {numero(r.quantita)}
                            </td>
                            <td className="p-3 text-right">
                              {r.unita_misura || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>
                <TabsContent value="originale">
                  {originali.isLoading ? (
                    <p>Caricamento originali…</p>
                  ) : originali.isError ? (
                    <p role="alert">
                      Originali non disponibili.{" "}
                      <button onClick={() => void originali.refetch()}>
                        Riprova
                      </button>
                    </p>
                  ) : (
                    <OriginaliConfronto
                      companyId={ddt.company_id}
                      files={originali.data ?? []}
                    />
                  )}
                </TabsContent>
              </Tabs>
            </section>
            <section className={`${pannelloMobile==="destra"?"block":"hidden lg:block"} min-w-0 space-y-3 p-4`}>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Ordini di confronto</h3>
                <select aria-label="Ordine da confrontare" className="h-8 w-full rounded-md border px-2 text-xs" value={ordineAttivo} onChange={e=>setOrdineAttivo(e.target.value)}>
                  <option value="tutti">Tutti gli ordini collegati</option>{controllo.data?.ordini.map(o=><option key={o.id} value={o.id}>{o.oda_number}</option>)}
                </select>
                <Tabs value={vistaOrdine} onValueChange={v=>{setVistaOrdine(v);if(v!=="righe"&&ordineAttivo==="tutti"&&ordineSelezionato)setOrdineAttivo(ordineSelezionato.id);}}>
                  <TabsList className="h-8"><TabsTrigger value="righe" className="text-xs">Righe e residui</TabsTrigger><TabsTrigger value="inviato" className="text-xs">PDF nostro</TabsTrigger><TabsTrigger value="fornitore" className="text-xs">Conferma fornitore</TabsTrigger></TabsList>
                </Tabs>
              </div>
              {vistaOrdine==="righe"?<><p className="text-[11px] text-slate-500">Ricevuti su tutti i DDT, al netto dei resi. Le quantità non confermate restano aperte.</p>{tabella}</>:ordineSelezionato?<OriginaliOrdineConfronto companyId={ddt.company_id} ordineId={ordineSelezionato.id} numero={ordineSelezionato.oda_number} attachmentUrl={ordineSelezionato.attachment_url} tipo={vistaOrdine==="inviato"?"inviato":"fornitore"}/>:<p className="text-xs">Collega prima un ordine.</p>}
              <details className="rounded-lg border p-3 text-sm">
                <summary className="cursor-pointer font-medium">
                  Tutti i DDT di questi ordini (
                  {controllo.data?.bolle.length ?? 0})
                </summary>
                <ul className="mt-3 space-y-2">
                  {controllo.data?.bolle.map((b) => (
                    <li key={b.id}>
                      <Link
                        className="text-blue-700 hover:underline"
                        to={`/azienda/ddt/${b.id}`}
                      >
                        {b.numero_ddt}
                      </Link>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {b.data_ricezione?.split("-").reverse().join("/")}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
              <p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Se mancano articoli, sono danneggiati o non corrispondono,
                conferma solo la quantità accettata e segnala il problema nella
                verifica DDT. Un reso riapre il residuo dell’ordine.
              </p>
            </section>
          </div>
          <div className="flex justify-end gap-2 border-t px-5 py-3">
            <Button variant="outline" onClick={() => setAperto(false)}>
              Chiudi
            </Button>
            {modificabile && (
              <Button asChild onClick={() => setAperto(false)}>
                <a href="#consegne-ddt">Conferma le quantità arrivate</a>
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
