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
import { useT } from "@/lib/campo/lingua/LinguaCampo";

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
  const t = useT();
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
      toast.success(t("Scrittura da chiusura registrata."));
      onClose();
    },
  });
  const contiDistinti = !conti.contanti || !conti.pos || conti.contanti !== conti.pos;
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !registra.isPending) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("Scrittura proposta dalla chiusura")}</DialogTitle>
          <DialogDescription>{t("{punto_vendita_nome} · Cassa {cassa_id} · {giorno}. Verifica l’IVA per aliquota e assegna i conti del tuo piano contabile prima di registrare.", { punto_vendita_nome: String(gruppo.punto_vendita_nome ?? ""), cassa_id: String(gruppo.cassa_id ?? ""), giorno: formatDateShort(gruppo.giorno) })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {righe.map((r) => (
            <div className="grid items-end gap-2 sm:grid-cols-[1fr_auto]" key={r.id}>
              <div className="space-y-1">
                <Label htmlFor={`cassa-conto-${r.id}`}>{t(r.nome)}</Label>
                <select id={`cassa-conto-${r.id}`} className={campoSelect} value={conti[r.id] ?? ""} disabled={annuario.isLoading || registra.isPending}
                  onChange={(e) => setConti((c) => ({ ...c, [r.id]: e.target.value }))}>
                  <option value="">{t("Scegli il conto")}</option>
                  {annuario.data?.filter((c) => c.natura === r.natura).map((c) => <option key={c.id} value={c.id}>{c.codice} · {c.descrizione}</option>)}
                </select>
              </div>
              <p className="pb-2 text-sm tabular-nums">{t(r.lato)} {formatCurrency(valori[r.id])}</p>
            </div>
          ))}
          <div className="rounded-md bg-muted/50 p-2 text-sm">{t("Dare {lordo} · Avere {valore}", { lordo: formatCurrency(valori.lordo), valore: formatCurrency(valori.ricavi + valori.iva) })}</div>
          {annuario.isError && <p role="alert" className="text-sm text-destructive">{t("Piano dei conti non disponibile.")} <button className="underline" onClick={() => void annuario.refetch()}>{t("Riprova")}</button></p>}
          {!contiDistinti && <p role="alert" className="text-sm text-destructive">{t("Scegli conti distinti per i contanti e il POS.")}</p>}
          {registra.isError && <p role="alert" className="text-sm text-destructive">{t(messaggio(registra.error))}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={registra.isPending} onClick={onClose}>{t("Annulla")}</Button>
          <Button disabled={registra.isPending || !contiDistinti || !righe.every((r) => conti[r.id])} onClick={() => registra.mutate()}>
            {registra.isPending ? t("Registrazione…") : t("Registra scrittura")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type CandidatoPos = { id: string; conto: string; giorno: string; descrizione: string | null };

type ContiAccredito = { banca: string; commissioni: string };
const contiVuoti: ContiAccredito = { banca: "", commissioni: "" };

function ContiPos({ companyId, commissioni, conti, onChange, disabled }: {
  companyId: string; commissioni: number; conti: ContiAccredito; onChange: (value: ContiAccredito) => void; disabled: boolean;
}) {
  const t = useT();
  const q = useQuery({
    queryKey: [...chiaveQueryCassa(companyId), "conti-contabili"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contabilita_conti").select("id,codice,descrizione,natura")
        .eq("company_id", companyId).eq("attivo", true).eq("movimentabile", true).order("codice");
      if (error) throw error;
      return data;
    },
  });
  const campi = [
    { id: "banca", label: t("Conto bancario nel piano dei conti"), natura: "attivo" },
    ...(commissioni > 0 ? [{ id: "commissioni", label: t("Conto costi per le commissioni POS"), natura: "costo" }] : []),
  ];
  return (
    <div className="grid gap-2 rounded-md border p-3">
      {campi.map(({ id, label, natura }) => (
        <label className="space-y-1 text-sm" key={id}>
          <span>{label}</span>
          <select className={campoSelect} disabled={q.isLoading || disabled}
            value={conti[id as keyof ContiAccredito]} onChange={(e) => onChange({ ...conti, [id]: e.target.value })}>
            <option value="">{t("Scegli il conto")}</option>
            {q.data?.filter((c) => c.natura === natura).map((c) => <option key={c.id} value={c.id}>{c.codice} · {c.descrizione}</option>)}
          </select>
        </label>
      ))}
      {q.isError && <p role="alert" className="text-sm text-destructive">{t("Piano dei conti non disponibile.")} <button className="underline" onClick={() => void q.refetch()}>{t("Riprova")}</button></p>}
    </div>
  );
}

export function AbbinaAccreditoCassa({ companyId, gruppi, onClose, onFatto }: {
  companyId: string; gruppi: ConfrontoCassa[]; onClose: () => void; onFatto: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [commissioni, setCommissioni] = useState("0");
  const [movimento, setMovimento] = useState("");
  const [conti, setConti] = useState<ContiAccredito>(contiVuoti);
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
  const contabilizza = !!selezione.data?.every((s) => s.puo_registrare && s.scrittura_id && !s.scrittura_da_verificare);
  const contiSelezionati = !!conti.banca && (!(commissione && commissione > 0) || !!conti.commissioni);
  const abbina = useMutation({
    mutationFn: () => rpcCassa(contabilizza ? "cassa_in_cloud_abbina_e_contabilizza_pos" : "cassa_in_cloud_abbina_pos", {
      p_company_id: companyId, p_tx: movimento, p_commissioni: commissione,
      p_chiusure: gruppi.map((g, i) => ({
        punto: g.punto_vendita_id, cassa: g.cassa_id, giorno: g.giorno, versione: selezione.data[i].valori.versione,
      })),
      ...(contabilizza ? { p_banca: conti.banca, p_commissioni_conto: conti.commissioni || null } : {}),
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chiaveQueryCassa(companyId) });
      void refreshFinancialQueries(qc);
      toast.success(contabilizza ? t("Accredito POS abbinato e contabilizzato.") : t("Accredito POS abbinato."));
      onFatto();
    },
  });
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !abbina.isPending) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("Abbina accredito POS")}</DialogTitle>
          <DialogDescription>{t(gruppi.length === 1 ? "{n} chiusura selezionata. Indica le commissioni trattenute e scegli l’accredito effettivo in Tesoreria." : "{n} chiusure selezionate. Indica le commissioni trattenute e scegli l’accredito effettivo in Tesoreria.", { n: gruppi.length })}</DialogDescription>
        </DialogHeader>
        {selezione.isLoading && <p role="status" className="text-sm text-muted-foreground">{t("Verifica delle chiusure…")}</p>}
        {selezione.isError && <p role="alert" className="text-sm text-destructive">{t(messaggio(selezione.error))}</p>}
        {selezione.isSuccess && !disponibili && <p role="alert" className="text-sm text-destructive">{t("Almeno una chiusura ha dati POS da verificare oppure è già abbinata. Rivedi la selezione.")}</p>}
        {disponibili && (
          <div className="space-y-3">
            <p className="text-sm">{t("POS lordo")} <strong>{formatCurrency(lordo)}</strong></p>
            <div className="space-y-1">
              <Label htmlFor="cassa-pos-commissioni">{t("Commissioni trattenute in questo accredito")}</Label>
              <Input id="cassa-pos-commissioni" inputMode="decimal" value={commissioni} disabled={abbina.isPending}
                onChange={(e) => { setCommissioni(e.target.value); setMovimento(""); }} />
            </div>
            {commissioneValida ? <p className="text-sm">{t("Accredito atteso")} <strong>{formatCurrency(netto)}</strong></p>
              : <p className="text-sm text-destructive">{t("Inserisci commissioni da zero a un importo inferiore al lordo.")}</p>}
            {candidati.isFetching && <p role="status" className="text-sm text-muted-foreground">{t("Ricerca accrediti in Tesoreria…")}</p>}
            {candidati.isError && <p role="alert" className="text-sm text-destructive">{t(messaggio(candidati.error))}</p>}
            {commissioneValida && candidati.data?.length === 0 && <p className="text-sm text-muted-foreground">{t("Nessun movimento di entrata disponibile per questo importo e periodo.")}</p>}
            {commissioneValida && candidati.data?.length > 0 && (
              <div className="space-y-1">
                <Label htmlFor="cassa-pos-accredito">{t("Accredito da abbinare")}</Label>
                <select id="cassa-pos-accredito" className={campoSelect} value={movimento} disabled={abbina.isPending}
                  onChange={(e) => { setMovimento(e.target.value); setConti(contiVuoti); }}>
                  <option value="">{t("Scegli conto e movimento")}</option>
                  {candidati.data.map((c) => <option key={c.id} value={c.id}>
                    {c.conto} · {formatDateShort(c.giorno)} · {c.descrizione || t("Accredito")}
                  </option>)}
                </select>
              </div>
            )}
            {contabilizza && valido && <ContiPos companyId={companyId} commissioni={commissione ?? 0} conti={conti}
              onChange={setConti} disabled={abbina.isPending} />}
          </div>
        )}
        {abbina.isError && <p role="alert" className="text-sm text-destructive">{t(messaggio(abbina.error))}</p>}
        <DialogFooter>
          <Button variant="outline" disabled={abbina.isPending} onClick={onClose}>{t("Annulla")}</Button>
          <Button disabled={abbina.isPending || !disponibili || !valido || netto <= 0 || (contabilizza && !contiSelezionati)}
            onClick={() => abbina.mutate()}>{contabilizza ? t("Abbina e contabilizza") : t("Conferma abbinamento")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RiepilogoAccreditoCassa({ companyId, id, puoScollegare }: { companyId: string; id: string; puoScollegare: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const [conferma, setConferma] = useState(false);
  const [apriConti, setApriConti] = useState(false);
  const [conti, setConti] = useState<ContiAccredito>(contiVuoti);
  const accredito = useQuery({
    queryKey: [...chiaveQueryCassa(companyId), "accredito", id],
    queryFn: () => rpcCassa<AccreditoCassa | null>("cassa_in_cloud_accredito_pos", { p_company_id: companyId, p_id: id }),
  });
  const scollega = useMutation({
    mutationFn: () => rpcCassa("cassa_in_cloud_scollega_pos", { p_company_id: companyId, p_id: id }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chiaveQueryCassa(companyId) });
      void refreshFinancialQueries(qc);
      toast.success(t("Accredito POS scollegato."));
      setConferma(false);
    },
  });
  const registra = useMutation({
    mutationFn: () => rpcCassa("cassa_in_cloud_contabilizza_pos", {
      p_company_id: companyId, p_id: id, p_banca: conti.banca, p_commissioni_conto: conti.commissioni || null,
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chiaveQueryCassa(companyId) });
      void refreshFinancialQueries(qc);
      setApriConti(false);
      toast.success(t("Scrittura dell’accredito registrata."));
    },
  });
  if (accredito.isLoading) return <p role="status" className="text-sm text-muted-foreground">{t("Caricamento accredito…")}</p>;
  if (accredito.isError) return <p role="alert" className="text-sm text-destructive">{t(messaggio(accredito.error))}</p>;
  const a = accredito.data;
  if (!a) return null;
  return (
    <div className="space-y-2 rounded-md border p-3 text-sm">
      <p>{t("Accredito POS ·")} <strong>{a.conto}</strong>{a.giorno ? ` · ${formatDateShort(a.giorno)}` : ""}</p>
      <p>{t("Lordo {lordo} · Commissioni {commissioni} · Netto {netto}", { lordo: formatCurrency(a.lordo), commissioni: formatCurrency(a.commissioni), netto: formatCurrency(a.netto) })}</p>
      {a.scrittura_id && <p className="text-muted-foreground">{t("Scrittura dell’accredito registrata in Contabilità generale.")}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" asChild><Link to={`/azienda/tesoreria?tab=movimenti&movimento=${a.bank_transaction_id}`}>{t("Apri in Tesoreria")}</Link></Button>
        {a.puo_contabilizzare && !apriConti && <Button size="sm" variant="outline" onClick={() => setApriConti(true)}>{t("Contabilizza accredito")}</Button>}
        {puoScollegare && <Button size="sm" variant="ghost" onClick={() => setConferma(true)}>{t("Scollega accredito")}</Button>}
      </div>
      {apriConti && a.puo_contabilizzare && <div className="space-y-2">
        <ContiPos companyId={companyId} commissioni={a.commissioni} conti={conti} onChange={setConti} disabled={registra.isPending} />
        <Button size="sm" variant="outline" onClick={() => setApriConti(false)} disabled={registra.isPending}>{t("Annulla")}</Button>
        <Button size="sm" className="ml-2" onClick={() => registra.mutate()}
          disabled={registra.isPending || !conti.banca || (a.commissioni > 0 && !conti.commissioni)}>{t("Registra accredito")}</Button>
        {registra.isError && <p role="alert" className="text-destructive">{t(messaggio(registra.error))}</p>}
      </div>}
      {conferma && <div role="group" aria-label={t("Conferma scollegamento")} className="flex flex-wrap items-center gap-2">
        <span>{t(a.chiusure === 1 ? "Riaprire l’accredito per {n} chiusura?" : "Riaprire l’accredito per {n} chiusure?", { n: a.chiusure })}</span>
        <Button size="sm" variant="outline" disabled={scollega.isPending} onClick={() => setConferma(false)}>{t("Annulla")}</Button>
        <Button size="sm" variant="destructive" disabled={scollega.isPending} onClick={() => scollega.mutate()}>{t("Conferma scollegamento")}</Button>
      </div>}
      {scollega.isError && <p role="alert" className="text-destructive">{t(messaggio(scollega.error))}</p>}
    </div>
  );
}
