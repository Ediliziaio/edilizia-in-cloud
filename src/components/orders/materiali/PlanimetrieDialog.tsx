/**
 * Tavole e conteggi: le planimetrie della commessa (PDF tra i documenti) e
 * quanti simboli ci sono, per locale.
 *   1. «Conta le sigle» legge il testo del PDF: sigle come PA, T, TG, C1…
 *      contate esattamente, legenda esclusa, assegnate al locale più vicino.
 *   2. «Conta i simboli disegnati» manda la tavola a riquadri all'AI con la
 *      legenda come guida: una stima con la sua affidabilità.
 *   3. «Disegno CAD»: un DXF (o DWG salvato come DXF) letto nel browser;
 *      blocchi contati esattamente e lunghezze per layer (DisegnoCadPannello).
 * Tutto entra come bozza: diventa materiale solo il conteggio confermato.
 */
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileUp, Hash, ScanSearch, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { attachmentStorage } from "@/components/orders/filePreviewUtils";
import { caricaDocumentoCommessa } from "@/lib/commesse/caricaDocumentoCommessa";
import { contaSigleDaTesto, type RisultatoConteggioTesto } from "@/lib/distinta/conteggioTesto";
import { disegnaRiquadri, estraiTestoTavola, sommaRiquadri } from "@/lib/distinta/tavolePdf";
import { chiaviMateriali } from "@/hooks/useMaterialiPerFase";
import DisegnoCadPannello from "./DisegnoCadPannello";

interface Tavola { id: string; file_name: string; file_url: string }
interface Conteggio {
  id: string; documento_id: string | null; documento_nome: string | null; phase_id: string | null; simbolo: string;
  descrizione_legenda: string | null; locale: string | null; quantita: number; metodo: string; confidenza: number | null; confermato: boolean;
}
/** Con l'unità: 'm' per le lunghezze dei disegni CAD, vuota = pezzi. */
type ConteggioLetto = Conteggio & { unita?: string | null };

const SENZA = "_senza";

async function scaricaTavola(t: Tavola): Promise<Uint8Array> {
  const { bucket, path } = attachmentStorage(t.file_url);
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw error ?? new Error("Tavola non scaricata");
  return new Uint8Array(await data.arrayBuffer());
}

export default function PlanimetrieDialog({ orderId, open, onOpenChange }: { orderId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id ?? "";
  const { canEditOrders, canValidateBom } = usePermissions();
  const puoScrivere = !!(canEditOrders || canValidateBom);
  const qc = useQueryClient();
  const chiave = ["planimetrie-conteggi", orderId];
  const inputFile = useRef<HTMLInputElement>(null);

  const dati = useQuery({
    queryKey: chiave,
    enabled: open,
    queryFn: async () => {
      const [tavole, conteggi, fasi] = await Promise.all([
        supabase.from("order_attachments").select("id, file_name, file_url").eq("order_id", orderId).ilike("file_name", "%.pdf").order("created_at", { ascending: false }),
        // «*»: la colonna unita arriva con la migrazione dei disegni CAD.
        supabase.from("planimetrie_conteggi").select("*")
          .eq("order_id", orderId).order("documento_nome").order("simbolo").order("locale"),
        supabase.from("order_work_phases").select("id, name").eq("order_id", orderId).order("position"),
      ]);
      if (tavole.error) throw tavole.error;
      if (conteggi.error) throw conteggi.error;
      return { tavole: (tavole.data ?? []) as Tavola[], conteggi: (conteggi.data ?? []) as unknown as ConteggioLetto[], fasi: fasi.data ?? [] };
    },
  });
  const aggiorna = () => {
    qc.invalidateQueries({ queryKey: chiave });
    qc.invalidateQueries({ queryKey: ["genera-materiali", orderId] });
    qc.invalidateQueries({ queryKey: chiaviMateriali.commessa(orderId) });
  };

  const carica = useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error("Accesso richiesto");
      await caricaDocumentoCommessa({ orderId, companyId, userId: user.id, file, tipo: "application/pdf" });
    },
    onSuccess: () => { toast.success("Tavola caricata tra i documenti della commessa"); aggiorna(); },
    onError: (e) => toast.error("Tavola non caricata", { description: e instanceof Error ? e.message : String(e) }),
  });

  const [tavolaId, setTavolaId] = useState<string | null>(null);
  const tavola = dati.data?.tavole.find((t) => t.id === tavolaId) ?? dati.data?.tavole[0] ?? null;
  const [lettura, setLettura] = useState<RisultatoConteggioTesto | null>(null);
  const [sceltaSigle, setSceltaSigle] = useState<Set<string>>(new Set());
  const [sceltaSimboli, setSceltaSimboli] = useState<Set<string>>(new Set());
  const [faseNuovi, setFaseNuovi] = useState<string>(SENZA);
  const [lavoro, setLavoro] = useState<string | null>(null);
  const [vista, setVista] = useState<"pdf" | "cad">("pdf");

  const leggi = async () => {
    if (!tavola) return;
    setLavoro("Leggo il testo della tavola…");
    try {
      const { testi } = await estraiTestoTavola(await scaricaTavola(tavola));
      const r = contaSigleDaTesto(testi);
      setLettura(r);
      setSceltaSigle(new Set(r.sigle.filter((s) => s.quantita >= 3).map((s) => s.sigla)));
      if (!r.sigle.length && !r.legenda.length) toast.info("Nessuna scritta leggibile: la tavola è probabilmente una scansione, usa i simboli con l'AI.");
    } catch (e) {
      toast.error("Tavola non letta", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLavoro(null);
    }
  };

  const salvaRighe = async (righe: Omit<Conteggio, "id" | "confermato">[]) => {
    if (!righe.length) return;
    const { error } = await supabase.from("planimetrie_conteggi").insert(righe.map((r) => ({ ...r, company_id: companyId, order_id: orderId })));
    if (error) throw error;
    aggiorna();
  };

  const salvaSigle = async () => {
    if (!lettura || !tavola) return;
    const righe: Omit<Conteggio, "id" | "confermato">[] = [];
    for (const s of lettura.sigle.filter((x) => sceltaSigle.has(x.sigla))) {
      for (const [locale, n] of Object.entries(s.perLocale)) {
        righe.push({
          documento_id: tavola.id, documento_nome: tavola.file_name, phase_id: faseNuovi === SENZA ? null : faseNuovi,
          simbolo: s.sigla, descrizione_legenda: s.descrizioneLegenda, locale: locale === "Senza locale" ? null : locale,
          quantita: n, metodo: "testo", confidenza: 1,
        });
      }
    }
    try {
      await salvaRighe(righe);
      toast.success(`${righe.length} conteggi salvati come bozza`, { description: "Controllali e confermali: solo i confermati diventano materiali." });
    } catch (e) {
      toast.error("Conteggi non salvati", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const contaSimboli = async () => {
    if (!tavola || !lettura) return;
    const legenda = lettura.legenda.filter((l) => sceltaSimboli.has(l));
    if (!legenda.length) return;
    const parziali: { simbolo: string; quantita: number; confidenza: number }[][] = [];
    let mandati = 0;
    try {
      await disegnaRiquadri(await scaricaTavola(tavola), {}, async (r, totale) => {
        setLavoro(`Riquadro ${r.riga}-${r.colonna} di ${totale}…`);
        if (r.pieno < 0.003) return;
        mandati++;
        const { data, error } = await supabase.functions.invoke("planimetria-conta-simboli", {
          body: { company_id: companyId, immagine: r.immagine, legenda, riquadro: { riga: r.riga, colonna: r.colonna } },
        });
        if (error) throw error;
        parziali.push(((data as { simboli?: { simbolo: string; quantita: number; confidenza: number }[] })?.simboli) ?? []);
      });
      const somma = sommaRiquadri(parziali);
      await salvaRighe(somma.map((s) => ({
        documento_id: tavola.id, documento_nome: tavola.file_name, phase_id: faseNuovi === SENZA ? null : faseNuovi,
        simbolo: s.simbolo, descrizione_legenda: s.simbolo, locale: null as string | null, quantita: s.quantita, metodo: "ai_immagine", confidenza: s.confidenza,
      })));
      toast.success(`Simboli contati su ${mandati} riquadri`, { description: "È una stima: controlla e conferma ogni conteggio." });
    } catch (e) {
      toast.error("Conteggio dei simboli non riuscito", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLavoro(null);
    }
  };

  const modifica = useMutation({
    mutationFn: async (p: { id: string; patch: Partial<Conteggio> }) => {
      const { error } = await supabase.from("planimetrie_conteggi").update(p.patch).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: aggiorna,
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  const elimina = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("planimetrie_conteggi").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: aggiorna,
  });
  const confermaTutti = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("planimetrie_conteggi").update({ confermato: true }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: aggiorna,
  });

  const conteggiTavola = useMemo(() => (dati.data?.conteggi ?? []).filter((c) => vista === "cad"
    // I disegni CAD: col documento se l'utente ha scelto di salvarlo, altrimenti senza.
    ? c.metodo === "dwg"
    : c.metodo !== "dwg" && (!tavola || c.documento_id === tavola.id)), [dati.data, tavola, vista]);
  const daConfermare = conteggiTavola.filter((c) => !c.confermato).map((c) => c.id);
  const fasi = dati.data?.fasi ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tavole e conteggi</DialogTitle>
          <DialogDescription>
            Conta sigle e simboli sulle planimetrie della commessa. Ogni conteggio è una bozza: confermalo e diventa materiale quando generi dal computo e dalle tavole.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 text-sm" role="tablist" aria-label="Tipo di tavola">
          <Button size="sm" role="tab" aria-selected={vista === "pdf"} variant={vista === "pdf" ? "default" : "outline"} className="h-8" onClick={() => setVista("pdf")}>Tavole PDF</Button>
          <Button size="sm" role="tab" aria-selected={vista === "cad"} variant={vista === "cad" ? "default" : "outline"} className="h-8" onClick={() => setVista("cad")}>Disegno CAD (DWG / DXF)</Button>
        </div>

        {vista === "cad" && (
          <DisegnoCadPannello orderId={orderId} companyId={companyId} fasi={fasi} puoScrivere={puoScrivere}
            onSalvati={aggiorna} />
        )}

        {vista === "pdf" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Select value={tavola?.id} onValueChange={(v) => { setTavolaId(v); setLettura(null); }}>
            <SelectTrigger className="h-8 w-80" aria-label="Tavola"><SelectValue placeholder="Nessuna tavola PDF nella commessa" /></SelectTrigger>
            <SelectContent>{(dati.data?.tavole ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.file_name}</SelectItem>)}</SelectContent>
          </Select>
          {puoScrivere && (
            <>
              <input ref={inputFile} type="file" accept=".pdf,application/pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) carica.mutate(f); e.target.value = ""; }} />
              <Button size="sm" variant="outline" className="h-8" disabled={carica.isPending} onClick={() => inputFile.current?.click()}>
                <FileUp className="mr-1.5 h-3.5 w-3.5" /> {carica.isPending ? "Carico…" : "Carica tavola PDF"}
              </Button>
              <Button size="sm" className="h-8" disabled={!tavola || !!lavoro} onClick={leggi}>
                <Hash className="mr-1.5 h-3.5 w-3.5" /> Conta le sigle
              </Button>
            </>
          )}
          {lavoro && <span role="status" className="text-xs text-slate-600">{lavoro}</span>}
        </div>
        )}

        {vista === "pdf" && lettura && puoScrivere && (
          <div className="grid gap-3 md:grid-cols-2">
            <section aria-label="Sigle trovate" className="rounded border p-2 text-sm">
              <h4 className="mb-1 font-semibold">Sigle scritte sulla tavola (conteggio esatto)</h4>
              {lettura.sigle.length ? (
                <ul className="max-h-64 space-y-1 overflow-auto">
                  {lettura.sigle.map((s) => (
                    <li key={s.sigla} className="flex items-start gap-2">
                      <Checkbox checked={sceltaSigle.has(s.sigla)} aria-label={`Salva ${s.sigla}`} onCheckedChange={(v) => {
                        const n = new Set(sceltaSigle); if (v) n.add(s.sigla); else n.delete(s.sigla); setSceltaSigle(n);
                      }} />
                      <div className="min-w-0">
                        <p><strong>{s.sigla}</strong> × {s.quantita}{s.inLegenda ? <span className="text-xs text-slate-500"> (+{s.inLegenda} in legenda, escluso)</span> : null}</p>
                        {s.descrizioneLegenda && <p className="text-xs text-slate-600">{s.descrizioneLegenda}</p>}
                        <p className="truncate text-[11px] text-slate-500" title={Object.entries(s.perLocale).map(([l, n]) => `${l}: ${n}`).join(", ")}>
                          {Object.entries(s.perLocale).map(([l, n]) => `${l} ${n}`).join(" · ")}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-xs text-slate-500">Nessuna sigla scritta: i simboli sono solo disegnati.</p>}
            </section>
            <section aria-label="Simboli della legenda" className="rounded border p-2 text-sm">
              <h4 className="mb-1 font-semibold">Simboli disegnati (stima dell'AI)</h4>
              <p className="mb-1 text-xs text-slate-500">Scegli dalla legenda i simboli da contare. La tavola va all'AI a riquadri: richiede qualche minuto e consuma credito AI.</p>
              <ul className="max-h-48 space-y-1 overflow-auto">
                {lettura.legenda.map((l) => (
                  <li key={l} className="flex items-center gap-2 text-xs">
                    <Checkbox checked={sceltaSimboli.has(l)} aria-label={l} onCheckedChange={(v) => {
                      const n = new Set(sceltaSimboli); if (v) n.add(l); else n.delete(l); setSceltaSimboli(n);
                    }} />
                    {l}
                  </li>
                ))}
              </ul>
            </section>
            <div className="flex flex-wrap items-center gap-2 md:col-span-2">
              <span className="text-sm">Fase dei conteggi</span>
              <Select value={faseNuovi} onValueChange={setFaseNuovi}>
                <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SENZA}>Senza fase</SelectItem>
                  {fasi.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" className="h-8" disabled={!sceltaSigle.size || !!lavoro} onClick={salvaSigle}>Salva le sigle scelte</Button>
              <Button size="sm" variant="outline" className="h-8" disabled={!sceltaSimboli.size || !!lavoro} onClick={contaSimboli}>
                <ScanSearch className="mr-1.5 h-3.5 w-3.5" /> Conta i simboli scelti con l'AI
              </Button>
            </div>
          </div>
        )}

        <section aria-label="Conteggi della tavola" className="text-sm">
          <div className="mb-1 flex items-center justify-between">
            <h4 className="font-semibold">Conteggi {vista === "cad" ? "dei disegni CAD" : tavola ? `di ${tavola.file_name}` : ""}</h4>
            {puoScrivere && daConfermare.length > 0 && (
              <Button size="sm" variant="outline" className="h-7" onClick={() => confermaTutti.mutate(daConfermare)}>Conferma tutti ({daConfermare.length})</Button>
            )}
          </div>
          {conteggiTavola.length ? (
            <div className="overflow-x-auto rounded border">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr><th className="px-2 py-1">Simbolo</th><th className="px-2 py-1">Locale</th><th className="px-2 py-1 text-right">Quantità</th><th className="px-2 py-1">Metodo</th><th className="px-2 py-1">Fase</th><th className="px-2 py-1">Confermato</th><th /></tr>
                </thead>
                <tbody className="divide-y">
                  {conteggiTavola.map((c) => (
                    <tr key={c.id} className={c.confermato ? "" : "bg-amber-50/40"}>
                      <td className="px-2 py-1"><strong>{c.simbolo}</strong>{c.descrizione_legenda && c.descrizione_legenda !== c.simbolo ? <span className="text-slate-500"> · {c.descrizione_legenda}</span> : null}{vista === "cad" && c.documento_nome ? <span className="block text-[10px] text-slate-400">{c.documento_nome}</span> : null}</td>
                      <td className="px-2 py-1">{c.locale ?? "—"}</td>
                      <td className="px-2 py-1 text-right">
                        {puoScrivere ? (
                          <Input className="ml-auto h-7 w-20 text-right tabular-nums" defaultValue={String(c.quantita)} aria-label={`Quantità ${c.simbolo}`}
                            onBlur={(e) => { const q = Number(e.target.value.replace(",", ".")); if (Number.isFinite(q) && q >= 0 && q !== Number(c.quantita)) modifica.mutate({ id: c.id, patch: { quantita: q, metodo: c.metodo === "testo" ? "testo" : "manuale" } }); }} />
                        ) : c.quantita}
                        {c.unita === "m" && <span className="text-slate-500"> m</span>}
                      </td>
                      <td className="px-2 py-1 text-slate-600">
                        {c.metodo === "testo" ? "Testo (esatto)" : c.metodo === "dwg" ? "Disegno CAD (esatto)" : c.metodo === "ai_immagine" ? `AI · ${Math.round(Number(c.confidenza ?? 0) * 100)}%` : c.metodo === "manuale" ? "A mano" : "Disegno"}
                      </td>
                      <td className="px-2 py-1">
                        <Select value={c.phase_id ?? SENZA} disabled={!puoScrivere} onValueChange={(v) => modifica.mutate({ id: c.id, patch: { phase_id: v === SENZA ? null : v } })}>
                          <SelectTrigger className="h-7 w-40"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SENZA}>Senza fase</SelectItem>
                            {fasi.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1">
                        <Checkbox checked={c.confermato} disabled={!puoScrivere} aria-label={`Conferma ${c.simbolo}`} onCheckedChange={(v) => modifica.mutate({ id: c.id, patch: { confermato: !!v } })} />
                      </td>
                      <td className="px-2 py-1">
                        {puoScrivere && <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Elimina ${c.simbolo}`} onClick={() => elimina.mutate(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-xs text-slate-500">Nessun conteggio per questa tavola.</p>}
        </section>
      </DialogContent>
    </Dialog>
  );
}
