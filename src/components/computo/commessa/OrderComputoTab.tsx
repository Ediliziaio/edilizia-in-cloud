/**
 * Scheda «Computo metrico» della commessa (22/10/2026, 2D S.r.l, lavori pubblici).
 *
 * Carica il computo (PDF di PriMus, XPWE, Excel) → lo legge (PriMus e XPWE senza
 * AI) → mostra il controllo dei totali contro il documento → lo tiene legato
 * alla commessa. Poi: albero dei capitoli con subtotali, libretto delle misure
 * di ogni voce, ricerca, stato (bozza → verificato → contrattuale, che blocca),
 * dati da lavoro pubblico con il quadro economico, esportazione Excel e PDF.
 */
import { useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, FileDown, FileSpreadsheet, Loader2, Lock, Search, Upload, XCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ComputoAlbero, type EvidenzaVoce } from "./ComputoAlbero";
import { filtraVoci, numeroVoce, type VoceComputo } from "@/lib/computo/alberoComputo";
import { controllaTotali, formatEuro, type ComputoVoceStrutturata, type ControlloTotali } from "@/lib/computo/computoStrutturato";
import { quadroEconomico } from "@/lib/computo/quadroEconomico";
import {
  computoInLettura, computoLetto, useCaricaComputo, useComputiCommessa, useModificaComputo, useScartaComputo, useVociComputo,
  type ComputoCommessa, type ModificaComputo, type StatoComputo,
} from "@/hooks/useComputoCommessa";

const euro = (n: number | null | undefined) => n == null ? "—" : `${formatEuro(n)} €`;
const ETICHETTA_STATO: Record<StatoComputo, string> = { bozza: "Bozza", verificato: "Verificato", contrattuale: "Contrattuale", archiviato: "Archiviato" };
const COLORE_STATO: Record<StatoComputo, string> = {
  bozza: "border-slate-300 text-slate-700", verificato: "border-sky-300 text-sky-800",
  contrattuale: "border-emerald-400 bg-emerald-50 text-emerald-800", archiviato: "border-slate-200 text-slate-500",
};

function Caricamento({ orderId, companyId, sostituisce, onFatto }: { orderId: string; companyId: string; sostituisce?: ComputoCommessa | null; onFatto?: () => void }) {
  const { user } = useAuth();
  const carica = useCaricaComputo(orderId, companyId, user?.id);
  const modifica = useModificaComputo(orderId, companyId);
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [titolo, setTitolo] = useState("");
  const avvia = async () => {
    if (!file) return;
    try {
      if (sostituisce && sostituisce.stato !== "bozza") await modifica.mutateAsync({ id: sostituisce.id, modifica: { stato: "archiviato" } });
      await carica.mutateAsync({ file, titolo });
      setFile(null); setTitolo(""); onFatto?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Caricamento non riuscito.");
    }
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Carica il computo metrico così com'è: il <strong>PDF stampato da PriMus</strong> e l'<strong>XPWE</strong> si leggono voce per voce, con le
        righe di misura, e i totali vengono confrontati con quelli del documento. Va bene anche l'Excel. Il file <strong>.dcf</strong> no:
        in PriMus scegli File › Esporta › formato XPWE.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <Label htmlFor="computo-titolo">Nome del computo</Label>
          <Input id="computo-titolo" value={titolo} onChange={e => setTitolo(e.target.value)} placeholder={file?.name.replace(/\.[^.]+$/, "") || "Es. Computo di progetto esecutivo"} />
        </div>
        <input ref={input} type="file" className="hidden" accept=".pdf,.xpwe,.xml,.xlsx,.xls,.dcf"
          onChange={e => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
        <Button type="button" variant="outline" onClick={() => input.current?.click()} disabled={carica.isPending}>
          <Upload className="mr-2 h-4 w-4" />{file ? "Cambia file" : "Scegli il file"}
        </Button>
        <Button type="button" onClick={avvia} disabled={!file || carica.isPending}>
          {carica.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Carica e leggi
        </Button>
      </div>
      {file && <p className="text-xs text-slate-500">File scelto: {file.name} ({(file.size / 1024 / 1024).toLocaleString("it-IT", { maximumFractionDigits: 1 })} MB)</p>}
      {sostituisce && sostituisce.stato !== "bozza" && <p className="text-xs text-amber-700">Il computo attuale («{sostituisce.titolo || sostituisce.file_name}») verrà archiviato, non cancellato.</p>}
    </div>
  );
}

function EsitoControllo({ controllo, onApriVoce }: { controllo: ControlloTotali; onApriVoce: (numero: string) => void }) {
  const [tutte, setTutte] = useState(false);
  const differenze = controllo.voci;
  const capitoliKo = controllo.capitoli.filter(c => !c.ok);
  const visibili = tutte ? differenze : differenze.slice(0, 8);
  return (
    <div role="status" className={controllo.ok ? "rounded-lg border border-emerald-300 bg-emerald-50 p-3" : "rounded-lg border border-amber-300 bg-amber-50 p-3"}>
      <p className="flex items-start gap-2 text-sm font-medium">
        {controllo.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />}
        <span>{controllo.sintesi}</span>
      </p>
      {controllo.ok && controllo.capitoli.length > 0 && <p className="mt-1 pl-6 text-xs text-emerald-800">Tutti i {controllo.capitoli.length} capitoli tornano con il riepilogo del documento; quantità × prezzo e righe di misura tornano voce per voce.</p>}
      {visibili.length > 0 && (
        <ul className="mt-2 space-y-1 pl-6 text-sm">
          {visibili.map((d, i) => (
            <li key={`${d.numero_ordine}-${d.tipo}-${i}`}>
              <button type="button" className="font-medium text-amber-900 underline underline-offset-2" onClick={() => onApriVoce(d.numero_ordine)}>Voce {d.numero_ordine}</button>
              <span className="text-amber-900">: {d.messaggio}</span>
            </li>
          ))}
          {differenze.length > visibili.length && <li><button type="button" className="text-xs underline" onClick={() => setTutte(true)}>Mostra tutte ({differenze.length})</button></li>}
        </ul>
      )}
      {capitoliKo.length > 0 && (
        <ul className="mt-2 space-y-1 pl-6 text-sm text-amber-900">
          {capitoliKo.map(c => <li key={`${c.livello}-${c.codice}`}>Capitolo «{c.nome}»: nel riepilogo {euro(c.dichiarato)}, dalle voci {euro(c.calcolato)} (differenza {euro(c.differenza)}).</li>)}
        </ul>
      )}
    </div>
  );
}

function LavoroPubblico({ computo, totale, oneri, bloccato, onSalva }: {
  computo: ComputoCommessa; totale: number; oneri: number; bloccato: boolean; onSalva: (m: ModificaComputo) => void;
}) {
  // Il genitore cambia la «key» quando i dati salvati cambiano: la bozza riparte da quelli.
  const [bozza, setBozza] = useState({ stazione_appaltante: computo.stazione_appaltante ?? "", cig: computo.cig ?? "", cup: computo.cup ?? "",
    ribasso: computo.ribasso_percentuale == null ? "" : String(computo.ribasso_percentuale).replace(".", ",") });
  const ribasso = bozza.ribasso.trim() ? Number(bozza.ribasso.replace(",", ".")) : null;
  const ribassoValido = ribasso === null || (Number.isFinite(ribasso) && ribasso >= 0 && ribasso < 100);
  const quadro = quadroEconomico(totale, oneri, ribassoValido ? ribasso : null);
  const salva = () => {
    if (!ribassoValido) { toast.error("Il ribasso d'asta va da 0 a 100 (es. 12,345)."); return; }
    onSalva({ stazione_appaltante: bozza.stazione_appaltante.trim() || null, cig: bozza.cig.trim().toUpperCase() || null,
      cup: bozza.cup.trim().toUpperCase() || null, ribasso_percentuale: ribasso });
  };
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-2">
        <CardTitle className="text-base">Lavoro pubblico</CardTitle>
        <div className="flex items-center gap-2">
          <Label htmlFor="computo-lavoro-pubblico" className="text-sm">{computo.lavoro_pubblico ? "Sì" : "No"}</Label>
          <Switch id="computo-lavoro-pubblico" checked={computo.lavoro_pubblico} disabled={bloccato} onCheckedChange={v => onSalva({ lavoro_pubblico: v })} aria-label="Lavoro pubblico" />
        </div>
      </CardHeader>
      {computo.lavoro_pubblico && (
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1 sm:col-span-2"><Label htmlFor="computo-sa">Stazione appaltante</Label>
              <Input id="computo-sa" value={bozza.stazione_appaltante} disabled={bloccato} onChange={e => setBozza(b => ({ ...b, stazione_appaltante: e.target.value }))} /></div>
            <div className="space-y-1"><Label htmlFor="computo-cig">CIG</Label>
              <Input id="computo-cig" value={bozza.cig} disabled={bloccato} maxLength={10} onChange={e => setBozza(b => ({ ...b, cig: e.target.value }))} /></div>
            <div className="space-y-1"><Label htmlFor="computo-cup">CUP</Label>
              <Input id="computo-cup" value={bozza.cup} disabled={bloccato} maxLength={15} onChange={e => setBozza(b => ({ ...b, cup: e.target.value }))} /></div>
            <div className="space-y-1"><Label htmlFor="computo-ribasso">Ribasso d'asta %</Label>
              <Input id="computo-ribasso" inputMode="decimal" value={bozza.ribasso} disabled={bloccato} aria-invalid={!ribassoValido}
                onChange={e => setBozza(b => ({ ...b, ribasso: e.target.value }))} placeholder="Es. 12,345" /></div>
            {!bloccato && <div className="flex items-end"><Button type="button" variant="outline" onClick={salva}>Salva i dati</Button></div>}
          </div>
          <dl className="divide-y rounded-lg border text-sm">
            <div className="flex justify-between gap-3 px-3 py-2"><dt>Importo dei lavori (dal computo)</dt><dd className="tabular-nums">{euro(quadro.importo_lavori)}</dd></div>
            <div className="flex justify-between gap-3 px-3 py-2"><dt>di cui oneri della sicurezza <span className="text-slate-500">(non soggetti a ribasso)</span></dt><dd className="tabular-nums">{euro(quadro.oneri_sicurezza)}</dd></div>
            <div className="flex justify-between gap-3 px-3 py-2"><dt>Importo soggetto a ribasso</dt><dd className="tabular-nums">{euro(quadro.soggetto_a_ribasso)}</dd></div>
            <div className="flex justify-between gap-3 px-3 py-2"><dt>Ribasso d'asta {quadro.ribasso_percentuale.toLocaleString("it-IT", { maximumFractionDigits: 4 })}%</dt><dd className="tabular-nums">− {euro(quadro.ribasso_euro)}</dd></div>
            <div className="flex justify-between gap-3 bg-slate-50 px-3 py-2 font-semibold"><dt>Importo contrattuale</dt><dd className="tabular-nums">{euro(quadro.importo_contrattuale)}</dd></div>
          </dl>
          <p className="text-xs text-slate-500">Importo contrattuale = (lavori − sicurezza) × (1 − ribasso) + sicurezza. La sicurezza è la somma delle voci della categoria «oneri della sicurezza».</p>
        </CardContent>
      )}
    </Card>
  );
}

export default function OrderComputoTab({ orderId, companyId, canEdit, canViewAmounts = true, orderLabel }: {
  orderId: string; companyId: string; canEdit: boolean; canViewAmounts?: boolean; orderLabel?: string | null;
}) {
  const confirm = useConfirm();
  const { data: computi = [], isLoading, error } = useComputiCommessa(orderId, companyId);
  const attivi = computi.filter(c => c.stato !== "archiviato");
  const [sceltoId, setSceltoId] = useState<string | null>(null);
  const computo = attivi.find(c => c.id === sceltoId) ?? attivi[0] ?? null;
  const letto = computoLetto(computo);
  const { data: voci = [], isLoading: vociLoading } = useVociComputo(computo?.id, letto);
  const modifica = useModificaComputo(orderId, companyId);
  const scarta = useScartaComputo(orderId, companyId);
  const [ricerca, setRicerca] = useState("");
  const [evidenza, setEvidenza] = useState<EvidenzaVoce | null>(null);
  const [nuovo, setNuovo] = useState(false);
  const [esportando, setEsportando] = useState<"xlsx" | "pdf" | null>(null);

  // Calcoli semplici: li memorizza il compilatore di React.
  const totale = Math.round(voci.reduce((s, v) => s + (Number(v.importo_computo) || 0), 0) * 100) / 100;
  const oneri = Math.round(voci.reduce((s, v) => s + (v.is_sicurezza ? Number(v.importo_computo) || 0 : 0), 0) * 100) / 100;
  // Il controllo scritto all'import confronta con il documento (riepiloghi, totale); senza, si ricalcola dalle voci.
  let controllo: ControlloTotali | null = null;
  if (computo && letto && voci.length) {
    controllo = computo.controllo_totali && typeof computo.controllo_totali === "object" && "sintesi" in computo.controllo_totali
      ? computo.controllo_totali
      : controllaTotali({ voci: voci.map(aStrutturata), totale_dichiarato: computo.totale_dichiarato, riepiloghi: [] });
  }
  const filtrate = filtraVoci(voci, ricerca);
  const bloccato = !canEdit || computo?.stato === "contrattuale";

  if (isLoading) return <div className="flex items-center gap-2 p-4 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Carico il computo…</div>;
  if (error) return <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm">Computo non disponibile: {(error as Error).message}</p>;

  const salva = (m: ModificaComputo) => computo && modifica.mutate({ id: computo.id, modifica: m }, {
    onError: e => toast.error(e instanceof Error ? e.message : "Salvataggio non riuscito."),
    onSuccess: () => toast.success("Computo aggiornato"),
  });
  const cambiaStato = async (stato: StatoComputo) => {
    if (!computo) return;
    if (stato === "contrattuale" && !(await confirm({ title: "Rendere contrattuale il computo?",
      description: "Il computo contrattuale diventa la base della commessa: non si potrà più sostituire né cambiare i dati del lavoro pubblico finché non lo riporti a «verificato».",
      confirmLabel: "Rendi contrattuale" }))) return;
    if (computo.stato === "contrattuale" && !(await confirm({ title: "Sbloccare il computo contrattuale?",
      description: "Torna «verificato» e si può di nuovo modificare o sostituire. Fallo solo per una variante o un errore.", confirmLabel: "Sblocca", variant: "destructive" }))) return;
    salva({ stato });
  };
  const apriVoce = (numero: string) => { setRicerca(""); setEvidenza(e => ({ numero, volta: (e?.volta ?? 0) + 1 })); };
  const esporta = async (tipo: "xlsx" | "pdf") => {
    if (!computo) return;
    setEsportando(tipo);
    try {
      const { esportaComputoPdf, esportaComputoXlsx } = await import("@/lib/computo/esportaComputo");
      const intestazione = {
        titolo: computo.titolo || computo.file_name, commessa: orderLabel ? `Commessa ${orderLabel}` : null,
        stazioneAppaltante: computo.lavoro_pubblico ? computo.stazione_appaltante : null,
        cig: computo.lavoro_pubblico ? computo.cig : null, cup: computo.lavoro_pubblico ? computo.cup : null,
        stato: `Stato: ${ETICHETTA_STATO[computo.stato]}`,
        quadro: computo.lavoro_pubblico ? quadroEconomico(totale, oneri, computo.ribasso_percentuale) : null,
      };
      if (tipo === "xlsx") await esportaComputoXlsx(voci, intestazione); else await esportaComputoPdf(voci, intestazione);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Esportazione non riuscita.");
    } finally { setEsportando(null); }
  };

  if (!computo || nuovo) {
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">{computo ? "Carica un nuovo computo" : "Computo metrico della commessa"}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {canEdit ? <Caricamento orderId={orderId} companyId={companyId} sostituisce={computo} onFatto={() => setNuovo(false)} />
            : <p className="text-sm text-slate-600">Questa commessa non ha ancora un computo metrico.</p>}
          {computo && <Button type="button" variant="ghost" onClick={() => setNuovo(false)}>Torna al computo attuale</Button>}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                {computo.titolo || computo.file_name}
                <Badge variant="outline" className={COLORE_STATO[computo.stato]}>{computo.stato === "contrattuale" && <Lock className="mr-1 h-3 w-3" />}{ETICHETTA_STATO[computo.stato]}</Badge>
              </h3>
              <p className="text-xs text-slate-500">
                {computo.file_name}
                {computo.extraction_method === "xpwe_parse" ? " · letto dall'XPWE" : computo.controllo_totali ? " · letto dal PDF di PriMus" : ""}
                {computo.oggetto_lavori ? ` · ${computo.oggetto_lavori.slice(0, 140)}` : ""}
              </p>
              {attivi.length > 1 && (
                <label className="mt-1 flex items-center gap-2 text-xs text-slate-600">Altri computi della commessa:
                  <select className="rounded border px-1 py-0.5" value={computo.id} onChange={e => setSceltoId(e.target.value)}>
                    {attivi.map(c => <option key={c.id} value={c.id}>{c.titolo || c.file_name} ({ETICHETTA_STATO[c.stato]})</option>)}
                  </select>
                </label>
              )}
            </div>
            {letto && voci.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => esporta("xlsx")} disabled={!!esportando}>
                  {esportando === "xlsx" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1 h-4 w-4" />}Excel
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => esporta("pdf")} disabled={!!esportando}>
                  {esportando === "pdf" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileDown className="mr-1 h-4 w-4" />}PDF
                </Button>
              </div>
            )}
          </div>

          {computoInLettura(computo) && (
            <p className="flex items-center gap-2 text-sm text-slate-700"><Loader2 className="h-4 w-4 animate-spin" />{computo.progresso || "Lettura del computo in corso…"}</p>
          )}
          {computo.extraction_status === "failed" && (
            <div role="alert" className="space-y-2 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm">
              <p>Lettura non riuscita: {computo.extraction_error || "errore sconosciuto"}.</p>
              {canEdit && <div className="flex gap-2">
                <Button type="button" size="sm" onClick={() => setNuovo(true)}>Carica un altro file</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => scarta.mutate(computo.id)}>Elimina questo caricamento</Button>
              </div>}
            </div>
          )}
          {controllo && <EsitoControllo controllo={controllo} onApriVoce={apriVoce} />}

          {letto && canEdit && (
            <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-sm">
              <span className="text-slate-600">Stato del computo:</span>
              {computo.stato === "bozza" && <Button type="button" size="sm" onClick={() => cambiaStato("verificato")}>Segna come verificato</Button>}
              {computo.stato === "verificato" && <>
                <Button type="button" size="sm" onClick={() => cambiaStato("contrattuale")}>Rendi contrattuale</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => cambiaStato("bozza")}>Riporta in bozza</Button>
              </>}
              {computo.stato === "contrattuale" && <>
                <span className="text-emerald-800">bloccato: è la base contrattuale della commessa.</span>
                <Button type="button" size="sm" variant="ghost" onClick={() => cambiaStato("verificato")}>Sblocca</Button>
              </>}
              {computo.stato !== "contrattuale" && <Button type="button" size="sm" variant="outline" onClick={() => setNuovo(true)}>Carica un nuovo computo</Button>}
              {computo.stato === "bozza" && (
                <Button type="button" size="sm" variant="ghost" className="text-rose-700" onClick={async () => {
                  if (await confirm({ title: "Scartare questo computo?", description: "Si cancellano le voci lette e le righe di misura. Il file originale resta nell'archivio dei computi.", confirmLabel: "Scarta", variant: "destructive" })) {
                    scarta.mutate(computo.id, { onError: e => toast.error(e instanceof Error ? e.message : "Non riuscito.") });
                  }
                }}>Scarta</Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {letto && canViewAmounts && voci.length > 0 && (
        <LavoroPubblico key={[computo.id, computo.stazione_appaltante, computo.cig, computo.cup, computo.ribasso_percentuale].join("|")} computo={computo} totale={totale} oneri={oneri} bloccato={bloccato} onSalva={salva} />
      )}

      {letto && (vociLoading ? (
        <div className="flex items-center gap-2 p-4 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Carico le voci…</div>
      ) : (
        <section aria-label="Voci del computo" className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative sm:w-96">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
              <Input type="search" value={ricerca} onChange={e => setRicerca(e.target.value)} className="pl-8"
                placeholder="Cerca per numero, tariffa, descrizione o misura" aria-label="Cerca nel computo" />
            </div>
            <p className="text-sm text-slate-600">
              {ricerca ? `${filtrate.length} di ${voci.length} voci` : `${voci.length} voci`}
              {canViewAmounts && <> · totale <strong>{euro(totale)}</strong></>}
            </p>
          </div>
          <ComputoAlbero voci={filtrate} totaleComputo={totale} ricercaAttiva={!!ricerca.trim()} voceInEvidenza={evidenza} mostraImporti={canViewAmounts} />
        </section>
      ))}
    </div>
  );
}

/** Le voci salvate nella forma che il controllo dei totali sa leggere (per i computi senza controllo salvato). */
function aStrutturata(v: VoceComputo): ComputoVoceStrutturata {
  return {
    numero_ordine: numeroVoce(v), codici: [], codice_tariffa: v.codice_tariffa ?? "", descrizione: v.descrizione_estesa || v.descrizione_breve,
    descrizione_troncata: false, unita_misura: v.unita_misura ?? "", quantita: v.quantita, prezzo_unitario: v.prezzo_unitario_computo,
    importo: v.importo_computo, sezione: null, super_categoria: v.super_categoria ? { numero: null, nome: v.super_categoria } : null,
    categoria: v.categoria ? { numero: null, nome: v.categoria } : null, sotto_categoria: v.sotto_categoria ? { numero: null, nome: v.sotto_categoria } : null,
    is_sicurezza: v.is_sicurezza, is_detrazione: v.is_detrazione, a_corpo: v.a_corpo,
    misure: v.misure.map(m => ({ descrizione: m.descrizione ?? "", parti_uguali: m.parti_uguali, lunghezza: m.lunghezza, larghezza: m.larghezza,
      altezza_peso: m.altezza_peso, quantita: m.quantita, formula: m.formula })),
    pagina: null, avvisi: [],
  };
}
