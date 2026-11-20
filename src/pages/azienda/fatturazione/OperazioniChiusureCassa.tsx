import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { chiaveQueryCassa, gruppoCassa, leggiPropostaCassa, rpcCassa } from "@/lib/cassaInCloud";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { leggiImporto } from "@/lib/finance/reconciliationAnalysis";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";
import type { AccreditoCassa, ConfrontoCassa, ValoriPropostaCassa } from "../../../../shared/cassaInCloud";

const RIGHE = [
  { id: "contanti", nome: "Cassa contanti", lato: "Dare", natura: "attivo" },
  { id: "pos", nome: "POS da accreditare", lato: "Dare", natura: "attivo" },
  { id: "ricavi", nome: "Ricavi da corrispettivi", lato: "Avere", natura: "ricavo" },
  { id: "iva", nome: "IVA su vendite", lato: "Avere", natura: "passivo" },
] as const;

const campoSelect = "block h-9 w-full rounded-md border bg-background px-2 text-sm";
const messaggio = (e: unknown) => e instanceof Error ? e.message : "Operazione non riuscita.";

export function ScritturaChiusuraCassa({ companyId, gruppo, valori, onClose }: {
  companyId: string; gruppo: ConfrontoCassa; valori: ValoriPropostaCassa; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [conti, setConti] = useState<Record<string, string>>({});
  const righe = RIGHE.filter((r) => valori[r.id] > 0);
  const annuario = useQuery({
    queryKey: [...chiaveQueryCassa(companyId), "conti-contabili"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contabilita_conti").select("id,codice,descrizione,natura")
        .eq("company_id", companyId).eq("attivo", true).eq("movimentabile", true).order("codice");
      if (error) throw error;
      return data;
    },
  });
  const registra = useMutation({
    mutationFn: () => rpcCassa("cassa_in_cloud_registra_chiusura", {
      ...gruppoCassa(companyId, gruppo), p_versione: valori.versione, p_conti: conti,
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chiaveQueryCassa(companyId) });
      void qc.invalidateQueries({ queryKey: ["contabilita", companyId] });
      toast.success("Scrittura da chiusura registrata.");
      onClose();
    },
  });
  const contiDistinti = !conti.contanti || !conti.pos || conti.contanti !== conti.pos;
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !registra.isPending) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Scrittura proposta dalla chiusura</DialogTitle>
          <DialogDescription>{gruppo.punto_vendita_nome} · Cassa {gruppo.cassa_id} · {formatDateShort(gruppo.giorno)}. Verifica l’IVA per aliquota e assegna i conti del tuo piano contabile prima di registrare.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {righe.map((r) => (
            <div className="grid items-end gap-2 sm:grid-cols-[1fr_auto]" key={r.id}>
              <div className="space-y-1">
                <Label htmlFor={`cassa-conto-${r.id}`}>{r.nome}</Label>
                <select id={`cassa-conto-${r.id}`} className={campoSelect} value={conti[r.id] ?? ""} disabled={annuario.isLoading || registra.isPending}
                  onChange={(e) => setConti((c) => ({ ...c, [r.id]: e.target.value }))}>
                  <option value="">Scegli il conto</option>
                  {annuario.data?.filter((c) => c.natura === r.natura).map((c) => <option key={c.id} value={c.id}>{c.codice} · {c.descrizione}</option>)}
                </select>
              </div>
              <p className="pb-2 text-sm tabular-nums">{r.lato} {formatCurrency(valori[r.id])}</p>
            </div>
          ))}
          <div className="rounded-md bg-muted/50 p-2 text-sm">Dare {formatCurrency(valori.lordo)} · Avere {formatCurrency(valori.ricavi + valori.iva)}</div>
          {annuario.isError && <p role="alert" className="text-sm text-destructive">Piano dei conti non disponibile. <button className="underline" onClick={() => void annuario.refetch()}>Riprova</button></p>}
          {!contiDistinti && <p role="alert" className="text-sm text-destructive">Scegli conti distinti per i contanti e il POS.</p>}
          {registra.isError && <p role="alert" className="text-sm text-destructive">{messaggio(registra.error)}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={registra.isPending} onClick={onClose}>Annulla</Button>
          <Button disabled={registra.isPending || !contiDistinti || !righe.every((r) => conti[r.id])} onClick={() => registra.mutate()}>
            {registra.isPending ? "Registrazione…" : "Registra scrittura"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type CandidatoPos = { id: string; conto: string; giorno: string; descrizione: string | null };

export function AbbinaAccreditoCassa({ companyId, gruppi, onClose, onFatto }: {
  companyId: string; gruppi: ConfrontoCassa[]; onClose: () => void; onFatto: () => void;
}) {
  const qc = useQueryClient();
  const [commissioni, setCommissioni] = useState("0");
  const [movimento, setMovimento] = useState("");
  const selezione = useQuery({
    queryKey: [...chiaveQueryCassa(companyId), "pos", gruppi.map((g) => gruppoCassa(companyId, g))],
    queryFn: async () => Promise.all(gruppi.map((g) => leggiPropostaCassa(companyId, g))),
    staleTime: 0,
  });
  const disponibili = selezione.data?.every((s) => s.valori?.pos > 0 && !s.accredito_id);
  const lordo = disponibili ? selezione.data.reduce((somma, s) => somma + Math.round(s.valori.pos * 100), 0) / 100 : 0;
  const commissione = leggiImporto(commissioni);
  const commissioneValida = commissione !== null && commissione >= 0 && commissione < lordo;
  const netto = commissioneValida ? (Math.round(lordo * 100) - Math.round(commissione * 100)) / 100 : 0;
  const dal = gruppi.map((g) => g.giorno).sort().at(-1);
  const candidati = useQuery({
    queryKey: [...chiaveQueryCassa(companyId), "candidati-pos", dal, netto],
    enabled: !!disponibili && netto > 0,
    queryFn: () => rpcCassa<CandidatoPos[]>("cassa_in_cloud_candidati_pos", { p_company_id: companyId, p_dal: dal, p_netto: netto }),
  });
  const valido = candidati.data?.some((c) => c.id === movimento);
  const abbina = useMutation({
    mutationFn: () => rpcCassa("cassa_in_cloud_abbina_pos", {
      p_company_id: companyId, p_tx: movimento, p_commissioni: commissione,
      p_chiusure: gruppi.map((g, i) => ({
        punto: g.punto_vendita_id, cassa: g.cassa_id, giorno: g.giorno, versione: selezione.data[i].valori.versione,
      })),
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chiaveQueryCassa(companyId) });
      void refreshFinancialQueries(qc);
      toast.success("Accredito POS abbinato.");
      onFatto();
    },
  });
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !abbina.isPending) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Abbina accredito POS</DialogTitle>
          <DialogDescription>{gruppi.length} {gruppi.length === 1 ? "chiusura selezionata" : "chiusure selezionate"}. Indica le commissioni trattenute e scegli l’accredito effettivo in Tesoreria.</DialogDescription>
        </DialogHeader>
        {selezione.isLoading && <p role="status" className="text-sm text-muted-foreground">Verifica delle chiusure…</p>}
        {selezione.isError && <p role="alert" className="text-sm text-destructive">{messaggio(selezione.error)}</p>}
        {selezione.isSuccess && !disponibili && <p role="alert" className="text-sm text-destructive">Almeno una chiusura ha dati POS da verificare oppure è già abbinata. Rivedi la selezione.</p>}
        {disponibili && (
          <div className="space-y-3">
            <p className="text-sm">POS lordo <strong>{formatCurrency(lordo)}</strong></p>
            <div className="space-y-1">
              <Label htmlFor="cassa-pos-commissioni">Commissioni trattenute in questo accredito</Label>
              <Input id="cassa-pos-commissioni" inputMode="decimal" value={commissioni} disabled={abbina.isPending}
                onChange={(e) => { setCommissioni(e.target.value); setMovimento(""); }} />
            </div>
            {commissioneValida ? <p className="text-sm">Accredito atteso <strong>{formatCurrency(netto)}</strong></p>
              : <p className="text-sm text-destructive">Inserisci commissioni da zero a un importo inferiore al lordo.</p>}
            {candidati.isFetching && <p role="status" className="text-sm text-muted-foreground">Ricerca accrediti in Tesoreria…</p>}
            {candidati.isError && <p role="alert" className="text-sm text-destructive">{messaggio(candidati.error)}</p>}
            {commissioneValida && candidati.data?.length === 0 && <p className="text-sm text-muted-foreground">Nessun movimento di entrata disponibile per questo importo e periodo.</p>}
            {commissioneValida && candidati.data?.length > 0 && (
              <div className="space-y-1">
                <Label htmlFor="cassa-pos-accredito">Accredito da abbinare</Label>
                <select id="cassa-pos-accredito" className={campoSelect} value={movimento} disabled={abbina.isPending}
                  onChange={(e) => setMovimento(e.target.value)}>
                  <option value="">Scegli conto e movimento</option>
                  {candidati.data.map((c) => <option key={c.id} value={c.id}>
                    {c.conto} · {formatDateShort(c.giorno)} · {c.descrizione || "Accredito"}
                  </option>)}
                </select>
              </div>
            )}
          </div>
        )}
        {abbina.isError && <p role="alert" className="text-sm text-destructive">{messaggio(abbina.error)}</p>}
        <DialogFooter>
          <Button variant="outline" disabled={abbina.isPending} onClick={onClose}>Annulla</Button>
          <Button disabled={abbina.isPending || !disponibili || !valido || netto <= 0} onClick={() => abbina.mutate()}>Conferma abbinamento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RiepilogoAccreditoCassa({ companyId, id, puoScollegare }: { companyId: string; id: string; puoScollegare: boolean }) {
  const qc = useQueryClient();
  const [conferma, setConferma] = useState(false);
  const accredito = useQuery({
    queryKey: [...chiaveQueryCassa(companyId), "accredito", id],
    queryFn: () => rpcCassa<AccreditoCassa | null>("cassa_in_cloud_accredito_pos", { p_company_id: companyId, p_id: id }),
  });
  const scollega = useMutation({
    mutationFn: () => rpcCassa("cassa_in_cloud_scollega_pos", { p_company_id: companyId, p_id: id }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chiaveQueryCassa(companyId) });
      void refreshFinancialQueries(qc);
      toast.success("Accredito POS scollegato.");
      setConferma(false);
    },
  });
  if (accredito.isLoading) return <p role="status" className="text-sm text-muted-foreground">Caricamento accredito…</p>;
  if (accredito.isError) return <p role="alert" className="text-sm text-destructive">{messaggio(accredito.error)}</p>;
  const a = accredito.data;
  if (!a) return null;
  return (
    <div className="space-y-2 rounded-md border p-3 text-sm">
      <p>Accredito POS · <strong>{a.conto}</strong>{a.giorno ? ` · ${formatDateShort(a.giorno)}` : ""}</p>
      <p>Lordo {formatCurrency(a.lordo)} · Commissioni {formatCurrency(a.commissioni)} · Netto {formatCurrency(a.netto)}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" asChild><Link to={`/azienda/tesoreria?tab=movimenti&movimento=${a.bank_transaction_id}`}>Apri in Tesoreria</Link></Button>
        {puoScollegare && <Button size="sm" variant="ghost" onClick={() => setConferma(true)}>Scollega accredito</Button>}
      </div>
      {conferma && <div role="group" aria-label="Conferma scollegamento" className="flex flex-wrap items-center gap-2">
        <span>Riaprire l’accredito per {a.chiusure} {a.chiusure === 1 ? "chiusura" : "chiusure"}?</span>
        <Button size="sm" variant="outline" disabled={scollega.isPending} onClick={() => setConferma(false)}>Annulla</Button>
        <Button size="sm" variant="destructive" disabled={scollega.isPending} onClick={() => scollega.mutate()}>Conferma scollegamento</Button>
      </div>}
      {scollega.isError && <p role="alert" className="text-destructive">{messaggio(scollega.error)}</p>}
    </div>
  );
}
