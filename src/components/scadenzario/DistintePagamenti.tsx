import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { exportToCSV } from "@/lib/csvExport";
import { formatCurrency, formatDateIt } from "@/lib/formatters";
import { etichettaModalitaPagamento } from "@/lib/fatturazione/pagamentoFatturaRicevuta";
import { operazioniRpc, riepilogoFatturaHref } from "@/lib/operazioni/operazioni";

type TipoPartita = "ricevuta" | "rata_fornitore" | "scadenza";
type Verifica = { id: string; numero: string | null };
type StatoDistinta = "bozza" | "approvata" | "annullata";
type Riga = {
  tipo: TipoPartita;
  fonte_id: string;
  fornitore: string;
  documento: string;
  riferimenti: string;
  scadenza: string;
  metodo: string | null;
  verifiche: Verifica[];
};
type Partita = Riga & { residuo: number };
type RigaDistinta = Riga & { importo: number; in_banca: number };
type Distinta = {
  id: string;
  fino_al: string;
  stato: StatoDistinta;
  creata_il: string;
  totale: number;
  in_banca: number;
  partite: number;
  righe?: RigaDistinta[];
};
type Vista = "prepara" | "archivio" | "dettaglio";

const METODO = (v: string | null) => v ? etichettaModalitaPagamento(v) || v : "Da definire";
const chiavePartita = (r: Riga) => r.tipo + ":" + r.fonte_id;
const stato = (d: Distinta) => d.stato === "bozza" ? "Bozza" : d.stato === "annullata" ? "Annullata"
  : d.in_banca >= d.totale ? "Riconciliata" : "Approvata";

function VerifichePartita({ righe }: { righe: Verifica[] }) {
  if (!righe?.length) return null;
  return <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
    <span>Da verificare</span>
    {righe.map(f => <Link key={f.id} className="underline" to={riepilogoFatturaHref(f.id)}>{f.numero ? "Fattura " + f.numero : "Apri fattura"}</Link>)}
  </div>;
}

function ContenutoDistinte({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const conferma = useConfirm();
  const [vista, setVista] = useState<Vista>("prepara");
  const [id, setId] = useState<string | null>(null);
  const [fino, setFino] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
  });
  const [offset, setOffset] = useState(0);
  const [scelte, setScelte] = useState<Record<string, Partita>>({});
  const [richiesta, setRichiesta] = useState(() => crypto.randomUUID());
  const queryKey = ["distinte-pagamenti", companyId];
  const proposta = useQuery({
    queryKey: [...queryKey, "proposte", fino, offset],
    enabled: vista === "prepara" && !!fino,
    queryFn: () => operazioniRpc<{ righe: Partita[]; altre: boolean }>("distinta_pagamenti_proposte", {
      p_company: companyId, p_fino: fino, p_offset: offset,
    }),
  });
  const archivio = useQuery({
    queryKey: [...queryKey, "archivio"],
    enabled: vista === "archivio",
    queryFn: () => operazioniRpc<Distinta[]>("distinta_pagamenti_elenco", { p_company: companyId }),
  });
  const dettaglio = useQuery({
    queryKey: [...queryKey, id],
    enabled: vista === "dettaglio" && !!id,
    queryFn: async () => (await operazioniRpc<Distinta[]>("distinta_pagamenti_elenco", { p_company: companyId, p_id: id }))[0] ?? null,
    refetchInterval: 60_000,
  });
  const selezionate = useMemo(() => Object.values(scelte), [scelte]);
  const aggiorna = () => void qc.invalidateQueries({ queryKey });
  const apri = (id: string) => { setId(id); setVista("dettaglio"); };
  const azione = useMutation({
    mutationFn: async (tipo: "crea" | "approva" | "annulla" | "esporta") => {
      if (tipo === "crea") {
        const nuovoId = await operazioniRpc<string>("distinta_pagamenti_crea", {
          p_company: companyId, p_fino: fino, p_richiesta: richiesta,
          p_scelte: selezionate.map(r => ({ tipo: r.tipo, fonte_id: r.fonte_id, importo: r.residuo })),
        });
        apri(nuovoId);
        setScelte({});
        setOffset(0);
        setRichiesta(crypto.randomUUID());
        toast.success("Bozza della distinta salvata");
      } else if (tipo === "esporta") {
        const righe = await operazioniRpc<Array<Pick<RigaDistinta, "fornitore" | "documento" | "riferimenti" | "scadenza" | "metodo" | "importo">>>(
          "distinta_pagamenti_esporta", { p_company: companyId, p_id: id },
        );
        if (!righe.length) {
          toast.info("Tutte le quote della distinta risultano riconciliate");
          return;
        }
        exportToCSV(righe.map(r => ({
          fornitore: r.fornitore, documento: r.documento, riferimenti: r.riferimenti,
          scadenza: r.scadenza, metodo: METODO(r.metodo), importo: r.importo.toFixed(2).replace(".", ","),
        })), [
          { key: "fornitore", label: "Fornitore" }, { key: "documento", label: "Documento" },
          { key: "riferimenti", label: "Causale" }, { key: "scadenza", label: "Scadenza" },
          { key: "metodo", label: "Metodo" }, { key: "importo", label: "Importo EUR" },
        ], "distinta-pagamenti-" + id?.slice(0, 8) + ".csv");
      } else {
        await operazioniRpc<void>(tipo === "approva" ? "distinta_pagamenti_approva" : "distinta_pagamenti_annulla", {
          p_company: companyId, p_id: id,
        });
        toast.success(tipo === "approva" ? "Distinta approvata" : "Distinta annullata");
      }
    },
    onSuccess: aggiorna,
    onError: (e: Error) => { toast.error(e.message); aggiorna(); },
  });
  const cambiaScelta = (r: Partita, aggiungi: boolean) => setScelte(prima => {
    const dopo = { ...prima };
    if (aggiungi) dopo[chiavePartita(r)] = r;
    else delete dopo[chiavePartita(r)];
    return dopo;
  });
  const d = dettaglio.data;

  return <div className="space-y-4">
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant={vista === "prepara" ? "secondary" : "outline"} onClick={() => setVista("prepara")}>Nuova distinta</Button>
      <Button size="sm" variant={vista !== "prepara" ? "secondary" : "outline"} onClick={() => setVista("archivio")}>Distinte salvate</Button>
    </div>

    {vista === "prepara" && <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex max-w-40 flex-col gap-1 text-sm">
          Scadenze fino al
          <Input type="date" value={fino} onChange={e => { setFino(e.target.value); setOffset(0); setScelte({}); }} />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">{selezionate.length} selezionate · {formatCurrency(selezionate.reduce((s, r) => s + r.residuo, 0))}</span>
          <Button size="sm" disabled={!selezionate.length || azione.isPending} onClick={() => azione.mutate("crea")}>Salva bozza</Button>
        </div>
      </div>
      {proposta.isLoading && <p className="text-sm text-muted-foreground" role="status">Caricamento partite…</p>}
      {proposta.isError && <p className="text-sm" role="alert">{proposta.error.message} <button className="underline" onClick={() => void proposta.refetch()}>Riprova</button></p>}
      {proposta.isSuccess && proposta.data.righe.length === 0 && <p className="text-sm text-muted-foreground">Nessuna partita disponibile entro questa data.</p>}
      {!!proposta.data?.righe.length && <ul className="max-h-[48vh] divide-y overflow-y-auto rounded-lg border">
        {proposta.data.righe.map(r => <li key={chiavePartita(r)} className="flex items-start gap-3 p-3 text-sm">
          <Checkbox checked={!!scelte[chiavePartita(r)]} onCheckedChange={v => cambiaScelta(r, v === true)}
            disabled={azione.isPending || selezionate.length >= 50 && !scelte[chiavePartita(r)]}
            aria-label={"Seleziona " + r.documento + " · " + r.fornitore} />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{r.documento}</p>
            <p className="text-xs text-muted-foreground">{r.fornitore} · {formatDateIt(r.scadenza)} · {METODO(r.metodo)}</p>
            <VerifichePartita righe={r.verifiche} />
          </div>
          <span className="whitespace-nowrap font-medium tabular-nums">{formatCurrency(r.residuo)}</span>
        </li>)}
      </ul>}
      {(offset > 0 || proposta.data?.altre) && <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={!offset} onClick={() => setOffset(x => x - 50)}>Indietro</Button>
        <Button size="sm" variant="outline" disabled={!proposta.data?.altre} onClick={() => setOffset(x => x + 50)}>Avanti</Button>
      </div>}
    </>}

    {vista === "archivio" && <>
      {archivio.isLoading && <p className="text-sm text-muted-foreground" role="status">Caricamento distinte…</p>}
      {archivio.isError && <p className="text-sm" role="alert">{archivio.error.message} <button className="underline" onClick={() => void archivio.refetch()}>Riprova</button></p>}
      {archivio.isSuccess && !archivio.data.length && <p className="text-sm text-muted-foreground">Nessuna distinta salvata.</p>}
      {!!archivio.data?.length && <ul className="max-h-[58vh] divide-y overflow-y-auto rounded-lg border">
        {archivio.data.map(x => <li key={x.id} className="p-3">
          <button className="flex w-full flex-wrap items-center justify-between gap-2 text-left text-sm" onClick={() => apri(x.id)}>
            <span>Distinta del {formatDateIt(x.creata_il.slice(0, 10))} · {x.partite} partite</span>
            <span className="flex flex-wrap items-center gap-2"><Badge variant="outline">{stato(x)}</Badge>{formatCurrency(x.totale)}</span>
          </button>
        </li>)}
      </ul>}
    </>}

    {vista === "dettaglio" && <>
      {dettaglio.isLoading && <p className="text-sm text-muted-foreground" role="status">Caricamento distinta…</p>}
      {dettaglio.isError && <p role="alert" className="text-sm">{dettaglio.error.message} <button className="underline" onClick={() => void dettaglio.refetch()}>Riprova</button></p>}
      {d && <>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{stato(d)}</Badge>
            <span className="font-medium">{formatCurrency(d.totale)}</span>
            {d.stato === "approvata" && <span className="text-sm text-muted-foreground">{formatCurrency(d.in_banca)} riconciliati</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {d.stato === "bozza" && <Button size="sm" disabled={azione.isPending || d.righe?.some(r => r.verifiche.length > 0)}
              onClick={async () => {
                if (await conferma({ title: "Approvare la distinta?", description: "Controlla i riferimenti e le quote selezionate.", confirmLabel: "Approva distinta" }))
                  azione.mutate("approva");
              }}>Approva distinta</Button>}
            {d.stato === "approvata" && d.in_banca < d.totale && <Button size="sm" variant="outline" disabled={azione.isPending} onClick={() => azione.mutate("esporta")}>Scarica CSV</Button>}
            {d.stato !== "annullata" && d.in_banca === 0 && <Button size="sm" variant="ghost" disabled={azione.isPending}
              onClick={async () => {
                if (await conferma({ title: "Annullare la distinta?", description: "Le partite tornano disponibili per una nuova distinta.", confirmLabel: "Annulla distinta" }))
                  azione.mutate("annulla");
              }}>Annulla distinta</Button>}
          </div>
        </div>
        <ul className="max-h-[50vh] divide-y overflow-y-auto rounded-lg border">
          {d.righe?.map(r => <li key={chiavePartita(r)} className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm">
            <div>
              <p className="font-medium">{r.documento}</p>
              <p className="text-xs text-muted-foreground">{r.fornitore} · {formatDateIt(r.scadenza)} · {METODO(r.metodo)}</p>
              <VerifichePartita righe={r.verifiche} />
            </div>
            <div className="text-right tabular-nums">
              <p>{formatCurrency(r.importo)}</p>
              {r.in_banca > 0 && <p className="text-xs text-emerald-700 dark:text-emerald-300">{formatCurrency(r.in_banca)} in banca</p>}
            </div>
          </li>)}
        </ul>
      </>}
    </>}
  </div>;
}

export function DistintePagamenti({ companyId }: { companyId: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)} aria-label="Distinte pagamenti">
      <ClipboardList className="h-4 w-4" aria-hidden="true" />
      <span>Distinte<span className="max-sm:hidden"> pagamenti</span></span>
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Distinte pagamenti</DialogTitle>
          <DialogDescription>Prepara le quote dei fornitori e approva la distinta prima di esportarla.</DialogDescription>
        </DialogHeader>
        {open && <ContenutoDistinte companyId={companyId} />}
      </DialogContent>
    </Dialog>
  </>;
}

