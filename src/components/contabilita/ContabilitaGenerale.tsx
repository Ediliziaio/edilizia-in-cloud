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
import { Download, FileInput, Lock, Plus, Printer, Trash2, Undo2 } from "lucide-react";
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
import { scaricaCsv } from "@/lib/csv";
import { FiscalSectionHeader } from "@/components/fatturazione/FiscalSectionLayout";
import { FiscalQueryState } from "@/components/fatturazione/FiscalQueryState";
import { bilancioCee, bilancioDiVerifica, htmlBilancioCee, htmlBilancioVerifica, saldiPerConto } from "@/lib/contabilita/bilancioCee";
import type { AziendaIntestazione } from "@/lib/contabilita/documentoContabile";
import { contoAPartite, htmlMastrino, mastrino, partitario } from "@/lib/contabilita/mastrini";
import {
  controllaBozza,
  costruisciGiornale,
  csvGiornale,
  csvPianoDeiConti,
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
      // PostgREST restituisce al più mille righe per chiamata: un esercizio di un'impresa
      // vera ne ha migliaia (Bonarrigo 2025: oltre 3.500), e giornale e bilancio senza le
      // altre sarebbero sbagliati senza dirlo. Si legge a pagine finché non finiscono.
      const PAGINA = 1000;
      const tutte: Scrittura[] = [];
      for (let da = 0; ; da += PAGINA) {
        const { data, error } = await db
          .from("contabilita_scritture")
          .select("id, esercizio, numero, data_registrazione, causale, descrizione, documento_numero, documento_data, origine, storno_di, contabilita_righe(riga, conto_id, dare, avere, descrizione)")
          .eq("company_id", companyId)
          .eq("esercizio", anno)
          .order("numero", { ascending: false })
          .range(da, da + PAGINA - 1);
        if (error) throw error;
        tutte.push(...((data ?? []) as Scrittura[]));
        if ((data ?? []).length < PAGINA) break;
      }
      return tutte;
    },
  });
}

export default function ContabilitaGenerale() {
  const p = useFiscalPeriod();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const richiesta = p.params.get("vista");
  const vista = richiesta === "conti" || richiesta === "giornale" || richiesta === "bilancio" || richiesta === "mastrini" || richiesta === "iva" || richiesta === "fine"
    ? richiesta : "scritture";
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
        {([["scritture", "Scritture"], ["giornale", "Libro giornale"], ["mastrini", "Mastrini e partitari"], ["iva", "Liquidazione IVA"], ["bilancio", "Bilancio"], ["fine", "Fine anno e chiusura"], ["conti", "Piano dei conti"]] as const).map(([k, l]) => (
          <Button key={k} size="sm" variant={vista === k ? "default" : "outline"} onClick={() => p.set({ vista: k })}>{l}</Button>
        ))}
      </div>
      <StatoEsercizio companyId={companyId} anno={p.anno} />
      {conti.isLoading || conti.isError ? (
        <FiscalQueryState loading={conti.isLoading} error={conti.isError} onRetry={() => void conti.refetch()} />
      ) : (conti.data ?? []).length === 0 ? (
        <PianoVuoto companyId={companyId!} />
      ) : vista === "conti" ? (
        <PianoDeiConti companyId={companyId!} conti={conti.data!} />
      ) : vista === "mastrini" ? (
        <Mastrini companyId={companyId!} anno={p.anno} conti={conti.data!} />
      ) : vista === "iva" ? (
        <LiquidazioneIva companyId={companyId!} anno={p.anno} />
      ) : vista === "fine" ? (
        <FineAnno companyId={companyId!} anno={p.anno} />
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
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => scaricaCsv("piano-dei-conti", csvPianoDeiConti(conti))}><Download className="mr-1 h-4 w-4" />Esporta</Button>
          <Button size="sm" onClick={() => setApri(true)}><Plus className="mr-1 h-4 w-4" />Nuovo conto</Button>
        </div>
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
  // Un esercizio vero ha migliaia di scritture: a video le prime, la stampa le ha tutte.
  const [mostra, setMostra] = useState(300);
  const [definitiva, setDefinitiva] = useState(false);
  const nomi = useMemo(() => new Map(conti.map((c) => [c.id, `${c.codice} ${c.descrizione}`])), [conti]);
  // Fatture emesse e ricevute, incassi e pagamenti, movimenti di prima nota e F24 pagati
  // dell'esercizio diventano scritture.
  // Lo fa il database (contabilita_genera_da_documenti): un documento genera al più
  // una scrittura viva, quindi rilanciarlo aggiunge solo quello che manca; tutto in
  // ordine di data, così i numeri seguono il calendario.
  const genera = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("contabilita_genera_da_documenti", { p_company: companyId, p_anno: anno });
      if (error) throw error;
      return data as {
        fatture_emesse: number; fatture_ricevute: number; incassi: number; pagamenti: number; altre?: number; movimenti?: number; giroconti_saltati?: number; cedolini?: number;
        saltate_solo_testata: number; gia_generate: number; errori: string[];
      };
    },
    onSuccess: (r) => {
      const nuove = r.fatture_emesse + r.fatture_ricevute + r.incassi + r.pagamenti + (r.altre ?? 0) + (r.movimenti ?? 0) + (r.cedolini ?? 0);
      const dettagli = [
        `${r.fatture_emesse} fatture emesse, ${r.fatture_ricevute} ricevute, ${r.incassi} incassi, ${r.pagamenti} pagamenti${r.altre ? `, ${r.altre} ritenute subite` : ""}${r.movimenti ? `, ${r.movimenti} movimenti di prima nota e F24` : ""}${r.cedolini ? `, ${r.cedolini} mesi di cedolini` : ""}`,
        r.giroconti_saltati ? `${r.giroconti_saltati} giroconti fra conti propri non registrati` : "",
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
          {giornale ? (
            <>
              <Button size="sm" variant="outline" onClick={() => setDefinitiva(true)}><Lock className="mr-1 h-4 w-4" />Stampa definitiva</Button>
              <Button size="sm" variant="outline" onClick={() => scaricaCsv(`libro-giornale-${anno}`, csvGiornale(elenco, conti))}
                title="Una riga per movimento, col codice del conto: per il programma dello studio">
                <Download className="mr-1 h-4 w-4" />Esporta per lo studio
              </Button>
            </>
          ) : null}
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
              ) : g.righe.slice(0, mostra * 5).map((r) => (
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
          ) : elenco.slice(0, mostra).map((s) => {
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
      {(giornale ? g.righe.length > mostra * 5 : elenco.length > mostra) ? (
        <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
          <span>{giornale ? `Righe ${mostra * 5} di ${g.righe.length}` : `Scritture ${mostra} di ${elenco.length}`}: la stampa le contiene tutte.</span>
          <Button size="sm" variant="outline" onClick={() => setMostra((n) => n + 300)}>Mostra altre</Button>
        </div>
      ) : null}

      <StampaDefinitiva open={definitiva} onOpenChange={setDefinitiva} companyId={companyId} anno={anno}
        onStampa={(dal, al) => setStampa(htmlLibroGiornale({ azienda: intestazioneDa(anagrafica.data), scritture: elenco, conti, dal, al, definitiva: true }))} />
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

/** Mastrino di un conto e, per clienti e fornitori, il partitario: quanto deve o avanza ognuno. */
function Mastrini({ companyId, anno, conti }: { companyId: string; anno: number; conti: ContoContabile[] }) {
  const scritture = useScritture(companyId, anno);
  const anagrafica = useAnagraficaAzienda();
  const [contoId, setContoId] = useState("");
  const [soggetto, setSoggetto] = useState<string | null>(null);
  const [stampa, setStampa] = useState<string | null>(null);
  const [mostra, setMostra] = useState(500);
  const movimentati = useMemo(() => {
    const usati = new Set((scritture.data ?? []).flatMap((s) => s.contabilita_righe.map((r) => r.conto_id)));
    return conti.filter((c) => c.movimentabile && usati.has(c.id));
  }, [scritture.data, conti]);
  if (scritture.isLoading || scritture.isError) {
    return <FiscalQueryState loading={scritture.isLoading} error={scritture.isError} onRetry={() => void scritture.refetch()} />;
  }
  const elenco = scritture.data ?? [];
  const conto = movimentati.find((c) => c.id === contoId) ?? movimentati.find((c) => contoAPartite(c)) ?? movimentati[0];
  if (!conto) return <p className="rounded-xl border p-4 text-sm text-muted-foreground">Nessun conto movimentato nel {anno}.</p>;
  const aPartite = contoAPartite(conto) && soggetto === null;
  const partite = aPartite ? partitario(elenco, conto.id) : [];
  const m = aPartite ? null : mastrino(elenco, conto.id, soggetto ?? undefined);
  const saldoTesto = (n: number) => (n === 0 ? euro(0) : `${euro(Math.abs(n))} ${n > 0 ? "D" : "A"}`);
  return (
    <div className="space-y-3">
      {stampa && (
        <PrintPreviewModal open onOpenChange={(v) => { if (!v) setStampa(null); }} htmlContent={stampa}
          title="Mastrino — anteprima di stampa" fileName={`mastrino-${conto.codice}-${anno}`} soloPdf />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={conto.id} onValueChange={(v) => { setContoId(v); setSoggetto(null); setMostra(500); }}>
          <SelectTrigger className="h-8 w-80" aria-label="Conto"><SelectValue /></SelectTrigger>
          <SelectContent>
            {movimentati.map((c) => <SelectItem key={c.id} value={c.id}>{c.codice} {c.descrizione}</SelectItem>)}
          </SelectContent>
        </Select>
        {soggetto !== null ? (
          <Button size="sm" variant="outline" onClick={() => setSoggetto(null)}>← Tutti i soggetti</Button>
        ) : null}
        {!aPartite ? (
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setStampa(htmlMastrino({
            azienda: intestazioneDa(anagrafica.data), scritture: elenco, conto, soggetto: soggetto ?? undefined,
            dal: `${anno}-01-01`, al: `${anno}-12-31`,
          }))}><Printer className="mr-1 h-4 w-4" />Stampa {soggetto ? "scheda" : "mastrino"}</Button>
        ) : null}
      </div>
      {aPartite ? (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-2">{conto.codice_standard === "13.04" || /fornitor/i.test(conto.descrizione) ? "Fornitore" : "Cliente"}</th><th className="p-2 text-right">Movimenti</th><th className="p-2 text-right">Dare</th><th className="p-2 text-right">Avere</th><th className="p-2 text-right">Saldo</th></tr>
            </thead>
            <tbody>
              {partite.map((x) => (
                <tr key={x.soggetto} className="cursor-pointer border-t hover:bg-muted/40" onClick={() => setSoggetto(x.soggetto)}>
                  <td className="p-2">{x.soggetto}</td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">{x.movimenti}</td>
                  <td className="p-2 text-right tabular-nums">{euro(x.dare)}</td>
                  <td className="p-2 text-right tabular-nums">{euro(x.avere)}</td>
                  <td className="p-2 text-right font-medium tabular-nums">{saldoTesto(x.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : m ? (
        <>
          <p className="text-sm text-muted-foreground">
            {soggetto ? `${soggetto} · ` : ""}{m.movimenti.length} movimenti · dare {euro(m.dare)} · avere {euro(m.avere)} · saldo {saldoTesto(m.saldo)}
          </p>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr><th className="p-2">Data</th><th className="p-2">N.</th><th className="p-2">Causale</th><th className="p-2">Descrizione</th><th className="p-2 text-right">Dare</th><th className="p-2 text-right">Avere</th><th className="p-2 text-right">Saldo</th></tr>
              </thead>
              <tbody>
                {m.movimenti.slice(0, mostra).map((x, i) => (
                  <tr key={`${x.scritturaId}-${i}`} className="border-t">
                    <td className="p-2">{dataIt(x.data)}</td>
                    <td className="p-2 font-mono text-xs">{x.numero}</td>
                    <td className="p-2">{x.causale}</td>
                    <td className="p-2 text-muted-foreground">{x.descrizione}</td>
                    <td className="p-2 text-right tabular-nums">{x.dare ? euro(x.dare) : ""}</td>
                    <td className="p-2 text-right tabular-nums">{x.avere ? euro(x.avere) : ""}</td>
                    <td className="p-2 text-right tabular-nums">{saldoTesto(x.saldo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {m.movimenti.length > mostra ? (
            <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
              <span>Movimenti {mostra} di {m.movimenti.length}: la stampa li contiene tutti.</span>
              <Button size="sm" variant="outline" onClick={() => setMostra((n) => n + 500)}>Mostra altri</Button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/** I periodi IVA dell'anno: dodici mesi o quattro trimestri. */
function periodiIva(anno: number, trimestrale: boolean) {
  const fine = (m: number) => new Date(Date.UTC(anno, m, 0)).toISOString().slice(0, 10);
  const mm = (m: number) => String(m).padStart(2, "0");
  return trimestrale
    ? [1, 2, 3, 4].map((t) => ({ dal: `${anno}-${mm(t * 3 - 2)}-01`, al: fine(t * 3), nome: `${t}° trimestre ${anno}` }))
    : MESI.map((nome, i) => ({ dal: `${anno}-${mm(i + 1)}-01`, al: fine(i + 1), nome: `${nome} ${anno}` }));
}

interface EsitoLiquidazione {
  iva_vendite: number; iva_acquisti: number; saldo: number; credito_precedente: number; compensato: number;
  da_versare: number; a_credito: number; gia_liquidato: boolean; sotto_minimo?: boolean;
}

/**
 * Liquidazione IVA in contabilità: l'IVA su vendite e su acquisti del periodo si gira su
 * Erario c/IVA (contabilita_liquida_iva). L'importo si legge dalle scritture: un documento
 * non ancora registrato non c'è, quindi prima si genera dai documenti.
 */
function LiquidazioneIva({ companyId, anno }: { companyId: string; anno: number }) {
  const qc = useQueryClient();
  const [trimestrale, setTrimestrale] = useState(false);
  const periodi = periodiIva(anno, trimestrale);
  const esiti = useQuery({
    queryKey: chiave(companyId, "liquidazioni-iva", anno, trimestrale),
    queryFn: async () => {
      const risultati: EsitoLiquidazione[] = [];
      for (const per of periodi) {
        const { data, error } = await db.rpc("contabilita_liquida_iva", { p_company: companyId, p_dal: per.dal, p_al: per.al, p_anteprima: true });
        if (error) throw error;
        risultati.push(data as EsitoLiquidazione);
      }
      return risultati;
    },
  });
  const registra = useMutation({
    mutationFn: async (per: { dal: string; al: string }) => {
      const { data, error } = await db.rpc("contabilita_liquida_iva", { p_company: companyId, p_dal: per.dal, p_al: per.al, p_anteprima: false });
      if (error) throw error;
      return data as EsitoLiquidazione;
    },
    onSuccess: (r) => {
      toast.success("Liquidazione registrata", {
        description: r.da_versare > 0 ? `IVA da versare ${euro(r.da_versare)}: il pagamento dell'F24 la chiude.` : `IVA a credito ${euro(r.a_credito)}.`,
      });
      void qc.invalidateQueries({ queryKey: chiave(companyId) });
    },
    onError: (e) => toast.error("Liquidazione non registrata", { description: e instanceof Error ? e.message : String(e) }),
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Select value={trimestrale ? "t" : "m"} onValueChange={(v) => setTrimestrale(v === "t")}>
          <SelectTrigger className="h-8 w-40" aria-label="Periodicità"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="m">Mensile</SelectItem>
            <SelectItem value="t">Trimestrale</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-muted-foreground">
          Gli importi sono l'IVA non ancora liquidata a fine periodo: genera prima dai documenti. Il credito di un periodo abbatte il debito dei successivi; sotto 25,82 € il debito passa al periodo dopo.
        </span>
      </div>
      {esiti.isLoading || esiti.isError ? (
        <FiscalQueryState loading={esiti.isLoading} error={esiti.isError} onRetry={() => void esiti.refetch()} />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-2">Periodo</th><th className="p-2 text-right">IVA vendite</th><th className="p-2 text-right">IVA acquisti</th><th className="p-2 text-right">Credito precedente usato</th><th className="p-2 text-right">Da versare</th><th className="p-2 text-right">A credito</th><th className="p-2" /></tr>
            </thead>
            <tbody>
              {periodi.map((per, i) => {
                const r = esiti.data?.[i];
                if (!r) return null;
                const vuoto = r.iva_vendite === 0 && r.iva_acquisti === 0;
                // In ordine: il credito di un periodo entra nel successivo solo se è registrato.
                const primaInSospeso = periodi.slice(0, i).some((_, j) => {
                  const q = esiti.data?.[j];
                  return q && !q.gia_liquidato && !q.sotto_minimo && (q.iva_vendite !== 0 || q.iva_acquisti !== 0);
                });
                return (
                  <tr key={per.dal} className="border-t">
                    <td className="p-2 capitalize">{per.nome}</td>
                    <td className="p-2 text-right tabular-nums">{euro(r.iva_vendite)}</td>
                    <td className="p-2 text-right tabular-nums">{euro(r.iva_acquisti)}</td>
                    <td className="p-2 text-right tabular-nums text-muted-foreground">{r.compensato ? euro(r.compensato) : ""}</td>
                    <td className="p-2 text-right font-medium tabular-nums">{r.da_versare ? euro(r.da_versare) : ""}</td>
                    <td className="p-2 text-right tabular-nums">{r.a_credito ? euro(r.a_credito) : ""}</td>
                    <td className="p-2 text-right">
                      {r.gia_liquidato ? (
                        <span className="rounded bg-emerald-50 px-1.5 text-xs text-emerald-800">registrata</span>
                      ) : vuoto ? null : r.sotto_minimo ? (
                        <span className="text-xs text-muted-foreground" title="Sotto 25,82 € non si versa">passa al periodo dopo</span>
                      ) : (
                        <Button size="sm" variant="outline" disabled={registra.isPending || primaInSospeso}
                          title={primaInSospeso ? "Prima registra i periodi precedenti" : undefined}
                          onClick={() => registra.mutate(per)}>Registra</Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface StatoEsercizioRiga { anno: number; chiuso_il: string | null; stampato_fino_al: string | null; stampe: Array<{ dal: string; al: string; scritture: number; il: string }> }

function useEsercizio(companyId: string | undefined, anno: number) {
  return useQuery({
    queryKey: chiave(companyId, "esercizio", anno),
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await db.from("contabilita_esercizi").select("anno, chiuso_il, stampato_fino_al, stampe")
        .eq("company_id", companyId).eq("anno", anno).maybeSingle();
      if (error) throw error;
      return (data ?? null) as StatoEsercizioRiga | null;
    },
  });
}

/** Una riga sopra le viste: l'esercizio è chiuso, o il giornale è stampato in definitivo fino a…. */
function StatoEsercizio({ companyId, anno }: { companyId: string | undefined; anno: number }) {
  const e = useEsercizio(companyId, anno).data;
  if (!e || (!e.chiuso_il && !e.stampato_fino_al)) return null;
  return (
    <p className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
      <Lock className="h-4 w-4 text-slate-500" />
      {e.chiuso_il
        ? `Esercizio ${anno} chiuso il ${dataIt(e.chiuso_il.slice(0, 10))}: non si registra più niente con data ${anno}.`
        : `Libro giornale stampato in definitivo fino al ${dataIt(e.stampato_fino_al!)}: le nuove scritture vanno dopo quel giorno.`}
    </p>
  );
}

/** Stampa definitiva: fissa il giorno, poi apre la stampa del tratto nuovo (numeri e riporto dall'inizio dell'anno). */
function StampaDefinitiva({ open, onOpenChange, companyId, anno, onStampa }: {
  open: boolean; onOpenChange: (v: boolean) => void; companyId: string; anno: number; onStampa: (dal: string, al: string) => void;
}) {
  const qc = useQueryClient();
  const esercizio = useEsercizio(companyId, anno).data;
  const fineAnno = `${anno}-12-31`;
  const [al, setAl] = useState(() => (oggi() < fineAnno ? oggi() : fineAnno));
  const dal = esercizio?.stampato_fino_al
    ? new Date(Date.parse(`${esercizio.stampato_fino_al}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)
    : `${anno}-01-01`;
  const fissa = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("contabilita_stampa_definitiva", { p_company: companyId, p_anno: anno, p_al: al });
      if (error) throw error;
      return data as { dal: string; al: string; scritture: number };
    },
    onSuccess: (r) => {
      toast.success("Libro giornale stampato in definitivo", { description: `${r.scritture} scritture dal ${dataIt(r.dal)} al ${dataIt(r.al)}: quei giorni ora sono bloccati.` });
      void qc.invalidateQueries({ queryKey: chiave(companyId, "esercizio", anno) });
      onOpenChange(false);
      onStampa(r.dal, r.al);
    },
    onError: (e) => toast.error("Stampa definitiva non fatta", { description: e instanceof Error ? e.message : String(e) }),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Stampa definitiva del libro giornale</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p>
            Si stampano le scritture dal <strong>{dataIt(dal)}</strong> al giorno che scegli, con la numerazione e il riporto
            dall'inizio dell'esercizio. Dopo, <strong>nessuna scrittura potrà avere una data fino a quel giorno</strong>:
            le correzioni andranno registrate dopo.
          </p>
          <div className="space-y-1">
            <Label>Fino al</Label>
            <Input type="date" value={al} min={dal} max={oggi() < fineAnno ? oggi() : fineAnno} onChange={(e) => setAl(e.target.value)} />
          </div>
          {esercizio?.stampe?.length ? (
            <p className="text-xs text-muted-foreground">
              Stampe già fatte: {esercizio.stampe.map((x) => `${dataIt(x.dal)}–${dataIt(x.al)}`).join(", ")}.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={() => fissa.mutate()} disabled={fissa.isPending || !al || al < dal}>Blocca e stampa</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface QuotaAmmortamento { cespite: string; codice: string | null; costo: number; aliquota: number; fondo_inizio: number; quota: number; residuo: number }
interface EsitoFineAnno {
  ammortamenti: QuotaAmmortamento[]; totale_ammortamenti: number; retribuzioni: number; tfr: number;
  ammortamenti_registrati: boolean; tfr_registrato: boolean;
}
interface EsitoChiusura {
  utile: number; conti_economici: number; conti_patrimoniali: number; apertura_gia_presente: boolean;
  iva_non_liquidata?: number; ammortamenti_da_registrare?: boolean; tfr_da_registrare?: boolean;
}

/**
 * Fine anno: ammortamenti dei cespiti (dal registro del Controllo di gestione) e TFR dai
 * cedolini, poi la chiusura dell'esercizio con la riapertura dei conti al 1° gennaio.
 */
function FineAnno({ companyId, anno }: { companyId: string; anno: number }) {
  const qc = useQueryClient();
  const esercizio = useEsercizio(companyId, anno);
  const chiuso = !!esercizio.data?.chiuso_il;
  const [conferma, setConferma] = useState(false);
  const [riapri, setRiapri] = useState(false);
  const [motivo, setMotivo] = useState("");
  const fine = useQuery({
    queryKey: chiave(companyId, "fine-anno", anno),
    queryFn: async () => {
      const { data, error } = await db.rpc("contabilita_fine_anno", { p_company: companyId, p_anno: anno, p_anteprima: true });
      if (error) throw error;
      return data as EsitoFineAnno;
    },
  });
  const chiusura = useQuery({
    queryKey: chiave(companyId, "chiusura", anno),
    enabled: !chiuso,
    queryFn: async () => {
      const { data, error } = await db.rpc("contabilita_chiudi_esercizio", { p_company: companyId, p_anno: anno, p_anteprima: true });
      if (error) throw error;
      return data as EsitoChiusura;
    },
  });
  const aggiorna = (): void => { void qc.invalidateQueries({ queryKey: chiave(companyId) }); };
  const registraFine = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("contabilita_fine_anno", { p_company: companyId, p_anno: anno, p_anteprima: false });
      if (error) throw error;
      return data as EsitoFineAnno & { registrate: string[] };
    },
    onSuccess: (r) => {
      toast.success(r.registrate.length ? `Registrati: ${r.registrate.join(" e ")}` : "Niente di nuovo da registrare");
      aggiorna();
    },
    onError: (e) => toast.error("Scritture di fine anno non registrate", { description: e instanceof Error ? e.message : String(e) }),
  });
  const chiudi = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("contabilita_chiudi_esercizio", { p_company: companyId, p_anno: anno, p_anteprima: false });
      if (error) throw error;
      return data as EsitoChiusura & { apertura_registrata: boolean };
    },
    onSuccess: (r) => {
      toast.success(`Esercizio ${anno} chiuso`, {
        description: `${r.utile >= 0 ? "Utile" : "Perdita"} ${euro(Math.abs(r.utile))}. ${r.apertura_registrata
          ? `Conti riaperti al 01/01/${anno + 1}.` : `Il ${anno + 1} aveva già una scrittura di apertura: non ne è stata fatta un'altra.`}`,
        duration: 12000,
      });
      setConferma(false);
      aggiorna();
    },
    onError: (e) => toast.error("Esercizio non chiuso", { description: e instanceof Error ? e.message : String(e) }),
  });
  const riapriM = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("contabilita_riapri_esercizio", { p_company: companyId, p_anno: anno, p_motivo: motivo });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(`Esercizio ${anno} riaperto: chiusura e apertura stornate`); setRiapri(false); setMotivo(""); aggiorna(); },
    onError: (e) => toast.error("Esercizio non riaperto", { description: e instanceof Error ? e.message : String(e) }),
  });

  if (fine.isLoading || fine.isError) {
    return <FiscalQueryState loading={fine.isLoading} error={fine.isError} onRetry={() => void fine.refetch()} />;
  }
  const f = fine.data!;
  const daRegistrare = (f.totale_ammortamenti > 0 && !f.ammortamenti_registrati) || (f.tfr > 0 && !f.tfr_registrato);
  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">1. Ammortamenti e TFR al 31/12/{anno}</h3>
          <Button size="sm" variant="outline" disabled={chiuso || !daRegistrare || registraFine.isPending} onClick={() => registraFine.mutate()}>
            {registraFine.isPending ? "Registrazione…" : "Registra"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          I cespiti sono quelli del registro in Controllo di gestione: quote costanti, metà nel primo anno, fino a esaurire il costo.
          Il TFR è un tredicesimo e mezzo delle retribuzioni lorde dei cedolini ({euro(f.retribuzioni)}), senza rivalutazione.
        </p>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-2">Cespite</th><th className="p-2 text-right">Costo</th><th className="p-2 text-right">Aliquota</th><th className="p-2 text-right">Fondo a inizio anno</th><th className="p-2 text-right">Quota {anno}</th><th className="p-2 text-right">Residuo</th></tr>
            </thead>
            <tbody>
              {f.ammortamenti.length === 0 ? (
                <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Nessun cespite da ammortizzare nel {anno}.</td></tr>
              ) : f.ammortamenti.map((q, i) => (
                <tr key={`${q.codice ?? ""}-${i}`} className="border-t">
                  <td className="p-2">{q.codice ? <span className="mr-2 font-mono text-xs">{q.codice}</span> : null}{q.cespite}</td>
                  <td className="p-2 text-right tabular-nums">{euro(q.costo)}</td>
                  <td className="p-2 text-right tabular-nums">{q.aliquota}%</td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">{euro(q.fondo_inizio)}</td>
                  <td className="p-2 text-right font-medium tabular-nums">{euro(q.quota)}</td>
                  <td className="p-2 text-right tabular-nums">{euro(q.residuo)}</td>
                </tr>
              ))}
              <tr className="border-t bg-muted/30 font-medium">
                <td className="p-2">Totale ammortamenti {f.ammortamenti_registrati ? "· registrati" : ""}</td>
                <td colSpan={3} /><td className="p-2 text-right tabular-nums">{euro(f.totale_ammortamenti)}</td><td />
              </tr>
              <tr className="border-t font-medium">
                <td className="p-2">Accantonamento TFR {f.tfr_registrato ? "· registrato" : ""}</td>
                <td colSpan={3} /><td className="p-2 text-right tabular-nums">{euro(f.tfr)}</td><td />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Ratei, risconti e rimanenze finali si registrano con «Nuova scrittura» (causali Rateo, Risconto, Rettifica).
        </p>
      </section>

      <section className="space-y-2 rounded-xl border p-4">
        <h3 className="text-sm font-semibold">2. Chiusura dell'esercizio {anno}</h3>
        {chiuso ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>Chiuso il {dataIt(esercizio.data!.chiuso_il!.slice(0, 10))}. Costi e ricavi sono girati sull'utile, i conti sono riaperti al 01/01/{anno + 1}.</span>
            <Button size="sm" variant="outline" onClick={() => setRiapri(true)}>Riapri l'esercizio</Button>
          </div>
        ) : chiusura.isLoading || chiusura.isError ? (
          <FiscalQueryState loading={chiusura.isLoading} error={chiusura.isError} onRetry={() => void chiusura.refetch()} />
        ) : (
          <div className="space-y-2 text-sm">
            <p>
              {chiusura.data!.utile >= 0 ? "Utile" : "Perdita"} dell'esercizio: <strong>{euro(Math.abs(chiusura.data!.utile))}</strong>
              {" "}· {chiusura.data!.conti_economici} conti economici da chiudere · {chiusura.data!.conti_patrimoniali} conti patrimoniali da riaprire
              {chiusura.data!.apertura_gia_presente ? ` · il ${anno + 1} ha già la sua apertura (non se ne farà un'altra)` : ""}.
            </p>
            {(chiusura.data!.iva_non_liquidata ?? 0) !== 0 || chiusura.data!.ammortamenti_da_registrare || chiusura.data!.tfr_da_registrare ? (
              <ul className="list-disc rounded-lg border border-amber-200 bg-amber-50 py-2 pl-6 pr-3 text-amber-900">
                {(chiusura.data!.iva_non_liquidata ?? 0) !== 0 ? <li>C'è IVA non ancora liquidata: registra la liquidazione dell'ultimo periodo (la chiusura la rifiuta).</li> : null}
                {chiusura.data!.ammortamenti_da_registrare ? <li>Ammortamenti non registrati.</li> : null}
                {chiusura.data!.tfr_da_registrare ? <li>Accantonamento TFR non registrato.</li> : null}
              </ul>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Prima di chiudere: tutto generato dai documenti, liquidazioni IVA registrate, ammortamenti e TFR fatti, ratei e risconti scritti.
              Dopo, l'anno è bloccato: per correggere si riapre.
            </p>
            <Button size="sm" onClick={() => setConferma(true)} disabled={chiudi.isPending || (chiusura.data!.iva_non_liquidata ?? 0) !== 0}>Chiudi l'esercizio {anno}</Button>
          </div>
        )}
      </section>

      <Dialog open={conferma} onOpenChange={setConferma}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Chiudere l'esercizio {anno}?</DialogTitle></DialogHeader>
          <p className="text-sm">
            Costi e ricavi del {anno} si girano sull'utile al 31/12, i conti patrimoniali si riaprono al 01/01/{anno + 1} (il risultato fra gli utili portati a nuovo) e
            nel {anno} non si potrà più registrare niente finché non lo riapri.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConferma(false)}>Annulla</Button>
            <Button onClick={() => chiudi.mutate()} disabled={chiudi.isPending}>{chiudi.isPending ? "Chiusura…" : "Chiudi"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={riapri} onOpenChange={setRiapri}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Riaprire l'esercizio {anno}?</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            <p>Chiusura e apertura vengono stornate (restano nel giornale) e il {anno} torna modificabile.</p>
            <Label>Motivo</Label>
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Fattura arrivata dopo la chiusura" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRiapri(false)}>Annulla</Button>
            <Button onClick={() => riapriM.mutate()} disabled={riapriM.isPending || !motivo.trim()}>Riapri</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
