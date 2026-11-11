/**
 * Registro dei cespiti nella contabilità generale (11/11/2026, docs/piano-assestamenti-fine-anno.md, lotto 3).
 *
 * Il registro è quello del Controllo di gestione; qui ogni cespite ha i suoi conti (bene, fondo,
 * ammortamento: proposti dalla categoria), il fondo noto a una data per i beni già in parte
 * ammortizzati, e la quota dell'anno. Il fondo si legge dalle quote registrate
 * (contabilita_cespiti_quote); dove non ce ne sono e nessuno ha detto il fondo, è una stima e lo si
 * dice. La cessione chiude bene e fondo con la plusvalenza o la minusvalenza.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { leggiImportoItaliano } from "@/lib/orders/salCertificato";
import { ContiPerRuolo, useContiMovimentabili, type RuoloConto } from "./ContiPerRuolo";

const euro = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" } as Intl.NumberFormatOptions).format(n);
const dataIt = (d: string) => d.split("-").reverse().join("/");
const errore = (titolo: string) => (e: unknown) => toast.error(titolo, { description: e instanceof Error ? e.message : String(e) });

/** I ruoli che i cespiti usano quando un cespite non ha i suoi conti. */
export const RUOLI_CESPITI: readonly RuoloConto[] = [
  { ruolo: "30.21", etichetta: "Ammortamento immobilizzazioni materiali (B.10.b)", natura: "costo" },
  { ruolo: "30.20", etichetta: "Ammortamento immobilizzazioni immateriali (B.10.a)", natura: "costo" },
  { ruolo: "02.90", etichetta: "Fondo ammortamento fabbricati", natura: "attivo" },
  { ruolo: "02.91", etichetta: "Fondo ammortamento impianti e macchinari", natura: "attivo" },
  { ruolo: "02.92", etichetta: "Fondo ammortamento attrezzature", natura: "attivo" },
  { ruolo: "02.93", etichetta: "Fondo ammortamento altri beni (automezzi, mobili…)", natura: "attivo" },
  { ruolo: "02.01", etichetta: "Terreni e fabbricati", natura: "attivo" },
  { ruolo: "02.02", etichetta: "Impianti e macchinari", natura: "attivo" },
  { ruolo: "02.03", etichetta: "Attrezzature", natura: "attivo" },
  { ruolo: "02.04", etichetta: "Automezzi", natura: "attivo" },
  { ruolo: "02.05", etichetta: "Mobili e macchine d'ufficio", natura: "attivo" },
  { ruolo: "01.01", etichetta: "Software e licenze", natura: "attivo" },
  { ruolo: "01.02", etichetta: "Altre immobilizzazioni immateriali", natura: "attivo" },
  { ruolo: "20.04", etichetta: "Plusvalenze (altri ricavi e proventi, A.5)", natura: "ricavo" },
  { ruolo: "30.40", etichetta: "Minusvalenze (oneri diversi di gestione, B.14)", natura: "costo" },
];
const ruoliMancanti = (codici: string[]) => RUOLI_CESPITI.filter((r) => codici.includes(r.ruolo));

export interface QuotaCespite {
  id: string; cespite: string; codice: string | null; categoria: string; costo: number; aliquota: number;
  fondo_inizio: number; fondo_stimato: boolean; quota: number; residuo: number;
  conto_bene: string | null; conto_fondo: string | null; conto_ammortamento: string | null;
}
export interface EsitoAmmortamenti { quote: QuotaCespite[]; totale: number; registrati: boolean; da_aggiornare: boolean; conti_mancanti: string[] }

const num = (x: unknown) => Number(x) || 0;
const testo = (x: unknown) => (x == null ? null : String(x));
const lista = (x: unknown) => (Array.isArray(x) ? x.map(String) : []);

/** La risposta di contabilita_ammortamenti, letta in modo sicuro. */
export function leggiEsitoAmmortamenti(j: Json): EsitoAmmortamenti {
  const o = (j ?? {}) as Record<string, unknown>;
  const quote = Array.isArray(o.quote) ? o.quote : [];
  return {
    quote: quote.map((x) => {
      const q = (x ?? {}) as Record<string, unknown>;
      return {
        id: String(q.id ?? ""), cespite: String(q.cespite ?? ""), codice: testo(q.codice), categoria: String(q.categoria ?? ""),
        costo: num(q.costo), aliquota: num(q.aliquota), fondo_inizio: num(q.fondo_inizio), fondo_stimato: q.fondo_stimato === true,
        quota: num(q.quota), residuo: num(q.residuo),
        conto_bene: testo(q.conto_bene), conto_fondo: testo(q.conto_fondo), conto_ammortamento: testo(q.conto_ammortamento),
      };
    }),
    totale: num(o.totale), registrati: o.registrati === true, da_aggiornare: o.da_aggiornare === true, conti_mancanti: lista(o.conti_mancanti),
  };
}

export interface EsitoCessione { fondo_inizio: number; fondo_stimato: boolean; quota: number; residuo: number; prezzo: number; plusvalenza: number; minusvalenza: number; conti_mancanti: string[] }
export function leggiEsitoCessione(j: Json): EsitoCessione {
  const o = (j ?? {}) as Record<string, unknown>;
  return {
    fondo_inizio: num(o.fondo_inizio), fondo_stimato: o.fondo_stimato === true, quota: num(o.quota), residuo: num(o.residuo),
    prezzo: num(o.prezzo), plusvalenza: num(o.plusvalenza), minusvalenza: num(o.minusvalenza), conti_mancanti: lista(o.conti_mancanti),
  };
}

export function RegistroCespiti({ companyId, anno, chiuso }: { companyId: string; anno: number; chiuso: boolean }) {
  const [conti, setConti] = useState<QuotaCespite | null>(null);
  const [cedi, setCedi] = useState<QuotaCespite | null>(null);
  const [daAnnullare, setDaAnnullare] = useState<string | null>(null);
  const qc = useQueryClient();
  const piano = useContiMovimentabili(companyId);
  const codiceDi = (id: string | null) => (id ? piano.data?.find((c) => c.id === id)?.codice ?? "—" : "manca");

  const elenco = useQuery({
    queryKey: ["contabilita-generale", companyId, "ammortamenti", anno],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("contabilita_ammortamenti", { p_company: companyId, p_anno: anno, p_anteprima: true });
      if (error) throw error;
      return leggiEsitoAmmortamenti(data);
    },
  });
  const ceduti = useQuery({
    queryKey: ["contabilita-generale", companyId, "cespiti-ceduti", anno],
    queryFn: async () => {
      const { data, error } = await supabase.from("cespiti").select("id, descrizione, data_dismissione, prezzo_cessione")
        .eq("company_id", companyId).not("prezzo_cessione", "is", null)
        .gte("data_dismissione", `${anno}-01-01`).lte("data_dismissione", `${anno}-12-31`).order("data_dismissione");
      if (error) throw error;
      return data ?? [];
    },
  });
  const annulla = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("contabilita_cespite_annulla_cessione", { p_cespite: id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cessione annullata: il cespite torna nel registro"); void qc.invalidateQueries({ queryKey: ["contabilita-generale", companyId] }); },
    onError: errore("Cessione non annullata"),
  });

  if (elenco.isLoading) return <p role="status" className="text-sm text-muted-foreground">Carico il registro dei cespiti…</p>;
  if (elenco.isError || !elenco.data) return <p role="alert" className="text-sm text-destructive">Registro dei cespiti non disponibile. <Button variant="link" className="h-auto p-0" onClick={() => void elenco.refetch()}>Riprova</Button></p>;
  const e = elenco.data;
  const stimati = e.quote.filter((q) => q.fondo_stimato).length;

  return (
    <div className="space-y-3">
      <ContiPerRuolo companyId={companyId} ruoli={ruoliMancanti(e.conti_mancanti)} chiuso={chiuso} />
      {stimati > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          Per {stimati === 1 ? "un cespite" : `${stimati} cespiti`} il fondo a inizio anno è stimato dagli anni trascorsi: indica quello vero
          (dal registro dei beni ammortizzabili o dal bilancio) con «Conti e fondo».
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-2">Cespite</th><th className="p-2 text-right">Costo</th><th className="p-2 text-right">Aliquota</th>
              <th className="p-2 text-right">Fondo al 01/01</th><th className="p-2 text-right">Quota {anno}</th><th className="p-2 text-right">Residuo</th><th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {e.quote.length === 0 ? (
              <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Nessun cespite da ammortizzare nel {anno}. I cespiti si aggiungono in Controllo di gestione o da una riga di fattura ricevuta.</td></tr>
            ) : e.quote.map((q) => (
              <tr key={q.id} className="border-t">
                <td className="p-2">
                  {q.codice ? <span className="mr-2 font-mono text-xs">{q.codice}</span> : null}{q.cespite}
                  <p className="text-xs text-muted-foreground">
                    Bene {codiceDi(q.conto_bene)} · fondo {codiceDi(q.conto_fondo)} · ammortamento {codiceDi(q.conto_ammortamento)}
                  </p>
                </td>
                <td className="p-2 text-right tabular-nums">{euro(q.costo)}</td>
                <td className="p-2 text-right tabular-nums">{q.aliquota.toLocaleString("it-IT")}%</td>
                <td className="p-2 text-right tabular-nums">
                  {euro(q.fondo_inizio)}
                  {q.fondo_stimato ? <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-800">stimato</span> : null}
                </td>
                <td className="p-2 text-right font-medium tabular-nums">{euro(q.quota)}</td>
                <td className="p-2 text-right tabular-nums">{euro(q.residuo)}</td>
                <td className="p-2 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Azioni per ${q.cespite}`} disabled={chiuso}><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setConti(q)}>Conti e fondo</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setCedi(q)}>Cessione o dismissione</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
            <tr className="border-t bg-muted/30 font-medium">
              <td className="p-2">
                Totale ammortamenti {e.da_aggiornare ? <span className="text-amber-700">· da aggiornare</span> : e.registrati ? "· registrati" : ""}
              </td>
              <td colSpan={3} /><td className="p-2 text-right tabular-nums">{euro(e.totale)}</td><td colSpan={2} />
            </tr>
          </tbody>
        </table>
      </div>
      {(ceduti.data ?? []).length > 0 && (
        <div className="space-y-1 text-sm">
          <p className="text-xs font-medium uppercase text-muted-foreground">Ceduti o dismessi nel {anno}</p>
          {(ceduti.data ?? []).map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-1.5">
              <span>{c.descrizione} · {c.data_dismissione ? dataIt(c.data_dismissione) : ""} · {euro(Number(c.prezzo_cessione) || 0)}</span>
              {daAnnullare === c.id ? (
                <span className="flex items-center gap-1 text-xs">
                  Storno la cessione e il cespite torna nel registro?
                  <Button size="sm" variant="destructive" className="h-7" disabled={annulla.isPending}
                    onClick={() => { annulla.mutate(c.id); setDaAnnullare(null); }}>Sì, annulla</Button>
                  <Button size="sm" variant="ghost" className="h-7" onClick={() => setDaAnnullare(null)}>No</Button>
                </span>
              ) : (
                <Button size="sm" variant="ghost" disabled={chiuso || annulla.isPending} onClick={() => setDaAnnullare(c.id)}>Annulla cessione</Button>
              )}
            </div>
          ))}
        </div>
      )}
      {conti && <ContiEFondo companyId={companyId} anno={anno} cespite={conti} onClose={() => setConti(null)} />}
      {cedi && <Cessione companyId={companyId} anno={anno} cespite={cedi} onClose={() => setCedi(null)} />}
    </div>
  );
}

const DAL_RUOLO = "__ruolo__";

function ContiEFondo({ companyId, anno, cespite, onClose }: { companyId: string; anno: number; cespite: QuotaCespite; onClose: () => void }) {
  const qc = useQueryClient();
  const piano = useContiMovimentabili(companyId);
  const riga = useQuery({
    queryKey: ["contabilita-generale", companyId, "cespite", cespite.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("cespiti")
        .select("conto_bene_id, conto_fondo_id, conto_ammortamento_id, fondo_iniziale, fondo_iniziale_anno, fondo_amm")
        .eq("id", cespite.id).eq("company_id", companyId).single();
      if (error) throw error;
      return data;
    },
  });
  const [bene, setBene] = useState<string | null | undefined>(undefined);
  const [fondo, setFondo] = useState<string | null | undefined>(undefined);
  const [amm, setAmm] = useState<string | null | undefined>(undefined);
  const [fondoIni, setFondoIni] = useState<string | undefined>(undefined);
  const [annoIni, setAnnoIni] = useState<string | undefined>(undefined);
  const r = riga.data;
  const v = {
    bene: bene === undefined ? r?.conto_bene_id ?? null : bene,
    fondo: fondo === undefined ? r?.conto_fondo_id ?? null : fondo,
    amm: amm === undefined ? r?.conto_ammortamento_id ?? null : amm,
    fondoIni: fondoIni ?? (r?.fondo_iniziale != null ? String(r.fondo_iniziale) : ""),
    annoIni: annoIni ?? (r?.fondo_iniziale_anno != null ? String(r.fondo_iniziale_anno) : String(anno)),
  };
  const importo = v.fondoIni.trim() === "" ? null : leggiImportoItaliano(v.fondoIni);
  const annoNum = Number(v.annoIni);
  const valido = importo === null || (Number.isFinite(importo) && importo >= 0 && importo <= cespite.costo && Number.isInteger(annoNum) && annoNum >= 2000 && annoNum <= 2100);

  const salva = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("contabilita_cespite_imposta", {
        p_cespite: cespite.id, p_conto_bene: v.bene as string, p_conto_fondo: v.fondo as string, p_conto_ammortamento: v.amm as string,
        p_fondo_iniziale: importo as number, p_fondo_iniziale_anno: (importo === null ? null : annoNum) as number,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cespite aggiornato"); void qc.invalidateQueries({ queryKey: ["contabilita-generale", companyId] }); onClose(); },
    onError: errore("Cespite non aggiornato"),
  });

  const scelta = (etichetta: string, valore: string | null, set: (x: string | null) => void, natura: string) => (
    <div className="space-y-1">
      <Label className="text-xs">{etichetta}</Label>
      <Select value={valore ?? DAL_RUOLO} onValueChange={(x) => set(x === DAL_RUOLO ? null : x)}>
        <SelectTrigger aria-label={etichetta} className="h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={DAL_RUOLO} className="text-xs">Proposto dalla categoria</SelectItem>
          {(piano.data ?? []).filter((c) => c.natura === natura).map((c) => (
            <SelectItem key={c.id} value={c.id} className="text-xs">{c.codice} {c.descrizione}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{cespite.cespite}</DialogTitle></DialogHeader>
        {riga.isLoading ? <p className="text-sm text-muted-foreground">Carico…</p> : (
          <div className="space-y-3">
            {scelta("Conto del bene", v.bene, setBene, "attivo")}
            {scelta("Conto del fondo ammortamento", v.fondo, setFondo, "attivo")}
            {scelta("Conto dell'ammortamento (costo)", v.amm, setAmm, "costo")}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="fondo-ini" className="text-xs">Fondo ammortamento noto</Label>
                <Input id="fondo-ini" inputMode="decimal" className="h-8 text-right tabular-nums" placeholder="vuoto = dalle quote"
                  value={v.fondoIni} onChange={(ev) => setFondoIni(ev.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="anno-ini" className="text-xs">al 01/01 dell'anno</Label>
                <Input id="anno-ini" inputMode="numeric" className="h-8 tabular-nums" value={v.annoIni} onChange={(ev) => setAnnoIni(ev.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Per un bene già in parte ammortizzato quando la contabilità parte qui: il fondo che risulta dal registro dei beni
              ammortizzabili a quella data. Dopo, il fondo è la somma delle quote registrate.
              {r?.fondo_amm ? ` In Controllo di gestione il fondo indicato è ${euro(Number(r.fondo_amm))}.` : ""}
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button disabled={!valido || salva.isPending || riga.isLoading} onClick={() => salva.mutate()}>Salva</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Cessione({ companyId, anno, cespite, onClose }: { companyId: string; anno: number; cespite: QuotaCespite; onClose: () => void }) {
  const qc = useQueryClient();
  const piano = useContiMovimentabili(companyId);
  const [data, setData] = useState(`${anno}-12-31`);
  const [prezzo, setPrezzo] = useState("0");
  const [conto, setConto] = useState<string | null>(null);
  const p = leggiImportoItaliano(prezzo);
  const prezzoValido = Number.isFinite(p) && p >= 0;
  // Proposto: il conto che fa da «altri ricavi», dove di solito va la riga della fattura di vendita.
  const proposto = piano.data?.find((c) => c.codice_standard === "20.04" || c.codice === "20.04")?.id ?? null;
  const contoPrezzo = conto ?? proposto;

  const anteprima = useQuery({
    queryKey: ["contabilita-generale", companyId, "cessione", cespite.id, data, p],
    enabled: !!data && prezzoValido,
    queryFn: async () => {
      const { data: d, error } = await supabase.rpc("contabilita_cespite_cessione", { p_cespite: cespite.id, p_data: data, p_prezzo: p, p_anteprima: true });
      if (error) throw error;
      return leggiEsitoCessione(d);
    },
  });
  const registra = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("contabilita_cespite_cessione", {
        p_cespite: cespite.id, p_data: data, p_prezzo: p, p_conto_prezzo: (p > 0 ? contoPrezzo : null) as string, p_anteprima: false,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cessione registrata"); void qc.invalidateQueries({ queryKey: ["contabilita-generale", companyId] }); onClose(); },
    onError: errore("Cessione non registrata"),
  });
  const a = anteprima.data;
  const mancanti = a ? ruoliMancanti(a.conti_mancanti) : [];

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Cessione: {cespite.cespite}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="ces-data" className="text-xs">Data</Label>
              <Input id="ces-data" type="date" className="h-8" value={data} onChange={(ev) => setData(ev.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ces-prezzo" className="text-xs">Prezzo (0 = rottamazione)</Label>
              <Input id="ces-prezzo" inputMode="decimal" className="h-8 text-right tabular-nums" value={prezzo} onChange={(ev) => setPrezzo(ev.target.value)} />
            </div>
          </div>
          {p > 0 && (
            <div className="space-y-1">
              <Label className="text-xs">Dove sta il prezzo</Label>
              <Select value={contoPrezzo ?? undefined} onValueChange={setConto}>
                <SelectTrigger aria-label="Conto del prezzo" className="h-8 text-xs"><SelectValue placeholder="Scegli il conto…" /></SelectTrigger>
                <SelectContent>
                  {(piano.data ?? []).map((c) => <SelectItem key={c.id} value={c.id} className="text-xs">{c.codice} {c.descrizione}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Se hai fatturato la vendita: il conto di ricavo usato nella fattura (il ricavo diventa plusvalenza o minusvalenza).
                Se l'hai incassato senza fattura: la banca o la cassa.
              </p>
            </div>
          )}
          {mancanti.length > 0 && <ContiPerRuolo companyId={companyId} ruoli={mancanti} chiuso={false} />}
          {a && (
            <table className="w-full text-sm">
              <tbody>
                <tr><td className="py-0.5">Fondo al 01/01{a.fondo_stimato ? " (stimato)" : ""}</td><td className="text-right tabular-nums">{euro(a.fondo_inizio)}</td></tr>
                <tr><td className="py-0.5">Quota fino alla cessione</td><td className="text-right tabular-nums">{euro(a.quota)}</td></tr>
                <tr><td className="py-0.5">Valore residuo</td><td className="text-right tabular-nums">{euro(a.residuo)}</td></tr>
                <tr className="font-medium">
                  <td className="py-0.5">{a.plusvalenza > 0 ? "Plusvalenza" : "Minusvalenza"}</td>
                  <td className="text-right tabular-nums">{euro(a.plusvalenza > 0 ? a.plusvalenza : a.minusvalenza)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button disabled={!a || !prezzoValido || mancanti.length > 0 || (p > 0 && !contoPrezzo) || registra.isPending} onClick={() => registra.mutate()}>
            {registra.isPending ? "Registrazione…" : "Registra la cessione"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
