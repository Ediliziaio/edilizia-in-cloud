import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeftRight,
  CheckCircle2,
  ClipboardList,
  FileText,
  RefreshCw,
  Truck,
  Sparkles,
  Loader2,
  Info,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfrontoDocumentiLayout, PannelloDocumento, ComandiDocumento } from "@/components/shared/ConfrontoDocumentiLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import {
  confrontaRigheDocumenti,
  numeroDocumento,
  righeFatturaConfronto,
  stessaVoce,
  documentoCompatibileConFornitore,
  type RigaConfronto,
} from "@/lib/fatturazione/confrontoDocumenti";
import { originaleDaRiferimento } from "@/lib/fatturazione/originaliConfronto";
import { messaggioSalvataggio } from "@/lib/fatturazione/salvataggioFattura";
import { fatturaVerificata } from "@/lib/fatturazione/ripartizioneFattura";
import {
  useConfrontoFattura,
  useOriginaliConfronto,
} from "@/hooks/useConfrontoFattura";
import { OriginaliConfronto } from "./OriginaliConfronto";
import { OriginaliOrdineConfronto } from "@/components/acquisti/OriginaliOrdineConfronto";
import { RiepilogoConfronto, CLASSE_DIALOG_CONFRONTO, PannelliConfrontoMobile } from "@/components/acquisti/RiepilogoConfronto";
import { VerificaFatturaPill } from "./VerificaFatturaPill";
import {
  useRiconciliazioneFatturaAI,
  useUltimaSelezioneConfrontoAI,
} from "@/hooks/useRiconciliazioneFatturaAI";
import { SimulazioniRiconciliazioneAI } from "./SimulazioniRiconciliazioneAI";
import { RevisioneRiconciliazioneAI } from "./RevisioneRiconciliazioneAI";
import {
  scelteAbbinamenti,
  datiRiconciliazione,
  esitiRiconciliazione,
} from "../../../supabase/functions/_shared/riconciliazioneFattureAI.ts";
import { CollegaDdtFattura } from "./CollegaDdtFattura";
import { salvaCollegamentoDdt } from "@/lib/fatturazione/collegaDdt";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const quantita = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("it-IT", { maximumFractionDigits: 4 });
const euro = (n: number | null) =>
  n == null ? "Da definire" : formatCurrency(n);
const titoli = {
  coerente: "Coerente",
  scostamento: "Scostamento",
  da_controllare: "Da controllare",
  senza_riferimento: "Da abbinare",
};
const colori = {
  coerente: "border-emerald-200 bg-emerald-50 text-emerald-800",
  scostamento: "border-red-200 bg-red-50 text-red-800",
  da_controllare: "border-amber-200 bg-amber-50 text-amber-900",
  senza_riferimento: "border-slate-200 bg-slate-50 text-slate-600",
};

function TabellaDocumenti({
  righe,
  evidenziate,
  riferimenti,
  onSeleziona,
  allinea,
}: {
  righe: RigaConfronto[];
  evidenziate: Set<string>;
  riferimenti: Map<string, number[]>;
  onSeleziona: (indice: number) => void;
  allinea: boolean;
}) {
  const visualizzate = useMemo(
    () =>
      !allinea
        ? righe
        : righe
            .map((r, i) => ({
              r,
              i,
              priorita: Math.min(...(riferimenti.get(r.id) ?? [])),
            }))
            .sort((a, b) => a.priorita - b.priorita || a.i - b.i)
            .map((x) => x.r),
    [righe, riferimenti, allinea],
  );
  if (!righe.length)
    return (
      <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
        Nessuna riga strutturata disponibile. Controlla il file originale.
      </p>
    );
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-xs">
        <thead className="h-12 bg-muted/50 text-muted-foreground">
          <tr>
            <th
              className="p-2 text-left"
              title="Voci della fattura abbinate per codice, descrizione o proposta AI da confermare"
            >
              Voce fattura
            </th>
            <th className="p-2 text-left">Articolo</th>
            <th className="p-2 text-right">Quantità</th>
            <th className="p-2 text-left">UM</th>
            <th className="p-2 text-right">Prezzo netto</th>
            <th className="p-2 text-right">Importo</th>
          </tr>
        </thead>
        <tbody>
          {visualizzate.map((r) => (
            <tr
              key={r.id}
              className={`h-20 border-t align-top ${evidenziate.has(r.id) ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}
            >
              <td className="p-2">
                <div className="flex gap-1">
                  {riferimenti.get(r.id)?.length ? (
                    riferimenti.get(r.id)!.map((i) => (
                      <button
                        key={i}
                        type="button"
                        aria-label={`Metti a confronto la voce F${i + 1}`}
                        title={`Voce F${i + 1} della fattura: confronta quantità e prezzi`}
                        onClick={() => onSeleziona(i)}
                        className="rounded border border-blue-200 bg-blue-50 px-1.5 py-1 font-semibold text-blue-800 hover:bg-blue-100"
                      >
                        F{i + 1}
                      </button>
                    ))
                  ) : (
                    <span
                      className="text-muted-foreground"
                      title="Nessun abbinamento attivo per questa voce"
                    >
                      —
                    </span>
                  )}
                </div>
              </td>
              <td className="min-w-44 p-2">
                <p className="line-clamp-2 font-medium" title={r.descrizione}>
                  {r.descrizione || "Senza descrizione"}
                </p>
                {r.codice && (
                  <p className="mt-0.5 text-muted-foreground">{r.codice}</p>
                )}
              </td>
              <td className="p-2 text-right tabular-nums">
                {quantita(r.quantita)}
              </td>
              <td className="p-2">{r.um || "—"}</td>
              <td className="whitespace-nowrap p-2 text-right tabular-nums">
                {euro(r.prezzo)}
              </td>
              <td className="whitespace-nowrap p-2 text-right tabular-nums">
                {r.importo == null ? "—" : euro(r.importo)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Dati reali, originali conservati e controllo deterministico: nessun esito inventato dall’AI. */
export function ConfrontoFatturaDialog({
  fattura,
  companyId,
  ordineIds,
  puoModificare,
  onClose,
  onVersioneCompleta,
}: {
  fattura: Record<string, unknown>;
  companyId: string;
  ordineIds: string[];
  puoModificare: boolean;
  onClose: () => void;
  onVersioneCompleta?: () => void;
}) {
  const [parametri] = useSearchParams();
  const id = String(fattura.id),
    q = useConfrontoFattura(companyId, id, ordineIds);
  const ultimaSelezioneAI = useUltimaSelezioneConfrontoAI(companyId, id);
  const fornitoreId = fattura.fornitore_id
    ? String(fattura.fornitore_id)
    : null;
  const documenti = useMemo(() => q.data?.documenti ?? [], [q.data?.documenti]);
  const [attivo, setAttivo] = useState("");
  const [pannelloMobile,setPannelloMobile]=useState("sinistra");
  const [filtroRighe,setFiltroRighe]=useState("tutte");
  const [selezione, setSelezione] = useState<Set<string> | null>(null);
  const [controllo, setControllo] = useState(false);
  const [revisioneAperta, setRevisioneAperta] = useState(false);
  const [rigaAttiva, setRigaAttiva] = useState<number | null>(null);
  const [aggiungi, setAggiungi] = useState(false);
  const [vistaDocumento, setVistaDocumento] = useState("righe");
  const [vistaFattura, setVistaFattura] = useState("righe");
  const [allineaVoci, setAllineaVoci] = useState(true);
  const righeFatturaRef = useRef(new Map<number, HTMLTableRowElement>());
  const [selezionatoreAperto, setSelezionatoreAperto] = useState(false);
  const qc = useQueryClient();
  const collegaBolla = useMutation({
    mutationFn: (ddtId: string) =>
      salvaCollegamentoDdt({
        companyId,
        fatturaId: id,
        ddtId,
        numero: "",
        data: null,
      }),
    onSuccess: async (_r, ddtId) => {
      setControllo(false);
      setSelezione((s) => (s ? new Set([...s, ddtId]) : s));
      await Promise.all(
        [
          "fattura-collegamenti",
          "fattura-confronto",
          "fatture-ricevute",
          "fattura-ricevuta-riepilogo",
        ].map((k) => qc.invalidateQueries({ queryKey: [k] })),
      );
      toast.success("Bolla collegata alla fattura");
    },
    onError: (e) =>
      toast.error("Bolla non collegata", {
        description: messaggioSalvataggio(e),
      }),
  });
  const scelti = useMemo(
    () =>
      selezione ??
      (ultimaSelezioneAI.data &&
      [...ultimaSelezioneAI.data.ddt, ...ultimaSelezioneAI.data.oda].every(
        (id) =>
          documenti.some(
            (d) =>
              d.id === id &&
              documentoCompatibileConFornitore(fornitoreId, d.dati.supplier_id),
          ),
      )
        ? new Set([
            ...ultimaSelezioneAI.data.ddt,
            ...ultimaSelezioneAI.data.oda,
          ])
        : null) ??
      new Set(
        documenti
          .filter(
            (d) =>
              d.collegato &&
              documentoCompatibileConFornitore(fornitoreId, d.dati.supplier_id),
          )
          .map((d) => d.id),
      ),
    [selezione, documenti, fornitoreId, ultimaSelezioneAI.data],
  );
  const doc = documenti.find((d) => d.id === attivo) ?? documenti[0];
  const originali = useOriginaliConfronto(companyId, doc);
  const righe = useMemo(
    () => righeFatturaConfronto(fattura.righe),
    [fattura.righe],
  );
  const selezioneAI = useMemo(
    () => ({
      ddt: documenti
        .filter((d) => d.tipo === "ddt" && scelti.has(d.id))
        .map((d) => d.id)
        .sort(),
      oda: documenti
        .filter((d) => d.tipo === "oda" && scelti.has(d.id))
        .map((d) => d.id)
        .sort(),
    }),
    [documenti, scelti],
  );
  const ai = useRiconciliazioneFatturaAI({
    companyId,
    fatturaId: id,
    documenti: selezioneAI,
    revisioneDati: `${q.dataUpdatedAt}:${JSON.stringify(righe)}`,
  });
  const analisiAI = ai.dati.data?.analisi;
  const datiAllineatiAI =
    ai.dati.data &&
    JSON.stringify(datiRiconciliazione(ai.dati.data.contesto).fattura) ===
      JSON.stringify(righe);
  const abbinamentiAI = useMemo(
    () =>
      analisiAI && datiAllineatiAI
        ? scelteAbbinamenti(analisiAI.proposta, analisiAI.decisioni)
        : undefined,
    [analisiAI, datiAllineatiAI],
  );
  const voceAssociata = (f: RigaConfronto, r: RigaConfronto) => {
    const proposta =
      datiAllineatiAI &&
      analisiAI?.proposta.righe.find((p) => p.fattura === f.id);
    if (proposta)
      return (
        analisiAI?.decisioni[f.id] !== "rifiutata" &&
        [...proposta.ddt, ...proposta.oda].includes(r.id)
      );
    return stessaVoce(f, r);
  };
  const esiti = useMemo(() => {
    if (ai.dati.data && datiAllineatiAI) {
      const c = ai.dati.data.contesto,
        d = datiRiconciliazione(c);
      const p = analisiAI
        ? {
            ...analisiAI.proposta,
            righe: analisiAI.proposta.righe.map((r) => ({
              ...r,
              ...(abbinamentiAI?.get(r.fattura) ?? { ddt: [], oda: [] }),
            })),
          }
        : {
            righe: d.fattura.map((f) => ({
              fattura: f.id,
              ddt: d.bolle.filter((r) => stessaVoce(f, r)).map((r) => r.id),
              oda: d.ordini.filter((r) => stessaVoce(f, r)).map((r) => r.id),
              affidabilita: "alta" as const,
              motivo: "Codice o descrizione uguale",
            })),
            avvisi: [],
          };
      return esitiRiconciliazione(c, p);
    }
    return confrontaRigheDocumenti(
      righe,
      documenti
        .filter(
          (d) =>
            d.tipo === "ddt" &&
            scelti.has(d.id) &&
            documentoCompatibileConFornitore(fornitoreId, d.dati.supplier_id),
        )
        .flatMap((d) => d.bolle),
      documenti
        .filter(
          (d) =>
            d.tipo === "oda" &&
            scelti.has(d.id) &&
            documentoCompatibileConFornitore(fornitoreId, d.dati.supplier_id),
        )
        .flatMap((d) => d.righe),
      abbinamentiAI,
    );
  }, [
    righe,
    documenti,
    scelti,
    fornitoreId,
    abbinamentiAI,
    ai.dati.data,
    datiAllineatiAI,
    analisiAI,
  ]);
  const riferimenti = new Map(
    (doc?.righe ?? []).map((r) => [
      r.id,
      righe.flatMap((f, i) => (voceAssociata(f, r) ? [i] : [])),
    ]),
  );
  const evidenziate = new Set(
    (doc?.righe ?? [])
      .filter(
        (r) =>
          rigaAttiva != null && riferimenti.get(r.id)?.includes(rigaAttiva),
      )
      .map((r) => r.id),
  );
  const fileFattura = originaleDaRiferimento(
    fattura.pdf_storage_path || fattura.pdf_url,
    String(fattura.pdf_storage_bucket || "fatture-ricevute"),
  );
  const selezionaRiga = (indice: number) => {
    if (!righe[indice]) return;
    setFiltroRighe("tutte");
    setPannelloMobile("sinistra");
    setRigaAttiva(indice);
    setVistaFattura("righe");
    if (!doc?.righe.some((r) => voceAssociata(righe[indice], r))) {
      const corrispondente = documenti.find((d) =>
        d.righe.some((r) => voceAssociata(righe[indice], r)),
      );
      if (corrispondente) setAttivo(corrispondente.id);
    }
  };
  useEffect(() => {
    if (rigaAttiva != null && vistaFattura === "righe")
      righeFatturaRef.current
        .get(rigaAttiva)
        ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [rigaAttiva, vistaFattura]);
  const scegli = (idDoc: string, valore: boolean) => {
    setSelezione((s) => {
      const n = new Set(s ?? scelti);
      if (valore) n.add(idDoc);
      else n.delete(idDoc);
      return n;
    });
    setControllo(false);
    setRigaAttiva(null);
  };
  const fornitoreDiverso = !documentoCompatibileConFornitore(
    fornitoreId,
    doc?.dati.supplier_id,
  );
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent
        className={CLASSE_DIALOG_CONFRONTO}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12 sm:px-5">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <ArrowLeftRight className="h-5 w-5 text-orange-600" />
            Confronto fattura, DDT e ordini
          </DialogTitle>
          <DialogDescription className="text-xs">
            {String(fattura.cedente_ragione_sociale ?? "Fornitore")} · Fattura{" "}
            {String(fattura.numero_fattura ?? "")} del{" "}
            {formatDateShort(String(fattura.data_fattura ?? ""))}
          </DialogDescription>
        </DialogHeader>
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-muted/20 px-4 py-2 sm:px-5">
          <span className="mr-auto text-xs text-muted-foreground">
            Seleziona i documenti da confrontare e apri le rispettive righe o
            gli originali.
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={q.isFetching || collegaBolla.isPending}
            onClick={() => {
              setControllo(false);
              void q.refetch();
              void originali.refetch();
              void qc.invalidateQueries({queryKey:["pdf-richiesta-ordine"]});
            }}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Aggiorna
          </Button>
          <Button
            size="sm"
            disabled={
              q.isError || q.isFetching || !righe.length || !scelti.size
            }
            onClick={() => setControllo(true)}
          >
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
            Controlla quantità e prezzi
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-indigo-200 text-indigo-800 hover:bg-indigo-50"
            disabled={
              !puoModificare ||
              q.isFetching ||
              q.isError ||
              !scelti.size ||
              !righe.length ||
              ai.dati.isFetching ||
              ultimaSelezioneAI.isFetching ||
              ai.dati.isError ||
              ai.dati.data?.puo_modificare === false ||
              ai.analizza.isPending
            }
            title="Propone corrispondenze tra articoli con descrizioni diverse. Usa i crediti AI dell’azienda; la conferma resta tua."
            onClick={() => {
              setRevisioneAperta(true);
              if (!analisiAI) ai.analizza.mutate();
            }}
          >
            {ai.analizza.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-4 w-4" />
            )}
            {ai.analizza.isPending
              ? "Analisi AI…"
              : analisiAI
                ? "Riapri analisi AI"
                : ai.dati.data?.lotto?.indice
                  ? `Riprendi AI (${ai.dati.data.lotto.indice}/${ai.dati.data.lotto.totale})`
                  : "Analizza con AI"}
          </Button>
        </div>
        <div className="shrink-0 border-b px-4 py-2 sm:px-5"><RiepilogoConfronto indicatori={[
          {label:"Voci coerenti",valore:esiti.filter(e=>e.stato==="coerente").length,tono:"verde",attivo:filtroRighe==="coerenti",onClick:()=>setFiltroRighe(filtroRighe==="coerenti"?"tutte":"coerenti")},
          {label:"Da verificare",valore:esiti.filter(e=>e.stato!=="coerente").length,tono:"ambra",attivo:filtroRighe==="differenze",onClick:()=>setFiltroRighe(filtroRighe==="differenze"?"tutte":"differenze")},
          {label:"Documenti selezionati",valore:scelti.size,onClick:()=>setFiltroRighe("tutte")},
        ]}/></div>
        {import.meta.env.DEV && parametri.has("qa_riconciliazione") && (
          <SimulazioniRiconciliazioneAI
            fatturaId={id}
            documenti={selezioneAI}
            disabled={
              !puoModificare ||
              !scelti.size ||
              ai.dati.isFetching ||
              ultimaSelezioneAI.isFetching ||
              ai.dati.isError ||
              ai.dati.data?.puo_modificare === false ||
              ai.analizza.isPending
            }
          />
        )}
        {ai.analizza.isPending && ai.avanzamento && (
          <div
            role="status"
            className="flex items-center gap-3 border-b px-5 py-2 text-xs"
          >
            <span>
              Analisi: {ai.avanzamento.completati}/{ai.avanzamento.totale} lotti
              completati
            </span>
            <progress
              className="h-2 flex-1"
              value={ai.avanzamento.completati}
              max={ai.avanzamento.totale}
            />
            <Button variant="ghost" size="sm" onClick={ai.interrompi}>
              Interrompi
            </Button>
          </div>
        )}
        <RevisioneRiconciliazioneAI
          ai={ai}
          aperta={revisioneAperta}
          onApertura={setRevisioneAperta}
          righe={righe}
          documenti={documenti}
          puoModificare={
            puoModificare &&
            !!datiAllineatiAI &&
            !ai.dati.isFetching &&
            ai.dati.data?.puo_modificare !== false
          }
          onRiga={selezionaRiga}
        />
        {q.isError ? (
          <div
            role="alert"
            className="m-6 rounded-xl border border-destructive/30 p-5 text-sm text-destructive"
          >
            Documenti non disponibili: {messaggioSalvataggio(q.error)}{" "}
            <button className="underline" onClick={() => void q.refetch()}>
              Riprova
            </button>
          </div>
        ) : (
          <div className="contents"><PannelliConfrontoMobile valore={pannelloMobile} onChange={setPannelloMobile} sinistra="Fattura" destra="DDT e ordini"/>
          <ConfrontoDocumentiLayout>
            <Tabs value={vistaFattura} onValueChange={setVistaFattura} className="contents"><PannelloDocumento nome="Fattura ricevuta" lato="sinistra" attivo={pannelloMobile==="sinistra"} testata={<div className="space-y-2 border-b bg-background px-4 py-3 sm:px-5">
                <div className="flex min-h-8 items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <FileText className="h-4 w-4 text-blue-600" />
                    Fattura ricevuta
                  </h2>
                  <Badge variant="secondary">
                    {fattura.xml_url || fattura.xml_bytes
                      ? "XML"
                      : fileFattura
                        ? "PDF / foto"
                        : "Dati documento"}
                  </Badge>
                </div>
                <div className="flex h-10 items-center justify-between gap-3 rounded-md border px-3 text-sm">
                  <span
                    className="truncate font-medium"
                    title={String(fattura.numero_fattura ?? "")}
                  >
                    {String(fattura.numero_fattura ?? "Fattura")}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDateShort(String(fattura.data_fattura ?? ""))}
                  </span>
                </div>
                <div className="flex min-h-7 items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span
                    className="truncate"
                    title={String(fattura.cedente_ragione_sociale ?? "")}
                  >
                    {String(fattura.cedente_ragione_sociale ?? "Fornitore")}
                  </span>
                  <span className="shrink-0">{righe.length} voci</span>
                </div>
              </div>} viste={<div className="flex flex-wrap items-center gap-2 px-4 py-2 sm:px-5">
                  <TabsList className="h-8">
                    <TabsTrigger value="righe">Righe e importi</TabsTrigger>
                    <TabsTrigger value="originale">File originale</TabsTrigger>
                  </TabsList>
                  {rigaAttiva != null && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto h-8 text-xs"
                      onClick={() => setRigaAttiva(null)}
                    >
                      F{rigaAttiva + 1} selezionata · mostra tutte
                    </Button>
                  )}
                </div>}>
<TabsContent
                  value="originale"
                  className="m-0 flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-5"
                >
                  {fileFattura ? (
                    <OriginaliConfronto
                      ricerca={
                        rigaAttiva != null
                          ? righe[rigaAttiva]?.descrizione
                          : undefined
                      }
                      files={[fileFattura]}
                      companyId={companyId}
                      adatta
                    />
                  ) : (
                    <div className="space-y-3 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                      <p>
                        Il PDF o la foto della fattura non sono presenti. I dati
                        disponibili sono riportati in “Righe e importi”.
                      </p>
                      {onVersioneCompleta && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={onVersioneCompleta}
                        >
                          Apri fattura XML e stampa
                        </Button>
                      )}
                    </div>
                  )}
                </TabsContent>
<TabsContent
                  value="righe"
                  className="m-0 min-h-0 space-y-4 px-4 pb-4 sm:px-5"
                >
                  {!righe.length ? (
                    <p className="text-sm text-muted-foreground">
                      Righe non disponibili: consulta il documento originale.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border">
                      <table className="w-full text-xs">
                        <thead className="h-12 bg-muted/50 text-muted-foreground">
                          <tr>
                            <th className="p-2 text-left">Voce</th>
                            <th className="p-2 text-left">Descrizione</th>
                            <th className="p-2 text-right">Qtà / UM</th>
                            <th className="p-2 text-right">Prezzo netto</th>
                            <th className="p-2 text-right">Imponibile</th>
                          </tr>
                        </thead>
                        <tbody>
                          {righe.map((r, i) => (
                            <tr
                              key={`${r.id}-${i}`}
                              hidden={filtroRighe==="coerenti"&&esiti[i]?.stato!=="coerente"||filtroRighe==="differenze"&&esiti[i]?.stato==="coerente"}
                              ref={(el) => {
                                if (el) righeFatturaRef.current.set(i, el);
                                else righeFatturaRef.current.delete(i);
                              }}
                              className={`h-20 border-t align-top ${rigaAttiva === i ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}
                            >
                              <td className="p-2">
                                <button
                                  type="button"
                                  aria-label={`Seleziona voce F${i + 1} della fattura`}
                                  aria-pressed={rigaAttiva === i}
                                  onClick={() => selezionaRiga(i)}
                                  className={`rounded border px-1.5 py-1 text-[11px] font-semibold ${rigaAttiva === i ? "border-blue-400 bg-blue-100 text-blue-900" : "border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-300"}`}
                                >
                                  F{i + 1}
                                </button>
                              </td>
                              <td className="min-w-44 p-2">
                                <button
                                  type="button"
                                  className="line-clamp-2 text-left font-medium underline-offset-2 hover:underline"
                                  title={
                                    r.codice
                                      ? `${r.codice} · ${r.descrizione}`
                                      : r.descrizione
                                  }
                                  onClick={() => selezionaRiga(i)}
                                >
                                  {r.codice && (
                                    <span className="text-[11px] font-normal text-muted-foreground">
                                      {r.codice} ·{" "}
                                    </span>
                                  )}
                                  {r.descrizione || "Senza descrizione"}
                                </button>
                                {controllo && (
                                  <span
                                    title={esiti[i].motivo}
                                    className={`mt-1 inline-block rounded border px-1.5 py-0.5 text-[11px] ${colori[esiti[i].stato]}`}
                                  >
                                    {titoli[esiti[i].stato]}
                                  </span>
                                )}
                              </td>
                              <td className="whitespace-nowrap p-2 text-right tabular-nums">
                                {quantita(r.quantita)} {r.um || "· UM assente"}
                              </td>
                              <td className="whitespace-nowrap p-2 text-right tabular-nums">
                                {euro(r.prezzo)}
                              </td>
                              <td className="whitespace-nowrap p-2 text-right tabular-nums">
                                {r.importo == null ? "—" : euro(r.importo)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {controllo &&
                    esiti.length > 0 &&
                    (() => {
                      const i =
                          rigaAttiva != null && esiti[rigaAttiva]
                            ? rigaAttiva
                            : 0,
                        e = esiti[i],
                        r = righe[i];
                      return (
                        <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/50 p-4 text-xs">
                          <p className="font-semibold text-blue-900">
                            Esito voce F{i + 1} · {r.descrizione}
                          </p>
                          <p>{e.motivo}</p>
                          {e.quantitaDisponibile != null && (
                            <p>
                              Disponibili: {quantita(e.quantitaDisponibile)}{" "}
                              {r.um}
                            </p>
                          )}
                          {e.prezzoConcordato != null && (
                            <p>
                              Ordine: {euro(e.prezzoConcordato)}
                              {e.deltaPrezzo
                                ? ` · differenza ${euro(e.deltaPrezzo)}`
                                : ""}
                            </p>
                          )}
                          <p className="text-muted-foreground">
                            Clicca una voce F1, F2… per seguire le righe
                            corrispondenti. Una voce può riguardare più righe e
                            più DDT.
                          </p>
                        </div>
                      );
                    })()}
                  <div className="ml-auto max-w-xs space-y-2 rounded-xl bg-muted/30 p-4 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Imponibile</span>
                      <span>
                        {euro(numeroDocumento(fattura.imponibile_totale))}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">IVA</span>
                      <span>{euro(numeroDocumento(fattura.iva_totale))}</span>
                    </div>
                    <div className="flex justify-between gap-4 border-t pt-2 font-semibold">
                      <span>Totale fattura</span>
                      <span>
                        {euro(numeroDocumento(fattura.totale_documento))}
                      </span>
                    </div>
                  </div>
                  {controllo && (
                    <p className="rounded-lg bg-blue-50 p-3 text-xs leading-relaxed text-blue-900">
                      Controllo per codice o descrizione uguale, unità di misura
                      e quantità residue dei confronti registrati. Descrizioni
                      diverse, conversioni di unità, servizi e prezzi mancanti
                      richiedono il tuo controllo sugli originali.
                    </p>
                  )}
                </TabsContent>
</PannelloDocumento></Tabs>
            <Tabs value={doc ? doc.tipo==="oda"&&vistaDocumento==="originale"?"fornitore":doc.tipo==="ddt"&&["inviato","fornitore"].includes(vistaDocumento)?"originale":vistaDocumento : "righe"} onValueChange={setVistaDocumento} className="contents"><PannelloDocumento nome="DDT e ordini di confronto" lato="destra" attivo={pannelloMobile==="destra"} testata={<div className="shrink-0 space-y-2 border-b bg-background px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <ClipboardList className="h-4 w-4 text-orange-600" />
                    Documento da visualizzare
                  </h2>
                  {puoModificare && (
                    <Popover open={aggiungi} onOpenChange={setAggiungi}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8">
                          Collega DDT
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="end"
                        className="w-96 max-w-[calc(100vw-2rem)]"
                      >
                        <CollegaDdtFattura
                          companyId={companyId}
                          fatturaId={id}
                          fornitoreId={fornitoreId}
                          onSalvato={() => {
                            setAggiungi(false);
                            setControllo(false);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
                {!!documenti.length && (
                  <>
                    <select
                      aria-label="Documento da visualizzare"
                      value={doc?.id ?? ""}
                      onChange={(e) => {
                        setAttivo(e.target.value);
                        collegaBolla.reset();
                      }}
                      disabled={collegaBolla.isPending}
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm font-medium"
                    >
                      {documenti.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.tipo === "ddt" ? "DDT" : "Ordine"} · {d.numero}
                          {d.data ? ` · ${formatDateShort(d.data)}` : ""}
                        </option>
                      ))}
                    </select>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <Popover
                        open={selezionatoreAperto}
                        onOpenChange={setSelezionatoreAperto}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                          >
                            Nel controllo (
                            {
                              documenti.filter(
                                (d) =>
                                  scelti.has(d.id) &&
                                  documentoCompatibileConFornitore(
                                    fornitoreId,
                                    d.dati.supplier_id,
                                  ),
                              ).length
                            }
                            /{documenti.length})
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-96 max-w-[calc(100vw-2rem)] space-y-3"
                        >
                          <p className="text-xs text-muted-foreground">
                            Scegli quali DDT e ordini usare nel controllo di
                            quantità e prezzi. La selezione vale per questo
                            confronto.
                          </p>
                          <div
                            className="max-h-64 space-y-2 overflow-y-auto"
                            aria-label="Documenti disponibili"
                          >
                            {documenti.map((d) => (
                              <div
                                key={d.id}
                                className="flex items-center gap-2 rounded-md border p-2"
                              >
                                <input
                                  type="checkbox"
                                  aria-label={`Confronta ${d.tipo === "ddt" ? "DDT" : "ordine"} ${d.numero}`}
                                  checked={
                                    scelti.has(d.id) &&
                                    documentoCompatibileConFornitore(
                                      fornitoreId,
                                      d.dati.supplier_id,
                                    )
                                  }
                                  disabled={
                                    !documentoCompatibileConFornitore(
                                      fornitoreId,
                                      d.dati.supplier_id,
                                    )
                                  }
                                  onChange={(e) =>
                                    scegli(d.id, e.target.checked)
                                  }
                                  className="h-4 w-4 shrink-0 accent-blue-600"
                                />
                                <button
                                  type="button"
                                  className="min-w-0 flex-1 text-left text-xs"
                                  onClick={() => {
                                    setAttivo(d.id);
                                    setSelezionatoreAperto(false);
                                  }}
                                >
                                  <span className="flex items-center gap-1 font-medium">
                                    {d.tipo === "ddt" ? (
                                      <Truck className="h-3.5 w-3.5" />
                                    ) : (
                                      <ClipboardList className="h-3.5 w-3.5" />
                                    )}
                                    {d.numero}
                                  </span>
                                  <span className="mt-1 block truncate text-muted-foreground">
                                    {d.fornitore} · {d.righe.length} voci
                                  </span>
                                </button>
                              </div>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                      {doc && (
                        <label className="inline-flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            aria-label={`Includi ${doc.numero} nel controllo`}
                            checked={scelti.has(doc.id) && !fornitoreDiverso}
                            disabled={fornitoreDiverso}
                            onChange={(e) => scegli(doc.id, e.target.checked)}
                            className="h-3.5 w-3.5 accent-blue-600"
                          />
                          Includi nel controllo
                        </label>
                      )}
                      {doc && (
                        <Link
                          className="text-blue-700 underline-offset-2 hover:underline"
                          to={
                            doc.tipo === "ddt"
                              ? `/azienda/ddt/${doc.id}`
                              : `/azienda/ordini-acquisto/${doc.id}`
                          }
                        >
                          Apri scheda
                        </Link>
                      )}
                      {doc && (
                        <>
                          {doc.collegato ? (
                            <span className="text-emerald-700">
                              Collegato alla fattura
                            </span>
                          ) : (
                            <>
                              <span className="text-amber-800">
                                Da collegare
                              </span>
                              {puoModificare && doc.tipo === "ddt" && (
                                <button
                                  type="button"
                                  disabled={
                                    collegaBolla.isPending || fornitoreDiverso
                                  }
                                  className="font-medium text-blue-700 underline underline-offset-2 disabled:opacity-50"
                                  onClick={() => collegaBolla.mutate(doc.id)}
                                >
                                  {collegaBolla.isPending
                                    ? "Collegamento…"
                                    : "Collega questa bolla"}
                                </button>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </div>

                    {collegaBolla.isError && (
                      <p role="alert" className="text-xs text-destructive">
                        {messaggioSalvataggio(collegaBolla.error)}
                      </p>
                    )}
                  </>
                )}
              </div>} viste={doc && <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 py-2 sm:px-5">
                    <TabsList className="h-8">
                      <TabsTrigger value="righe">Righe</TabsTrigger>
                      {doc.tipo==="oda"?<><TabsTrigger value="inviato">PDF nostro</TabsTrigger><TabsTrigger value="fornitore">Conferma fornitore</TabsTrigger></>:<TabsTrigger value="originale">PDF / foto originali</TabsTrigger>}
                    </TabsList>
                    {vistaDocumento === "righe" && (
                      <Button
                        size="sm"
                        variant={allineaVoci ? "secondary" : "ghost"}
                        className="h-8 w-8 shrink-0 p-0"
                        aria-label="Allinea righe alla fattura"
                        aria-pressed={allineaVoci}
                        title="Ordina le righe con codice o descrizione uguali seguendo le voci della fattura. Gli originali mantengono il loro ordine."
                        onClick={() => setAllineaVoci((v) => !v)}
                      >
                        <ArrowLeftRight className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-8 w-8 shrink-0 p-0"
                          aria-label="Info e associazioni"
                          title="Info e associazioni"
                        >
                          <Info className="h-3.5 w-3.5"/><span className="sr-only">Info e associazioni
                          {q.data?.riferimenti.length
                            ? ` (${q.data.riferimenti.length})`
                            : ""}</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="end"
                        className="w-96 max-w-[calc(100vw-2rem)] space-y-3 text-xs"
                      >
                        <p className="font-medium">{doc.numero}</p>
                        <p className="text-muted-foreground">{doc.fornitore}</p>
                        {doc.avviso && (
                          <p className="rounded-lg bg-amber-50 p-3 text-amber-900">
                            {doc.avviso}
                          </p>
                        )}
                        {!!q.data?.riferimenti.length && (
                          <div className="space-y-2">
                            <p className="font-medium">
                              Riferimenti DDT da abbinare
                            </p>
                            <ul className="max-h-40 space-y-1 overflow-y-auto">
                              {q.data.riferimenti.map((r) => (
                                <li key={String(r.id)}>
                                  {String(r.numero_ddt)}
                                  {r.data_ddt
                                    ? ` · ${formatDateShort(String(r.data_ddt))}`
                                    : ""}
                                </li>
                              ))}
                            </ul>
                            <p className="text-muted-foreground">
                              Il numero è registrato. Collega la bolla caricata
                              per conservarne anche l’associazione alle righe e
                              agli originali.
                            </p>
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                  </div>}>
{q.isLoading ? (
                <p role="status" className="p-5 text-sm">
                  Caricamento documenti…
                </p>
              ) : !doc ? (
                <p className="m-4 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                  Nessun DDT o ordine collegato. Aggiungi una bolla caricata o
                  collega un ordine dalla scheda fattura.
                </p>
              ) : (
                <>
{(!!q.data?.nonDisponibili || fornitoreDiverso) && <ComandiDocumento ordine={10}><div className="space-y-1">{!!q.data?.nonDisponibili && (
                    <p
                      role="alert"
                      className="mx-4 mb-2 text-xs text-destructive"
                    >
                      {q.data.nonDisponibili} DDT collegati non leggibili. Il
                      confronto è incompleto.
                    </p>
                  )}
{fornitoreDiverso && (
                    <p role="alert" className="text-xs text-destructive">
                      Fornitore diverso dalla fattura: controlla l’associazione.
                      Questo documento è escluso dal controllo automatico.
                    </p>
                  )}
</div></ComandiDocumento>}
<TabsContent
                    key={`${doc.id}-righe`}
                    value="righe"
                    className="m-0 min-h-0 space-y-3 px-4 pb-4 sm:px-5"
                  >
                    <TabellaDocumenti
                      righe={doc.righe}
                      evidenziate={evidenziate}
                      riferimenti={riferimenti}
                      onSeleziona={selezionaRiga}
                      allinea={allineaVoci}
                    />
                    {doc.tipo === "ddt" && (
                      <p className="text-xs text-muted-foreground">
                        Destinazione:{" "}
                        {doc.dati.destinazione === "cantiere"
                          ? "consegna diretta in cantiere"
                          : doc.dati.destinazione === "magazzino"
                            ? "magazzino"
                            : "da verificare"}
                        .
                        {doc.bolle.some((b) => b.giaFatturata > 0) &&
                          " Parte delle quantità è già presente in precedenti confronti fattura."}
                      </p>
                    )}
                  </TabsContent>
{(doc.tipo==="oda"?["inviato","fornitore"]:["originale"]).map(vista=>(
                  <TabsContent
                    key={`${doc.id}-${vista}`}
                    value={vista}
                    className="m-0 flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-5"
                  >
                    {doc.tipo==="oda"?<OriginaliOrdineConfronto companyId={companyId} ordineId={doc.id} numero={doc.numero} attachmentUrl={typeof doc.dati.attachment_url==="string"?doc.dati.attachment_url:undefined} tipo={vista==="inviato"?"inviato":"fornitore"} adatta/>:originali.isLoading ? (
                      <p role="status" className="text-sm">
                        Cerco gli originali…
                      </p>
                    ) : originali.isError ? (
                      <p role="alert" className="text-sm text-destructive">
                        Non riesco a recuperare gli originali.{" "}
                        {messaggioSalvataggio(originali.error)}{" "}
                        <button
                          className="underline"
                          onClick={() => void originali.refetch()}
                        >
                          Riprova
                        </button>
                      </p>
                    ) : (
                      <OriginaliConfronto
                        ricerca={
                          rigaAttiva != null
                            ? doc?.righe.find((r) =>
                                riferimenti.get(r.id)?.includes(rigaAttiva),
                              )?.descrizione
                            : undefined
                        }
                        key={doc.id}
                        files={(originali.data ?? []).filter(f=>vista==="originale"||(f.tipo??"fornitore")===vista)}
                        companyId={companyId}
                        adatta
                      />
                    )}
                  </TabsContent>
                  ))}
</>
              )}
</PannelloDocumento></Tabs>
          </ConfrontoDocumentiLayout></div>
        )}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t bg-background px-4 py-3 sm:px-5">
          <div className="text-xs text-muted-foreground">
            La verifica salva lo stato della fattura. Controlla gli scostamenti
            prima di confermarla.
          </div>
          <div className="flex items-center gap-3">
            <VerificaFatturaPill
              id={id}
              numero={String(fattura.numero_fattura ?? "")}
              verificata={fatturaVerificata({
                stato: String(fattura.stato ?? ""),
                verifica_manuale: fattura.verifica_manuale
                  ? String(fattura.verifica_manuale)
                  : null,
              })}
              daRettificare={fattura.verifica_manuale === "da_rettificare"}
              motivoRettifica={
                fattura.rettifica_motivo
                  ? String(fattura.rettifica_motivo)
                  : null
              }
              puoCambiare={puoModificare}
            />
            <Button variant="outline" size="sm" onClick={onClose}>
              Chiudi confronto
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
