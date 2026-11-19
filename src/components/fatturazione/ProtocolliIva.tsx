import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { FiscalRow } from "@/lib/fatturazione/fiscalWorkspace";
import { chiaveProtocolloIva, type useRegistriIva } from "@/hooks/useRegistriIva";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UniformSelect } from "@/components/ui/uniform-select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Registri = ReturnType<typeof useRegistriIva>;
const errore = (e: unknown) => e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : String(e);

export function GestioneSezionaliIva({ company, registri }: { company: string; registri: Registri }) {
  const [aperto, setAperto] = useState(false);
  const [lato, setLato] = useState("vendite");
  const [codice, setCodice] = useState("");
  const [nome, setNome] = useState("");
  const crea = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("iva_crea_sezionale" as never, { p_company: company, p_lato: lato, p_codice: codice.trim(), p_nome: nome.trim() } as never);
      if (error) throw error;
    },
    onSuccess: async () => { setCodice(""); setNome(""); await registri.ricarica(); toast.success("Sezionale creato"); },
    onError: e => toast.error("Sezionale non creato", { description: errore(e) }),
  });
  return <><Button size="sm" variant="outline" onClick={() => setAperto(true)}>Gestisci sezionali IVA</Button><Dialog open={aperto} onOpenChange={v => { if (!crea.isPending) setAperto(v); }}><DialogContent>
    <DialogHeader><DialogTitle>Sezionali IVA</DialogTitle><DialogDescription>Ogni sezionale ha una numerazione distinta per anno. Puoi separare, ad esempio, vendite ordinarie, reverse charge, pubblica amministrazione e autofatture estere.</DialogDescription></DialogHeader>
    <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">{(registri.sezionali.data ?? []).map(s => <li key={s.id}>{s.lato === "vendite" ? "Vendite" : "Acquisti"} · {s.codice} · {s.nome}</li>)}</ul>
    {registri.puoScrivere && <fieldset disabled={crea.isPending} className="space-y-3 border-t pt-3">
      <div className="space-y-1"><Label htmlFor="sezionale-lato">Registro</Label><UniformSelect id="sezionale-lato" className="h-10 w-full rounded-md border px-2" value={lato} onChange={e => setLato(e.target.value)}><option value="vendite">Vendite</option><option value="acquisti">Acquisti</option></UniformSelect></div>
      <div className="space-y-1"><Label htmlFor="sezionale-codice">Codice del sezionale</Label><Input id="sezionale-codice" value={codice} maxLength={20} placeholder="Es. V1, RC, PA, EST" onChange={e => setCodice(e.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor="sezionale-nome">Nome</Label><Input id="sezionale-nome" value={nome} maxLength={120} placeholder="Es. Vendite ordinarie" onChange={e => setNome(e.target.value)} /></div>
      <Button disabled={!codice.trim() || !nome.trim()} onClick={() => crea.mutate()}>{crea.isPending ? "Creazione…" : "Crea sezionale"}</Button>
    </fieldset>}
  </DialogContent></Dialog></>;
}

export function AssegnaProtocolliIva({ righe, registri, lato, singolo = false }: { righe: FiscalRow[]; registri: Registri; lato: "vendite" | "acquisti"; singolo?: boolean }) {
  const [aperto, setAperto] = useState(false);
  const [sezionale, setSezionale] = useState("");
  const [data, setData] = useState("");
  const [numero, setNumero] = useState("");
  const documenti = [...new Map(righe.filter(r => !r.synthetic && r.side === lato).map(r => [r.documentId, r])).values()]
    .sort((a, b) => a.periodDate.localeCompare(b.periodDate) || a.number.localeCompare(b.number, "it", { numeric: true }) || a.documentId.localeCompare(b.documentId));
  const presenti = documenti.map(r => registri.perDocumento.get(chiaveProtocolloIva(r.side, r.documentId))).filter(p => !!p);
  const mancanti = documenti.filter(r => !registri.perDocumento.has(chiaveProtocolloIva(r.side, r.documentId)));
  const sezionali = (registri.sezionali.data ?? []).filter(s => s.lato === lato);
  const assegna = useMutation({
    mutationFn: async () => {
      let fatti = 0;
      for (const r of mancanti) {
        const { error } = await supabase.rpc("iva_assegna_protocollo" as never, {
          p_sezionale: sezionale, p_documento: r.documentId, p_data: data || r.periodDate,
          p_numero: numero && fatti === 0 ? Number(numero) : null,
        } as never);
        if (error) throw new Error(`${fatti} protocolli assegnati. ${r.number}: ${errore(error)}`);
        fatti++;
      }
      return fatti;
    },
    onSuccess: async n => { await registri.ricarica(); setAperto(false); setNumero(""); toast.success(`${n} protocolli assegnati`); },
    onError: async e => { setNumero(""); await registri.ricarica(); toast.error("Protocollazione interrotta", { description: errore(e), duration: 12000 }); },
  });
  const [motivo, setMotivo] = useState("");
  const annulla = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("iva_annulla_protocollo" as never, { p_protocollo: presenti[0].id, p_motivo: motivo.trim() } as never);
      if (error) throw error;
    },
    onSuccess: async () => { await registri.ricarica(); setMotivo(""); toast.success("Protocollo annullato: il numero resta nello storico"); },
    onError: e => toast.error("Protocollo non annullato", { description: errore(e) }),
  });
  if (!documenti.length) return null;
  const p = singolo ? presenti[0] : undefined;
  const s = p ? registri.perSezionale.get(p.sezionale_id) : undefined;
  if (singolo && !p && !registri.puoScrivere) return <span className="text-xs text-muted-foreground">Non assegnato</span>;
  return <><Button size="sm" variant={singolo ? "ghost" : "outline"} onClick={() => { setSezionale(sezionali.length === 1 ? sezionali[0].id : ""); setData(singolo ? documenti[0]?.periodDate ?? "" : ""); setAperto(true); }}>{singolo ? p ? `${s?.codice ?? ""} · ${p.numero}/${p.anno}` : "Assegna protocollo" : "Protocolla documenti filtrati"}</Button>
    <Dialog open={aperto} onOpenChange={v => { if (!assegna.isPending && !annulla.isPending) setAperto(v); }}><DialogContent>
      <DialogHeader><DialogTitle>{p ? `Protocollo ${p.numero}/${p.anno}` : "Assegna protocolli IVA"}</DialogTitle><DialogDescription>{p ? `${s?.nome ?? "Sezionale"} · registrazione ${p.data_registrazione.split("-").reverse().join("/")}` : `${mancanti.length} documenti da protocollare, ${presenti.length} già assegnati. Il numero del protocollo è distinto dal numero della fattura.`}</DialogDescription></DialogHeader>
      {registri.puoScrivere && (p ? <div className="space-y-3"><Label htmlFor="protocollo-motivo">Motivo per annullare l’assegnazione</Label><Input id="protocollo-motivo" value={motivo} onChange={e => setMotivo(e.target.value)} /><Button variant="destructive" disabled={annulla.isPending || !motivo.trim()} onClick={() => annulla.mutate()}>Annulla assegnazione</Button></div> : mancanti.length > 0 ? <fieldset disabled={assegna.isPending} className="space-y-3">
        <Label htmlFor="protocollo-sezionale">Sezionale</Label><UniformSelect id="protocollo-sezionale" className="h-10 w-full rounded-md border px-2" value={sezionale} onChange={e => setSezionale(e.target.value)}><option value="">Scegli il sezionale</option>{sezionali.map(s => <option key={s.id} value={s.id}>{s.codice} · {s.nome}</option>)}</UniformSelect>
        {!sezionali.length && <p className="text-sm text-muted-foreground">Crea prima un sezionale da «Gestisci sezionali IVA».</p>}
        <Label htmlFor="protocollo-data">Data di registrazione{!singolo && " comune (facoltativa)"}</Label><Input id="protocollo-data" type="date" value={data} onChange={e => setData(e.target.value)} />
        {!singolo && <p className="text-xs text-muted-foreground">Senza una data comune si usa la data di periodo di ogni documento, in ordine cronologico.</p>}
        <Label htmlFor="protocollo-numero">{singolo ? "Numero" : "Primo numero"} (facoltativo)</Label><Input id="protocollo-numero" type="number" min="1" step="1" placeholder="Automatico: prossimo numero libero" value={numero} onChange={e => setNumero(e.target.value)} />
        <p className="text-xs text-muted-foreground">Per proseguire un registro già iniziato indica il numero verificato con lo studio. I documenti già protocollati mantengono il loro numero.</p>
        <DialogFooter><Button disabled={!sezionale || (!!numero && (!Number.isInteger(Number(numero)) || Number(numero) <= 0))} onClick={() => assegna.mutate()}>{assegna.isPending ? "Protocollazione…" : "Assegna protocolli"}</Button></DialogFooter>
      </fieldset> : <p>Tutti i documenti filtrati hanno già un protocollo.</p>)}
    </DialogContent></Dialog>
  </>;
}
