import { QualitaRender } from "@/components/render/QualitaRender";
import { materialiDelProgetto, descrizionePavimento } from "../../../shared/planimetrie/materialiProgetto.ts";
/**
 * Render in serie (Planimetrie, seconda parte B3–B4): tutte le stanze con uno stile, oppure una
 * stanza con due o tre stili da confrontare. Si parte dalla vista 3D dentro ogni stanza, come
 * «Fai il render di questa stanza»; il costo in crediti si vede prima di partire.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Sparkles, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IDEE_PRONTE } from "@/modules/render-stanza/lib/ideePronte";
import { chiaviRenderPianta } from "@/lib/planimetrie/render/renderDallaPianta";
import { avviaRenderStanza, lavoriDaFare, statoSessioni, type LavoroRender, type StatoLavoro } from "@/lib/planimetrie/render/renderInSerie";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";

const MAX_IDEE = 3;
const IN_PARALLELO = 2;

interface Props {
  aperto: boolean;
  onChiudi: () => void;
  planimetriaId: string;
  versione: number;
  documento: Planimetria;
  livelloId: string;
  ambito: string;
  stanze: Array<{ id: string; nome: string; destinazione: string }>;
  /** Con più piani: tutte le stanze dell'edificio, col piano (per «Tutti i piani»). */
  stanzeEdificio?: Array<{ id: string; nome: string; destinazione: string; livelloId: string; piano: string }>;
  /** Aperto da una stanza: solo quella, con più stili. */
  soloStanza?: string | null;
}

interface Riga { lavoro: LavoroRender; stato: StatoLavoro; sessione?: string; url?: string; errore?: string }

export function RenderInSerieDialog({ aperto, onChiudi, planimetriaId, versione, documento, livelloId, ambito, stanze: stanzePiano, stanzeEdificio, soloStanza }: Props) {
  const [tuttiIPiani, setTuttiIPiani] = useState(false);
  const edificio = !soloStanza && (stanzeEdificio?.length ?? 0) > stanzePiano.length;
  const stanze: Array<{ id: string; nome: string; destinazione: string; livelloId?: string; piano?: string }> = edificio && tuttiIPiani ? stanzeEdificio! : stanzePiano;
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [scelte, setScelte] = useState<Set<string>>(new Set());
  const [idee, setIdee] = useState<string[]>([IDEE_PRONTE[0].id]);
  const [nota, setNota] = useState("");
  const [qualita, setQualita] = useState<"standard" | "alta">("standard");
  const comuni = materialiDelProgetto(documento, ambito);
  const [righe, setRighe] = useState<Riga[] | null>(null);
  const annullato = useRef(false);

  const inCorsoRef = useRef(false);
  const aperturaPrecedente = useRef(false);
  useEffect(() => {
    // riaperto mentre i render vanno ancora: si rivede l'avanzamento, non si riparte da capo
    if (!aperto) { aperturaPrecedente.current = false; return; }
    if (aperturaPrecedente.current) return;
    aperturaPrecedente.current = true;
    if (inCorsoRef.current) return;
    setRighe(null);
    annullato.current = false;
    setScelte(new Set(soloStanza ? [soloStanza] : stanze.map((s) => s.id)));
    setIdee(soloStanza ? IDEE_PRONTE.slice(0, 3).map((i) => i.id) : [IDEE_PRONTE[0].id]);
  }, [aperto, soloStanza, stanze]);

  const crediti = useQuery({
    queryKey: ["render-credits", companyId],
    enabled: aperto && !!companyId,
    queryFn: async () => {
      const { data } = await supabase.from("render_credits").select("balance, unlimited").eq("company_id", companyId!).maybeSingle();
      return (data as { balance: number; unlimited: boolean } | null) ?? { balance: 0, unlimited: false };
    },
  });

  const lavori = useMemo(
    () => lavoriDaFare(stanze.filter((s) => scelte.has(s.id)), IDEE_PRONTE.filter((i) => idee.includes(i.id))),
    [stanze, scelte, idee],
  );
  const costo = lavori.length;
  const bastano = crediti.data?.unlimited || (crediti.data?.balance ?? 0) >= costo;
  const inCorso = !!righe && righe.some((r) => r.stato === "in_coda" || r.stato === "preparo" || r.stato === "in_corso");
  useEffect(() => { inCorsoRef.current = inCorso; }, [inCorso]);

  // Controllo delle sessioni avviate finché non finiscono.
  useEffect(() => {
    if (!righe?.some((r) => r.stato === "in_corso" && r.sessione)) return;
    const t = setTimeout(async () => {
      const ids = righe.filter((r) => r.stato === "in_corso" && r.sessione).map((r) => r.sessione!);
      const stati = await statoSessioni(ids).catch((): null => null);
      if (!stati) return;
      setRighe((rs) => rs?.map((r) => {
        const s = r.sessione ? stati.get(r.sessione) : undefined;
        return s && s.stato !== "in_corso" ? { ...r, ...s } : r;
      }) ?? rs);
      if ([...stati.values()].some((s) => s.stato === "pronto")) {
        queryClient.invalidateQueries({ queryKey: chiaviRenderPianta.dellaPianta(planimetriaId) });
        queryClient.invalidateQueries({ queryKey: ["render-credits", companyId] });
      }
    }, 6000);
    return () => clearTimeout(t);
  }, [righe, planimetriaId, companyId, queryClient]);

  const parti = async (soloFalliti = false) => {
    if (!companyId || !user || !lavori.length) return;
    annullato.current = false;
    const daAvviare = soloFalliti ? (righe ?? []).filter((r) => r.stato === "fallito").map((r) => r.lavoro) : lavori;
    const iniziali: Riga[] = daAvviare.map((lavoro) => ({ lavoro, stato: "in_coda" }));
    setRighe((rs) => soloFalliti ? rs?.map((r) => iniziali.find((n) => n.lavoro.chiave === r.lavoro.chiave) ?? r) ?? iniziali : iniziali);
    const aggiorna = (chiave: string, campi: Partial<Riga>) => setRighe((rs) => rs?.map((r) => (r.lavoro.chiave === chiave ? { ...r, ...campi } : r)) ?? rs);
    const coda = [...daAvviare];
    const ctx = { companyId, userId: user.id, planimetriaId, versione, documento, livelloId, ambito, nota, qualita_render: qualita };
    let creditiFiniti = false;
    const operaio = async () => {
      for (let l = coda.shift(); l; l = coda.shift()) {
        if (annullato.current || creditiFiniti) { aggiorna(l.chiave, { stato: "fallito", errore: creditiFiniti ? "Crediti finiti" : "Fermato" }); continue; }
        aggiorna(l.chiave, { stato: "preparo" });
        try {
          const sessione = await avviaRenderStanza(ctx, l);
          aggiorna(l.chiave, { stato: "in_corso", sessione });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Non avviato";
          if (/crediti/i.test(msg)) creditiFiniti = true;
          aggiorna(l.chiave, { stato: "fallito", errore: msg });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(IN_PARALLELO, daAvviare.length) }, operaio));
    queryClient.invalidateQueries({ queryKey: ["render-credits", companyId] });
    if (creditiFiniti) toast.error("Crediti render finiti: alcune stanze non sono partite.");
  };

  const scegliIdea = (id: string) => setIdee((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : xs.length >= MAX_IDEE ? xs : [...xs, id]));
  const fatti = righe?.filter((r) => r.stato === "pronto").length ?? 0;

  return (
    <Dialog open={aperto} onOpenChange={(v) => { if (!v) onChiudi(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />{soloStanza ? "Più stili per questa stanza" : "Render di tutte le stanze"}</DialogTitle>
          <DialogDescription>
            Si parte dalla vista 3D dentro ogni stanza: misure, porte, finestre e arredi della pianta restano dove sono. Un render costa un credito; se non riesce il credito torna.
          </DialogDescription>
        </DialogHeader>

        {!righe ? (
          <div className="space-y-5">
            <QualitaRender value={qualita} onChange={setQualita} />
            {(comuni.pavimento || comuni.infissi) && <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">Tutte le stanze seguiranno i materiali comuni del progetto.{comuni.pavimento ? ` Pavimento: ${descrizionePavimento(comuni.pavimento)}.` : ""} Gli stili selezionati mantengono queste scelte.</p>}
            {!soloStanza && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label className="text-sm font-semibold">Stanze</Label>
                  {edificio && (
                    <label className="flex cursor-pointer items-center gap-2 text-xs">
                      <Checkbox checked={tuttiIPiani} onCheckedChange={(v) => { const tutti = !!v; setTuttiIPiani(tutti); setScelte(new Set((tutti ? stanzeEdificio! : stanzePiano).map((s) => s.id))); }} />
                      Tutti i piani ({stanzeEdificio!.length} stanze)
                    </label>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {stanze.map((s) => (
                    <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm">
                      <Checkbox checked={scelte.has(s.id)} onCheckedChange={(v) => setScelte((x) => { const n = new Set(x); if (v) n.add(s.id); else n.delete(s.id); return n; })} />
                      <span className="truncate">{s.nome}{s.piano && <span className="text-xs text-muted-foreground"> · {s.piano}</span>}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Stile {soloStanza ? `(fino a ${MAX_IDEE}, da confrontare)` : `— uno per tutta la casa, o fino a ${MAX_IDEE} per confrontarli`}</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {IDEE_PRONTE.filter((i) => !i.stanze).map((idea) => {
                  const on = idee.includes(idea.id);
                  return (
                    <button key={idea.id} type="button" aria-pressed={on} onClick={() => scegliIdea(idea.id)}
                      className={`rounded-lg border p-2.5 text-left transition-all ${on ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/60"}`}>
                      <div className="mb-1.5 flex h-5 overflow-hidden rounded">{idea.tavolozza.map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}</div>
                      <p className="text-xs font-semibold">{idea.nome}</p>
                      <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{idea.descrizione}</p>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="serie-nota" className="text-xs">Qualcosa da aggiungere per tutte (facoltativo)</Label>
              <Textarea id="serie-nota" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Es. luce del tramonto, piante verdi, nessuna persona" className="text-xs" />
            </div>
            <div className={`rounded-lg border p-3 text-sm ${bastano ? "bg-muted/40" : "border-amber-300 bg-amber-50"}`}>
              <strong>{costo} render</strong> = {costo} {costo === 1 ? "credito" : "crediti"}
              {crediti.data && !crediti.data.unlimited && <> · ne hai {crediti.data.balance}</>}
              {!bastano && <> · <Link to="/azienda/impostazioni/abbonamento?tab=portafoglio" className="underline">ricarica</Link> o scegli meno stanze</>}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{fatti} di {righe.length} pronti. Puoi chiudere questa finestra: i render vanno avanti e finiscono tra i render della pianta.</p>
            <ul className="divide-y rounded-lg border">
              {righe.map((r) => (
                <li key={r.lavoro.chiave} className="flex items-center gap-3 p-2 text-sm">
                  {r.url ? <a href={`/azienda/render/stanza/gallery/${r.sessione}`} aria-label={`Apri render di ${r.lavoro.localeNome}`}><img src={r.url} alt={`Render di ${r.lavoro.localeNome}`} className="h-12 w-16 rounded object-cover" /></a> : <div className="h-12 w-16 rounded bg-muted" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.lavoro.localeNome}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.lavoro.idea.nome}</p>
                  </div>
                  {r.stato === "pronto" ? <CheckCircle2 className="h-5 w-5 text-green-600" />
                    : r.stato === "fallito" ? <span className="flex items-center gap-1 text-xs text-destructive"><XCircle className="h-4 w-4" />{r.errore}</span>
                    : <span className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{r.stato === "in_coda" ? "in coda" : r.stato === "preparo" ? "preparo la vista" : "l'AI lavora"}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          {!righe ? (
            <Button className="gap-2 bg-primary hover:bg-primary/90" disabled={!lavori.length || !bastano || !companyId} onClick={() => void parti()}>
              <Sparkles className="h-4 w-4" />Fai {costo} render
            </Button>
          ) : (
            <><Button variant="outline" onClick={onChiudi}>{inCorso ? "Chiudi (continuano da soli)" : "Chiudi"}</Button>{!inCorso && righe.some((r) => r.stato === "fallito") && <Button onClick={() => void parti(true)}>Riprova solo i render non riusciti</Button>}</>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
