/**
 * Contabilità generale in partita doppia (10/11/2026), sezione dell'area fiscale.
 *
 * Tre viste: le scritture (con la nuova scrittura in dare e avere e lo storno),
 * il piano dei conti con la voce CEE di ogni conto, il libro giornale da
 * stampare. Le regole stanno nel database (contabilita_*): qui si legge e si
 * chiamano le funzioni, niente scritture dirette sulle tabelle.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileInput, Plus, Printer, Trash2, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFiscalPeriod } from "@/hooks/useFiscalPeriod";
import { useAnagraficaAzienda } from "@/hooks/useAnagraficaAzienda";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrintPreviewModal } from "@/components/shared/PrintPreviewModal";
import { FiscalSectionHeader } from "@/components/fatturazione/FiscalSectionLayout";
import { FiscalQueryState } from "@/components/fatturazione/FiscalQueryState";
import { bilancioCee, bilancioDiVerifica, htmlBilancioCee, htmlBilancioVerifica, saldiPerConto } from "@/lib/contabilita/bilancioCee";
import type { AziendaIntestazione } from "@/lib/contabilita/documentoContabile";
import {
  controllaBozza,
  costruisciGiornale,
  htmlLibroGiornale,
  importo,
  type ContoContabile,
  type RigaBozza,
  type Scrittura,
} from "@/lib/contabilita/libroGiornale";

// Le tabelle sono nuove: i tipi generati non le conoscono ancora.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const euro = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
const dataIt = (d: string) => d.split("-").reverse().join("/");
const oggi = () => new Date().toLocaleDateString("en-CA");
const rigaVuota = (): RigaBozza => ({ conto_id: "", dare: "", avere: "", descrizione: "" });

const CAUSALI = [
  "Giroconto",
  "Pagamento F24",
  "Stipendi",
  "Ammortamento",
  "Rateo",
  "Risconto",
  "Accantonamento",
  "Apertura conti",
  "Chiusura conti",
  "Rettifica",
];

const NATURE: Array<{ value: ContoContabile["natura"]; label: string; sezione: "SPA" | "SPP" | "CE" }> = [
  { value: "attivo", label: "Attività (stato patrimoniale)", sezione: "SPA" },
  { value: "passivo", label: "Passività e netto (stato patrimoniale)", sezione: "SPP" },
  { value: "costo", label: "Costo (conto economico)", sezione: "CE" },
  { value: "ricavo", label: "Ricavo (conto economico)", sezione: "CE" },
];

const chiave = (companyId: string | undefined, ...resto: unknown[]) => ["contabilita-generale", companyId, ...resto];

function useConti(companyId: string | undefined) {
  return useQuery({
    queryKey: chiave(companyId, "conti"),
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await db.from("contabilita_conti").select("*").eq("company_id", companyId).order("codice");
      if (error) throw error;
      return (data ?? []) as ContoContabile[];
    },
  });
}

function useScritture(companyId: string | undefined, anno: number) {
  return useQuery({
    queryKey: chiave(companyId, "scritture", anno),
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await db
        .from("contabilita_scritture")
        .select("id, esercizio, numero, data_registrazione, causale, descrizione, documento_numero, documento_data, origine, storno_di, contabilita_righe(riga, conto_id, dare, avere, descrizione)")
        .eq("company_id", companyId)
        .eq("esercizio", anno)
        .order("numero", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as Scrittura[];
    },
  });
}

export default function ContabilitaGenerale() {
  const p = useFiscalPeriod();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const richiesta = p.params.get("vista");
  const vista = richiesta === "conti" || richiesta === "giornale" || richiesta === "bilancio" ? richiesta : "scritture";
  const conti = useConti(companyId);

  return (
    <div className="space-y-4">
      <FiscalSectionHeader
        title="Contabilità generale"
        actions={
          <Select value={String(p.anno)} onValueChange={(v) => p.set({ anno: v })}>
            <SelectTrigger className="h-8 w-28" aria-label="Esercizio"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() + 1 - i).map((a) => (
                <SelectItem key={a} value={String(a)}>Esercizio {a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      <div className="flex flex-wrap gap-2">
        {([["scritture", "Scritture"], ["giornale", "Libro giornale"], ["bilancio", "Bilancio"], ["conti", "Piano dei conti"]] as const).map(([k, l]) => (
          <Button key={k} size="sm" variant={vista === k ? "default" : "outline"} onClick={() => p.set({ vista: k })}>{l}</Button>
        ))}
      </div>
      {conti.isLoading || conti.isError ? (
        <FiscalQueryState loading={conti.isLoading} error={conti.isError} onRetry={() => void conti.refetch()} />
      ) : (conti.data ?? []).length === 0 ? (
        <PianoVuoto companyId={companyId!} />
      ) : vista === "conti" ? (
        <PianoDeiConti companyId={companyId!} conti={conti.data!} />
      ) : vista === "bilancio" ? (
        <Bilancio companyId={companyId!} anno={p.anno} conti={conti.data!} />
      ) : (
        <Scritture companyId={companyId!} anno={p.anno} conti={conti.data!} giornale={vista === "giornale"} />
      )}
    </div>
  );
}

function PianoVuoto({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const carica = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("contabilita_piano_standard", { p_company: companyId });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      toast.success(`Piano dei conti caricato: ${n} conti`);
      void qc.invalidateQueries({ queryKey: chiave(companyId) });
    },
    onError: (e) => toast.error("Piano dei conti non caricato", { description: e instanceof Error ? e.message : String(e) }),
  });
  return (
    <div className="rounded-xl border p-6 text-sm space-y-3">
      <p className="font-medium">Il piano dei conti è vuoto.</p>
      <p className="text-muted-foreground">
        Carica il piano standard per l'edilizia: mastri e conti già collegati alle voci del bilancio CEE
        (artt. 2424 e 2425 del codice civile). Dopo puoi aggiungere i conti che ti servono.
      </p>
      <Button size="sm" onClick={() => carica.mutate()} disabled={carica.isPending}>
        {carica.isPending ? "Caricamento…" : "Carica il piano standard"}
      </Button>
    </div>
  );
}

function PianoDeiConti({ companyId, conti }: { companyId: string; conti: ContoContabile[] }) {
  const qc = useQueryClient();
  const [apri, setApri] = useState(false);
  const [codice, setCodice] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [natura, setNatura] = useState<ContoContabile["natura"]>("costo");
  const [voce, setVoce] = useState("");
  const [mastro, setMastro] = useState("");
  const mastri = conti.filter((c) => !c.movimentabile);
  const nomeMastro = new Map(mastri.map((m) => [m.id, `${m.codice} ${m.descrizione}`]));
  const [modifica, setModifica] = useState<ContoContabile | null>(null);
  const [soloDaConfermare, setSoloDaConfermare] = useState(false);
  const daConfermare = conti.filter((c) => c.nota);
  const visibili = soloDaConfermare ? daConfermare : conti;
  const crea = useMutation({
    mutationFn: async () => {
      const sezione = NATURE.find((n) => n.value === natura)!.sezione;
      const { error } = await db.rpc("contabilita_crea_conto", {
        p_company: companyId, p_codice: codice, p_descrizione: descrizione, p_natura: natura,
        p_sezione_cee: sezione, p_voce_cee: voce, p_mastro: mastro || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conto creato");
      setApri(false);
      setCodice(""); setDescrizione(""); setVoce(""); setMastro("");
      void qc.invalidateQueries({ queryKey: chiave(companyId, "conti") });
    },
    onError: (e) => toast.error("Conto non creato", { description: e instanceof Error ? e.message : String(e) }),
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {daConfermare.length > 0 ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={soloDaConfermare} onChange={(e) => setSoloDaConfermare(e.target.checked)} />
            Solo i conti da confermare ({daConfermare.length})
          </label>
        ) : <span />}
        <Button size="sm" onClick={() => setApri(true)}><Plus className="mr-1 h-4 w-4" />Nuovo conto</Button>
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="p-2">Codice</th><th className="p-2">Descrizione</th><th className="p-2">Natura</th><th className="p-2">Voce CEE</th><th className="p-2" /></tr>
          </thead>
          <tbody>
            {visibili.map((c) => (
              <tr key={c.id} className={c.movimentabile ? "border-t" : "border-t bg-muted/30 font-semibold"}>
                <td className="p-2 font-mono text-xs">{c.codice}</td>
                <td className="p-2">
                  {c.descrizione}
                  {c.codice_standard ? <span className="ml-2 rounded bg-blue-50 px-1.5 text-xs font-normal text-blue-800" title="Lo usano le scritture dai documenti">ruolo {c.codice_standard}</span> : null}
                  {c.nota ? <p className="text-xs font-normal text-amber-700">{c.nota}</p> : null}
                </td>
                <td className="p-2 text-muted-foreground">{c.natura}</td>
                <td className="p-2 text-muted-foreground">{c.sezione_cee ? `${c.sezione_cee === "SPA" ? "Attivo" : c.sezione_cee === "SPP" ? "Passivo" : "C.E."} ${c.voce_cee ?? ""}` : ""}</td>
                <td className="p-2 text-right"><Button size="sm" variant="ghost" onClick={() => setModifica(c)}>Modifica</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={apri} onOpenChange={setApri}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nuovo conto</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1"><Label>Codice</Label><Input value={codice} onChange={(e) => setCodice(e.target.value)} placeholder="30.08" /></div>
              <div className="col-span-2 space-y-1"><Label>Descrizione</Label><Input value={descrizione} onChange={(e) => setDescrizione(e.target.value)} /></div>
            </div>
            <div className="space-y-1">
              <Label>Natura</Label>
              <Select value={natura} onValueChange={(v) => setNatura(v as ContoContabile["natura"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{NATURE.map((n) => <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Mastro</Label>
                <Select value={mastro || "nessuno"} onValueChange={(v) => setMastro(v === "nessuno" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nessuno">Nessuno</SelectItem>
                    {mastri.map((m) => <SelectItem key={m.id} value={m.id}>{nomeMastro.get(m.id)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Voce CEE</Label><Input value={voce} onChange={(e) => setVoce(e.target.value)} placeholder="B.7" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApri(false)}>Annulla</Button>
            <Button onClick={() => crea.mutate()} disabled={crea.isPending || !codice.trim() || !descrizione.trim()}>Crea</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ModificaConto conto={modifica} onClose={() => setModifica(null)}
        onFatto={() => void qc.invalidateQueries({ queryKey: chiave(companyId, "conti") })} />
    </div>
  );
}

function Scritture({ companyId, anno, conti, giornale }: { companyId: string; anno: number; conti: ContoContabile[]; giornale: boolean }) {
  const qc = useQueryClient();
  const scritture = useScritture(companyId, anno);
  const anagrafica = useAnagraficaAzienda();
  const [nuova, setNuova] = useState(false);
  const [stampa, setStampa] = useState<string | null>(null);
  const [storno, setStorno] = useState<Scrittura | null>(null);
  const nomi = useMemo(() => new Map(conti.map((c) => [c.id, `${c.codice} ${c.descrizione}`])), [conti]);
  // Fatture emesse e ricevute, incassi e pagamenti dell'esercizio diventano scritture.
  // Lo fa il database (contabilita_genera_da_documenti): un documento genera al più
  // una scrittura viva, quindi rilanciarlo aggiunge solo quello che manca; tutto in
  // ordine di data, così i numeri seguono il calendario.
  const genera = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("contabilita_genera_da_documenti", { p_company: companyId, p_anno: anno });
      if (error) throw error;
      return data as {
        fatture_emesse: number; fatture_ricevute: number; incassi: number; pagamenti: number; altre?: number;
        saltate_solo_testata: number; gia_generate: number; errori: string[];
      };
    },
    onSuccess: (r) => {
      const nuove = r.fatture_emesse + r.fatture_ricevute + r.incassi + r.pagamenti + (r.altre ?? 0);
      const dettagli = [
        `${r.fatture_emesse} fatture emesse, ${r.fatture_ricevute} ricevute, ${r.incassi} incassi, ${r.pagamenti} pagamenti${r.altre ? `, ${r.altre} ritenute subite` : ""}`,
        r.gia_generate ? `${r.gia_generate} già registrati` : "",
        r.saltate_solo_testata ? `${r.saltate_solo_testata} saltati: senza imponibile (solo testata) o senza la loro fattura in contabilità` : "",
        r.errori.length ? `${r.errori.length} non registrati: ${r.errori.slice(0, 3).join("; ")}` : "",
      ].filter(Boolean).join(" · ");
      (r.errori.length ? toast.warning : toast.success)(`${nuove} scritture generate`, { description: dettagli, duration: 12000 });
      void qc.invalidateQueries({ queryKey: chiave(companyId, "scritture") });
    },
    onError: (e) => toast.error("Scritture non generate", { description: e instanceof Error ? e.message : String(e) }),
  });
  const stornate = useMemo(() => new Set((scritture.data ?? []).map((s) => s.storno_di).filter(Boolean)), [scritture.data]);

  if (scritture.isLoading || scritture.isError) {
    return <FiscalQueryState loading={scritture.isLoading} error={scritture.isError} onRetry={() => void scritture.refetch()} />;
  }
  const elenco = scritture.data ?? [];
  const g = costruisciGiornale(elenco, conti);
  const apriStampa = () => {
    const a = anagrafica.data;
    setStampa(htmlLibroGiornale({
      azienda: {
        ragione_sociale: a?.ragione_sociale ?? "", partita_iva: a?.partita_iva ?? null, codice_fiscale: a?.codice_fiscale ?? null,
        indirizzo_via: a?.indirizzo_via ?? null, indirizzo_numero_civico: a?.indirizzo_numero_civico ?? null, indirizzo_cap: a?.indirizzo_cap ?? null,
        indirizzo_comune: a?.indirizzo_comune ?? null, indirizzo_provincia: a?.indirizzo_provincia ?? null, logo_url: a?.logo_url ?? null,
      },
      scritture: elenco, conti, dal: `${anno}-01-01`, al: `${anno}-12-31`,
    }));
  };

  return (
    <div className="space-y-3">
      {stampa && (
        <PrintPreviewModal open onOpenChange={(v) => { if (!v) setStampa(null); }} htmlContent={stampa}
          title="Libro giornale — anteprima di stampa" fileName={`libro-giornale-${anno}`} soloPdf />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          {anno}: {g.scritture} scritture · dare {euro(g.totaleDare)} · avere {euro(g.totaleAvere)}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={apriStampa}><Printer className="mr-1 h-4 w-4" />Stampa libro giornale</Button>
          <Button size="sm" variant="outline" onClick={() => genera.mutate()} disabled={genera.isPending}>
            <FileInput className="mr-1 h-4 w-4" />{genera.isPending ? "Generazione…" : "Genera dai documenti"}
          </Button>
          <Button size="sm" onClick={() => setNuova(true)}><Plus className="mr-1 h-4 w-4" />Nuova scrittura</Button>
        </div>
      </div>

      {giornale ? (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-2">N.</th><th className="p-2">Data</th><th className="p-2">Causale</th><th className="p-2">Conto</th><th className="p-2 text-right">Dare</th><th className="p-2 text-right">Avere</th></tr>
            </thead>
            <tbody>
              {g.righe.length === 0 ? (
                <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Nessuna scrittura nel {anno}.</td></tr>
              ) : g.righe.map((r) => (
                <tr key={r.progressivo} className={r.primaDellaScrittura ? "border-t" : ""}>
                  <td className="p-2 font-mono text-xs">{r.primaDellaScrittura ? r.numero : ""}</td>
                  <td className="p-2">{r.primaDellaScrittura ? dataIt(r.data) : ""}</td>
                  <td className="p-2">{r.primaDellaScrittura ? r.causale : ""}</td>
                  <td className="p-2">{r.conto}{r.descrizione ? <span className="text-muted-foreground"> · {r.descrizione}</span> : null}</td>
                  <td className="p-2 text-right tabular-nums">{r.dare !== null ? euro(r.dare) : ""}</td>
                  <td className="p-2 text-right tabular-nums">{r.avere !== null ? euro(r.avere) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-2">
          {elenco.length === 0 ? (
            <p className="rounded-xl border p-4 text-sm text-muted-foreground">Nessuna scrittura nel {anno}. «Genera dai documenti» registra fatture, incassi e pagamenti dell'esercizio; le altre operazioni si registrano con «Nuova scrittura».</p>
          ) : elenco.map((s) => {
            const tot = s.contabilita_righe.reduce((t, r) => t + Number(r.dare || 0), 0);
            return (
              <details key={s.id} className="rounded-xl border p-3 text-sm">
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono text-xs">{s.numero}/{s.esercizio}</span>
                  <span>{dataIt(s.data_registrazione)}</span>
                  <span className="font-medium">{s.causale}</span>
                  {s.descrizione ? <span className="text-muted-foreground">{s.descrizione}</span> : null}
                  {s.storno_di ? <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-800">storno</span> : null}
                  {stornate.has(s.id) ? <span className="rounded bg-slate-100 px-1.5 text-xs text-slate-600">stornata</span> : null}
                  <span className="ml-auto tabular-nums">{euro(tot)}</span>
                </summary>
                <table className="mt-2 w-full text-sm">
                  <tbody>
                    {[...s.contabilita_righe].sort((a, b) => a.riga - b.riga).map((r) => (
                      <tr key={r.riga} className="border-t">
                        <td className="p-1.5">{nomi.get(r.conto_id) ?? "—"}{r.descrizione ? <span className="text-muted-foreground"> · {r.descrizione}</span> : null}</td>
                        <td className="p-1.5 text-right tabular-nums">{Number(r.dare) > 0 ? euro(Number(r.dare)) : ""}</td>
                        <td className="p-1.5 text-right tabular-nums">{Number(r.avere) > 0 ? euro(Number(r.avere)) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!s.storno_di && !stornate.has(s.id) ? (
                  <div className="mt-2 flex justify-end">
                    <Button size="sm" variant="outline" onClick={() => setStorno(s)}><Undo2 className="mr-1 h-4 w-4" />Storna</Button>
                  </div>
                ) : null}
              </details>
            );
          })}
        </div>
      )}

      <NuovaScrittura open={nuova} onOpenChange={setNuova} companyId={companyId} conti={conti}
        onFatto={() => void qc.invalidateQueries({ queryKey: chiave(companyId, "scritture") })} />
      <StornaScrittura scrittura={storno} onClose={() => setStorno(null)}
        onFatto={() => void qc.invalidateQueries({ queryKey: chiave(companyId, "scritture") })} />
    </div>
  );
}

function NuovaScrittura({ open, onOpenChange, companyId, conti, onFatto }: {
  open: boolean; onOpenChange: (v: boolean) => void; companyId: string; conti: ContoContabile[]; onFatto: () => void;
}) {
  const [data, setData] = useState(oggi());
  const [causale, setCausale] = useState("Giroconto");
  const [descrizione, setDescrizione] = useState("");
  const [docNumero, setDocNumero] = useState("");
  const [righe, setRighe] = useState<RigaBozza[]>([rigaVuota(), rigaVuota()]);
  const movimentabili = conti.filter((c) => c.movimentabile && c.attivo);
  const esito = controllaBozza(righe, conti);
  const reset = () => { setData(oggi()); setCausale("Giroconto"); setDescrizione(""); setDocNumero(""); setRighe([rigaVuota(), rigaVuota()]); };
  const cambia = (i: number, k: keyof RigaBozza, v: string) => setRighe((rr) => rr.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  const registra = useMutation({
    mutationFn: async () => {
      const usate = righe.filter((r) => r.conto_id || r.dare.trim() || r.avere.trim());
      const { error } = await db.rpc("contabilita_registra_scrittura", {
        p_company: companyId, p_data: data, p_causale: causale, p_descrizione: descrizione || null,
        p_documento_numero: docNumero || null, p_documento_data: null,
        p_righe: usate.map((r) => ({ conto_id: r.conto_id, dare: importo(r.dare), avere: importo(r.avere), descrizione: r.descrizione || null })),
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Scrittura registrata"); reset(); onOpenChange(false); onFatto(); },
    onError: (e) => toast.error("Scrittura non registrata", { description: e instanceof Error ? e.message : String(e) }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nuova scrittura</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="space-y-1"><Label>Data</Label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
            <div className="space-y-1">
              <Label>Causale</Label>
              <Input list="causali-contabili" value={causale} onChange={(e) => setCausale(e.target.value)} />
              <datalist id="causali-contabili">{CAUSALI.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <div className="space-y-1"><Label>Documento</Label><Input value={docNumero} onChange={(e) => setDocNumero(e.target.value)} placeholder="n." /></div>
            <div className="space-y-1"><Label>Descrizione</Label><Input value={descrizione} onChange={(e) => setDescrizione(e.target.value)} /></div>
          </div>
          <div className="space-y-2">
            {righe.map((r, i) => (
              <div key={i} className="grid grid-cols-12 items-end gap-2">
                <div className="col-span-12 space-y-1 sm:col-span-5">
                  {i === 0 ? <Label>Conto</Label> : null}
                  <Select value={r.conto_id || undefined} onValueChange={(v) => cambia(i, "conto_id", v)}>
                    <SelectTrigger><SelectValue placeholder="Scegli il conto" /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {movimentabili.map((c) => <SelectItem key={c.id} value={c.id}>{c.codice} {c.descrizione}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-4 space-y-1 sm:col-span-2">{i === 0 ? <Label>Dare</Label> : null}<Input inputMode="decimal" value={r.dare} onChange={(e) => cambia(i, "dare", e.target.value)} /></div>
                <div className="col-span-4 space-y-1 sm:col-span-2">{i === 0 ? <Label>Avere</Label> : null}<Input inputMode="decimal" value={r.avere} onChange={(e) => cambia(i, "avere", e.target.value)} /></div>
                <div className="col-span-3 space-y-1 sm:col-span-2">{i === 0 ? <Label>Nota</Label> : null}<Input value={r.descrizione} onChange={(e) => cambia(i, "descrizione", e.target.value)} /></div>
                <div className="col-span-1">
                  <Button variant="ghost" size="icon" aria-label="Togli riga" disabled={righe.length <= 2} onClick={() => setRighe((rr) => rr.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setRighe((rr) => [...rr, rigaVuota()])}><Plus className="mr-1 h-4 w-4" />Riga</Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-2 text-sm">
            <span>Dare {euro(esito.dare)} · Avere {euro(esito.avere)}</span>
            <span className={esito.differenza === 0 ? "text-emerald-700" : "text-destructive"}>
              {esito.differenza === 0 ? "Quadra" : `Differenza ${euro(Math.abs(esito.differenza))}`}
            </span>
          </div>
          {esito.problemi.length > 0 && righe.some((r) => r.conto_id || r.dare || r.avere) ? (
            <ul className="list-disc pl-5 text-xs text-destructive">{esito.problemi.map((x) => <li key={x}>{x}</li>)}</ul>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={() => registra.mutate()} disabled={registra.isPending || esito.problemi.length > 0 || !causale.trim() || !data}>
            {registra.isPending ? "Registrazione…" : "Registra"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StornaScrittura({ scrittura, onClose, onFatto }: { scrittura: Scrittura | null; onClose: () => void; onFatto: () => void }) {
  const [data, setData] = useState(oggi());
  const [motivo, setMotivo] = useState("");
  const storna = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("contabilita_storna_scrittura", { p_scrittura: scrittura!.id, p_data: data, p_motivo: motivo });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Scrittura stornata"); setMotivo(""); onClose(); onFatto(); },
    onError: (e) => toast.error("Storno non registrato", { description: e instanceof Error ? e.message : String(e) }),
  });
  return (
    <Dialog open={!!scrittura} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Storna la scrittura {scrittura ? `${scrittura.numero}/${scrittura.esercizio}` : ""}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Una scrittura registrata non si cancella: si registra quella inversa, con la data dello storno. Poi, se serve, si registra quella giusta.
        </p>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1"><Label>Data</Label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
          <div className="col-span-2 space-y-1"><Label>Motivo</Label><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="es. conto sbagliato" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={() => storna.mutate()} disabled={storna.isPending || !motivo.trim()}>Storna</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function intestazioneDa(a: ReturnType<typeof useAnagraficaAzienda>["data"]): AziendaIntestazione {
  return {
    ragione_sociale: a?.ragione_sociale ?? "", partita_iva: a?.partita_iva ?? null, codice_fiscale: a?.codice_fiscale ?? null,
    indirizzo_via: a?.indirizzo_via ?? null, indirizzo_numero_civico: a?.indirizzo_numero_civico ?? null, indirizzo_cap: a?.indirizzo_cap ?? null,
    indirizzo_comune: a?.indirizzo_comune ?? null, indirizzo_provincia: a?.indirizzo_provincia ?? null, logo_url: a?.logo_url ?? null,
  };
}

/** Bilancio di verifica e bilancio CEE dell'esercizio, dalle scritture. */
function Bilancio({ companyId, anno, conti }: { companyId: string; anno: number; conti: ContoContabile[] }) {
  const scritture = useScritture(companyId, anno);
  const anagrafica = useAnagraficaAzienda();
  const [stampa, setStampa] = useState<{ html: string; nome: string } | null>(null);
  if (scritture.isLoading || scritture.isError) {
    return <FiscalQueryState loading={scritture.isLoading} error={scritture.isError} onRetry={() => void scritture.refetch()} />;
  }
  const saldi = saldiPerConto(scritture.data ?? [], conti);
  const verifica = bilancioDiVerifica(saldi);
  const cee = bilancioCee(saldi);
  const azienda = intestazioneDa(anagrafica.data);
  const periodo = `Esercizio ${anno}`;
  const sbilancio = Math.round((cee.totaleAttivo - cee.totalePassivo) * 100) / 100;
  return (
    <div className="space-y-4">
      {stampa && (
        <PrintPreviewModal open onOpenChange={(v) => { if (!v) setStampa(null); }} htmlContent={stampa.html}
          title={`${stampa.nome} — anteprima di stampa`} fileName={`${stampa.nome.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${anno}`} soloPdf />
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setStampa({ html: htmlBilancioVerifica({ azienda, verifica, periodo }), nome: "Bilancio di verifica" })}>
          <Printer className="mr-1 h-4 w-4" />Stampa bilancio di verifica
        </Button>
        <Button size="sm" variant="outline" onClick={() => setStampa({ html: htmlBilancioCee({ azienda, bilancio: cee, periodo }), nome: "Bilancio CEE" })}>
          <Printer className="mr-1 h-4 w-4" />Stampa bilancio CEE
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border p-3 text-sm"><p className="text-muted-foreground">Totale attivo</p><p className="text-lg font-semibold tabular-nums">{euro(cee.totaleAttivo)}</p></div>
        <div className="rounded-xl border p-3 text-sm"><p className="text-muted-foreground">Totale passivo e netto</p><p className="text-lg font-semibold tabular-nums">{euro(cee.totalePassivo)}</p></div>
        <div className="rounded-xl border p-3 text-sm"><p className="text-muted-foreground">Utile (perdita) dell'esercizio</p><p className="text-lg font-semibold tabular-nums">{euro(cee.utile)}</p></div>
      </div>
      {!verifica.quadra || sbilancio !== 0 || cee.vociNonIndicate.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
          {!verifica.quadra ? <p>Il bilancio di verifica non quadra: dare {euro(verifica.totaleDare)}, avere {euro(verifica.totaleAvere)}.</p> : null}
          {sbilancio !== 0 ? <p>Attivo e passivo differiscono di {euro(sbilancio)}: un conto ha la natura sbagliata nel piano dei conti.</p> : null}
          {cee.vociNonIndicate.length > 0 ? <p>Conti senza una voce CEE riconosciuta: {cee.vociNonIndicate.join(", ")}.</p> : null}
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="p-2">Conto</th><th className="p-2 text-right">Dare</th><th className="p-2 text-right">Avere</th><th className="p-2 text-right">Saldo</th></tr>
          </thead>
          <tbody>
            {saldi.length === 0 ? (
              <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">Nessun conto movimentato nel {anno}.</td></tr>
            ) : saldi.map((x) => (
              <tr key={x.conto.id} className="border-t">
                <td className="p-2"><span className="font-mono text-xs mr-2">{x.conto.codice}</span>{x.conto.descrizione}</td>
                <td className="p-2 text-right tabular-nums">{euro(x.dare)}</td>
                <td className="p-2 text-right tabular-nums">{euro(x.avere)}</td>
                <td className="p-2 text-right tabular-nums">{x.saldo >= 0 ? `${euro(x.saldo)} D` : `${euro(-x.saldo)} A`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Cambia la classificazione di un conto: descrizione, natura, voce CEE, ruolo e nota. I movimenti restano. */
function ModificaConto({ conto, onClose, onFatto }: { conto: ContoContabile | null; onClose: () => void; onFatto: () => void }) {
  const [descrizione, setDescrizione] = useState("");
  const [natura, setNatura] = useState<ContoContabile["natura"]>("costo");
  const [voce, setVoce] = useState("");
  const [ruolo, setRuolo] = useState("");
  const [nota, setNota] = useState("");
  const [per, setPer] = useState<string | null>(null);
  if (conto && per !== conto.id) {
    setPer(conto.id);
    setDescrizione(conto.descrizione);
    setNatura(conto.natura);
    setVoce(conto.voce_cee ?? "");
    setRuolo(conto.codice_standard ?? "");
    setNota(conto.nota ?? "");
  }
  const salva = useMutation({
    mutationFn: async () => {
      const sezione = NATURE.find((n) => n.value === natura)!.sezione;
      const { error } = await db.rpc("contabilita_aggiorna_conto", {
        p_conto: conto!.id, p_descrizione: descrizione, p_natura: natura, p_sezione_cee: sezione,
        p_voce_cee: voce, p_codice_standard: ruolo, p_nota: nota,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Conto aggiornato"); setPer(null); onClose(); onFatto(); },
    onError: (e) => toast.error("Conto non aggiornato", { description: e instanceof Error ? e.message : String(e) }),
  });
  return (
    <Dialog open={!!conto} onOpenChange={(v) => { if (!v) { setPer(null); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Conto {conto?.codice}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Descrizione</Label><Input value={descrizione} onChange={(e) => setDescrizione(e.target.value)} /></div>
          <div className="space-y-1">
            <Label>Natura</Label>
            <Select value={natura} onValueChange={(v) => setNatura(v as ContoContabile["natura"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{NATURE.map((n) => <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label>Voce CEE</Label><Input value={voce} onChange={(e) => setVoce(e.target.value)} placeholder="C.II.1" /></div>
            <div className="space-y-1"><Label>Ruolo (piano standard)</Label><Input value={ruolo} onChange={(e) => setRuolo(e.target.value)} placeholder="es. 05.01" /></div>
          </div>
          <div className="space-y-1">
            <Label>Nota</Label>
            <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Vuota quando la classificazione è confermata" />
          </div>
          <p className="text-xs text-muted-foreground">Il ruolo dice alle scritture dai documenti quale conto usare: 05.01 clienti, 13.04 fornitori, 06.01 banca, 05.10 e 13.10 IVA, 20.01 ricavi, 30.01 acquisti.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setPer(null); onClose(); }}>Annulla</Button>
          <Button onClick={() => salva.mutate()} disabled={salva.isPending || !descrizione.trim()}>Salva</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
