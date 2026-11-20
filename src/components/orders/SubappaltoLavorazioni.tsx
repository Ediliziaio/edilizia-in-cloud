import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ClipboardList, FileText, Handshake, Mail, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { nomeBreve } from "@/lib/acquisti/fabbisogno";
import { useAuth } from "@/contexts/AuthContext";
import { useRegistroSubappaltoLocale } from "@/hooks/useRegistroSubappaltoLocale";
import { useDatiAffidaContratto } from "@/hooks/useDatiAffidaContratto";
import { useVociPrevisteFasi } from "@/hooks/useVociPrevisteFasi";
import { supabase } from "@/integrations/supabase/client";
import { INTERA_COMMESSA, vociDelSubappalto, type AmbitoLavoro } from "@/lib/orders/previsionaleLavoro";
import { parseAssignmentAmount } from "@/lib/orders/assignmentAmounts";
import { formatCurrency } from "@/lib/formatters";
import { situazioneSubappalto, type RichiestaDaLavorazioni } from "@/lib/subappaltatori/richiesteDaLavorazioni";
import type { RigaElencoLavori } from "@/lib/subappaltatori/contrattoSubappaltoHtml";
import type { ComposeContext } from "@/pages/azienda/email/components/EmailComposeDialog";
import { AffidaContrattoDaCommessa, type ComputoDaLavorazioni } from "./AffidaContrattoDialog";
import { useAffidamentiCommessa } from "./AffidaVociDialog";
import { ComputoSubappaltoAnteprima } from "./ComputoSubappaltoAnteprima";
import { ContrattiSubappaltoCommessa } from "./ContrattiSubappaltoCommessa";

const EmailComposeDialog = lazy(() => import("@/pages/azienda/email/components/EmailComposeDialog")
  .then((modulo) => ({ default: modulo.EmailComposeDialog })));
const misura = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 3 });
const oggi = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
const dataIt = (data: string) => data.slice(0, 10).split("-").reverse().join("/");
const colori: Record<string, string> = {
  "Da quotare": "border-amber-200 bg-amber-50 text-amber-900",
  "In attesa di offerta": "border-blue-200 bg-blue-50 text-blue-900",
  "Offerta ricevuta": "border-teal-200 bg-teal-50 text-teal-900",
  "A contratto": "border-emerald-200 bg-emerald-50 text-emerald-900",
  "Contratto collegato": "border-emerald-200 bg-emerald-50 text-emerald-900",
};
export type AperturaSubappalto = "lavorazioni" | "nuova-richiesta";
type SchedaSubappalto = "offerte" | "lavorazioni" | "contratti";

function RegistraOfferta({ richiesta, onSalva, onAnnulla, salvaInCorso }: {
  richiesta: RichiestaDaLavorazioni;
  onSalva: (offerta: NonNullable<RichiestaDaLavorazioni["offerta"]>) => void;
  salvaInCorso: boolean;
  onAnnulla: () => void;
}) {
  const [data, setData] = useState(richiesta.offerta?.data ?? oggi());
  const [riferimento, setRiferimento] = useState(richiesta.offerta?.riferimento ?? "");
  const [prezzi, setPrezzi] = useState<Record<string, string>>(() => Object.fromEntries(
    Object.entries(richiesta.offerta?.prezzi ?? {}).map(([id, prezzo]) => [id, String(prezzo).replace(".", ",")]),
  ));
  const righePrezzo = richiesta.righe.filter((r) => prezzi[r.id]?.trim()).map((r) => [r.id, parseAssignmentAmount(prezzi[r.id], 2)] as const);
  const prezziValidi = Object.fromEntries(righePrezzo) as Record<string, number | null>;
  const totale = richiesta.righe.reduce((importo, r) => importo + Math.round(r.quantita * (prezziValidi[r.id] ?? 0) * 100) / 100, 0);
  const valida = !!data && data <= oggi() && righePrezzo.length > 0 && righePrezzo.every(([, prezzo]) => prezzo != null && prezzo > 0);
  return <fieldset disabled={salvaInCorso} className="min-w-0 space-y-3 rounded-lg border bg-muted/25 p-3">
    <legend className="px-1 text-sm font-semibold">{richiesta.offerta ? "Modifica offerta" : "Registra offerta"}</legend>
    <div className="grid gap-2 sm:grid-cols-[11rem_1fr]">
      <label className="space-y-1 text-sm">Ricevuta il<Input type="date" value={data} max={oggi()} onChange={(e) => setData(e.target.value)} /></label>
      <label className="space-y-1 text-sm">Riferimento dell’offerta<Input value={riferimento} maxLength={250} onChange={(e) => setRiferimento(e.target.value)} placeholder="Numero o riferimento della ditta" /></label>
    </div>
    <p className="text-xs text-muted-foreground">Inserisci il prezzo unitario IVA esclusa delle voci quotate. Lascia vuote le altre.</p>
    <div className="divide-y rounded-md border bg-white">
      {richiesta.righe.map((r) => <label key={r.id} className="flex flex-wrap items-center justify-between gap-2 bg-background p-2.5 text-sm">
        <span className="min-w-0 flex-1 basis-40">
          <span className="line-clamp-2 break-words" title={r.descrizione}>{r.descrizione}</span>
          <span className="block text-xs text-muted-foreground">{misura.format(r.quantita)} {r.unita}</span>
        </span>
        <Input className="w-28 text-right tabular-nums" aria-label={`Prezzo offerto per ${r.descrizione}`} inputMode="decimal" value={prezzi[r.id] ?? ""}
          onChange={(e) => setPrezzi((p) => ({ ...p, [r.id]: e.target.value }))} placeholder={`€ / ${r.unita || "unità"}`} />
      </label>)}
    </div>
    <div className="flex flex-wrap items-center justify-end gap-2">
      {valida && <p className="mr-auto text-sm text-muted-foreground">
        {righePrezzo.length} di {richiesta.righe.length} voci quotate · <strong className="tabular-nums text-foreground">{formatCurrency(totale)}</strong> IVA esclusa
      </p>}
      <Button size="sm" variant="outline" onClick={onAnnulla}>Annulla</Button>
      <Button size="sm" disabled={!valida || salvaInCorso} onClick={() => onSalva({
        data, riferimento: riferimento.trim(), prezzi: Object.fromEntries(righePrezzo) as Record<string, number>,
      })}>Salva offerta</Button>
    </div>
  </fieldset>;
}

export function SubappaltoLavorazioni({ orderId, companyId, ambiti, albero, apertura, onOccupato, apri }: {
  orderId: string; companyId: string; ambiti: AmbitoLavoro[]; albero: readonly AmbitoLavoro[];
  apertura?: AperturaSubappalto;
  onOccupato?: (si: boolean) => void;
  apri?: () => void;
}) {
  const { user, effectiveCompany: azienda } = useAuth();
  const { registro, aggiorna, disponibile, carica, errore, riprova, salvaInCorso } = useRegistroSubappaltoLocale(companyId, orderId, user?.id);
  const misurate = useVociPrevisteFasi(orderId, true);
  const affidamenti = useAffidamentiCommessa(orderId);
  const datiContratti = useDatiAffidaContratto(orderId, companyId);
  const [scheda, setScheda] = useState<SchedaSubappalto>(apertura === "lavorazioni" || !disponibile ? "lavorazioni" : "offerte");
  const [composizione, setEditor] = useState<ComputoDaLavorazioni | "dalla-selezione" | undefined>(
    apertura === "nuova-richiesta" ? "dalla-selezione" : undefined,
  );
  const [salvataggio, setSalvataggio] = useState(false);
  const segnalaSalvataggio = useCallback((si: boolean) => { setSalvataggio(si); onOccupato?.(si); }, [onOccupato]);
  const [filtroSelezione, setFiltroSelezione] = useState(false);
  const [anteprima, setAnteprima] = useState<string>();
  const [ultimaBozza, setUltimaBozza] = useState<string>();
  const titoloBozza = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (scheda === "offerte" && ultimaBozza) titoloBozza.current?.focus();
  }, [scheda, ultimaBozza]);
  const [contrattoAperto, setContrattoAperto] = useState<string>();
  const [offerta, setOfferta] = useState<RichiestaDaLavorazioni>();
  const [email, setEmail] = useState<{ richiesta: RichiestaDaLavorazioni; context: ComposeContext }>();
  const [caricaEmail, setCaricaEmail] = useState(false);

  const misure = new Map(misurate.data?.map((v) => [v.id, v]));
  const idsMisurati = new Set(vociDelSubappalto(ambiti, albero));
  const intera = ambiti.some((a) => a.id === INTERA_COMMESSA);
  const espansi = albero.filter((a) => ambiti.some((b) =>
    a.id === b.id || (a.faseId && (intera || a.faseId === b.id))));
  const inclusi = espansi.filter((a) => a.voceId ? idsMisurati.has(a.voceId)
    : a.sottofaseId || (a.faseId && !albero.some((b) => a.faseId === b.faseId && b.id !== a.id)));
  const contratti = datiContratti.data?.contratti as Array<{ id: string; stato: string; firmato_il: string | null; elenco_lavori: unknown }> | undefined;
  const bozze = new Set((contratti ?? []).filter((c) => c.stato === "bozza" && !c.firmato_il).map((c) => c.id));
  const lavoriAContratto = (contratti ?? []).filter((c) => c.stato !== "risolto").flatMap((c) =>
    Array.isArray(c.elenco_lavori) ? (c.elenco_lavori as RigaElencoLavori[]).map((r) => ({ ...r, bozza: c.stato === "bozza" && !c.firmato_il })) : []);
  const righe = inclusi.map((ambito) => {
    const misuraVoce = ambito.voceId ? misure.get(ambito.voceId) : undefined;
    const unita = misuraVoce?.unita ?? (ambito.voceId ? "" : "a corpo");
    const quantita = misuraVoce?.quantita ?? (ambito.voceId ? 0 : 1);
    const collegati = lavoriAContratto.filter((r) => ambito.voceId
      ? r.voce_id === ambito.voceId && !r.affidamento_id
      : !r.voce_id && r.unita === "a corpo" && (ambito.sottofaseId ? r.sottofase_id === ambito.sottofaseId : r.fase_id === ambito.faseId && !r.sottofase_id));
    const situazione = situazioneSubappalto(ambito.id, quantita, registro, affidamenti.data ?? [], {
      bozze,
      aCorpo: collegati.filter((r) => !r.bozza).reduce((tot, r) => tot + Number(r.quantita), 0),
      aCorpoInBozza: collegati.filter((r) => r.bozza).reduce((tot, r) => tot + Number(r.quantita), 0),
    });
    const importi = [
      situazione.contrattata > 0 && `${misura.format(situazione.contrattata)} ${unita} a contratto`,
      situazione.inContrattoBozza > 0 && `${misura.format(situazione.inContrattoBozza)} ${unita} in bozza di contratto`,
      situazione.inAffidamentoBozza > 0 && `${misura.format(situazione.inAffidamentoBozza)} ${unita} assegnati in bozza`,
      situazione.residua > 0 && (unita === "a corpo" ? "A corpo" : `${misura.format(situazione.residua)} ${unita} ${situazione.interna ? "interni" : "da affidare"}`),
    ].filter(Boolean).join(" · ");
    return { ambito, ...situazione, dettaglio: importi };
  });
  const chiavi = new Set(righe.map((r) => r.ambito.id));
  const fasiSelezionate = new Set(ambiti.filter((a) => a.id === a.faseId).map((a) => a.id));
  const richiesteSelezionate = registro.richieste.filter((r) => r.righe.some((v) =>
    intera || chiavi.has(v.ambito) || (v.faseId && fasiSelezionate.has(v.faseId))));
  const richieste = filtroSelezione ? richiesteSelezionate : registro.richieste;
  const quotabili = righe.filter((r) => !r.interna && r.residua > 0);
  const computoSelezionato = (soloRichiesta: boolean, scelte: ReadonlyArray<{ ambito: AmbitoLavoro }>): ComputoDaLavorazioni => ({
    soloRichiesta,
    ambiti: scelte.length === 1 ? [scelte[0].ambito] : ambiti,
    voci: scelte.flatMap(({ ambito }) => ambito.voceId ? [ambito.voceId] : []),
    aCorpo: scelte.flatMap(({ ambito }) => ambito.voceId ? [] : [ambito]),
  });
  const prepara = (soloRichiesta: boolean, scelte: ReadonlyArray<{ ambito: AmbitoLavoro }>) => setEditor(computoSelezionato(soloRichiesta, scelte));
  const erroreLettura = misurate.isError || affidamenti.isError || datiContratti.isError || !!errore;
  const pronto = !!(misurate.data && affidamenti.data && datiContratti.data) && !carica && !erroreLettura;
  const editor = composizione === "dalla-selezione" ? undefined : composizione;
  if (composizione === "dalla-selezione" && pronto) {
    setEditor(disponibile && quotabili.length ? computoSelezionato(true, quotabili) : undefined);
  }
  const apriContratto = (id: string) => {
    setContrattoAperto(id);
    setScheda("contratti");
  };
  const usaComputo = (r: RichiestaDaLavorazioni, daOfferta: boolean) => setEditor({
    ambiti: albero.filter((a) => r.righe.some((v) => v.ambito === a.id)),
    voci: r.righe.filter((v) => v.ambito.startsWith("v:") && (!daOfferta || r.offerta?.prezzi[v.id] != null)).map((v) => v.ambito.slice(2)),
    ...(daOfferta ? { offerta: r } : { richiesta: r }),
  });
  const computoOrigine = editor?.offerta ?? editor?.richiesta;
  const apriEmail = async (richiesta: RichiestaDaLavorazioni) => {
    if (caricaEmail || !azienda || azienda.id !== companyId) return;
    setCaricaEmail(true);
    try {
      const [{ data, error }, { fileComputoRichiesta, documentoRichiestaSubappalto }, { corpoDocumento }] = await Promise.all([
        supabase.from("subappaltatori").select("email").eq("company_id", companyId).eq("id", richiesta.dittaId).single(),
        import("@/lib/subappaltatori/richiestaOffertaPdf"),
        import("@/lib/documentiOperativi/modello"),
      ]);
      if (error) throw error;
      const documento = documentoRichiestaSubappalto(richiesta);
      const allegato = await fileComputoRichiesta(richiesta, azienda);
      setEmail({ richiesta, context: {
        mode: "new", initialTo: data?.email ? [data.email] : [],
        initialSubject: ["Richiesta d’offerta " + documento.numero, richiesta.commessa].filter(Boolean).join(" · "),
        initialBodyHtml: corpoDocumento(documento, azienda, true),
        documentoDaAllegare: allegato,
      } });
    } catch { toast.error("Non riesco a preparare l’email. Riprova."); }
    finally { setCaricaEmail(false); }
  };

  if (editor) return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-base font-semibold">{editor.soloRichiesta ? "Nuova richiesta di preventivo" : "Prepara contratto di subappalto"}</h3>
      <Button variant="ghost" size="sm" disabled={salvataggio} onClick={() => setEditor(undefined)}>
        <ArrowLeft className="size-4" aria-hidden="true" />{scheda === "offerte" ? "Torna alle richieste" : "Torna al subappalto"}
      </Button>
    </div>
    <AffidaContrattoDaCommessa key={computoOrigine ? `${editor.offerta ? "offerta" : "richiesta"}:${computoOrigine.id}` : "nuovo"} orderId={orderId} companyId={companyId} incorporato partenza={editor}
      onOccupato={segnalaSalvataggio}
      offerte={registro.richieste.filter((r) => r.offerta && !r.offerta.contrattoId && !r.contrattoId)} onCaricaOfferta={(r) => usaComputo(r, true)}
      dittaFissa={computoOrigine ? { id: computoOrigine.dittaId, nome: computoOrigine.ditta } : undefined}
      suRichiesta={disponibile ? async (r) => {
        await aggiorna({ tipo: "crea", richiesta: r });
        setScheda("offerte");
        setFiltroSelezione(false);
        setUltimaBozza(r.id);
        setAnteprima(undefined);
        setEditor(undefined);
        toast.success("Richiesta salvata in bozza.");
      } : undefined}
      onChiudi={() => setEditor(undefined)}
      onContrattoSalvato={(contrattoId) => {
        apriContratto(contrattoId);
        if (computoOrigine) void aggiorna({ tipo: "contratto", id: computoOrigine.id, contrattoId, daOfferta: !!editor.offerta })
          .catch(() => toast.warning("Contratto salvato. Aggiornamento del computo da riprovare."));
      }} />
  </div>;
  if (erroreLettura) return <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
    <span>{errore?.message ?? "Non riesco a leggere lo stato del subappalto."}</span>
    <Button size="sm" variant="outline" onClick={() => { void misurate.refetch(); void affidamenti.refetch(); void datiContratti.refetch(); void riprova(); }}>Riprova</Button>
  </div>;
  if (!misurate.data || !affidamenti.data || !datiContratti.data || carica || composizione === "dalla-selezione") return <p role="status" className="text-sm text-muted-foreground">Carico il subappalto…</p>;

  const elenco = righe.length > 0 && <ul aria-label="Lavorazioni del subappalto" className="divide-y overflow-hidden rounded-lg border bg-background">
    {(apri ? righe.slice(0, 4) : righe).map((r) => {
      const { nome } = r.ambito;
      const breve = nome.length > 85 ? nomeBreve(nome).titolo : nome;
      return <li key={r.ambito.id} className="grid items-start gap-2.5 px-3 py-2.5 text-sm sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <p className="break-words font-medium">{breve}</p>
          {r.dettaglio && <p className="mt-0.5 text-xs text-muted-foreground">{r.dettaglio}</p>}
          {!apri && breve !== nome && <details className="group mt-1 text-xs text-muted-foreground">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 hover:text-foreground [&::-webkit-details-marker]:hidden">
              <ChevronDown className="size-3.5 group-open:rotate-180" aria-hidden="true" />Descrizione
            </summary>
            <p className="mt-1.5 break-words leading-relaxed">{nome}</p>
          </details>}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Badge variant="outline" className={colori[r.stato]}>{r.stato}</Badge>
          {!apri && disponibile && r.residua > 0 && <Button size="sm" variant="ghost" className="h-7" disabled={salvaInCorso} onClick={() => {
            void aggiorna({ tipo: "interno", interno: !r.interna, ambito: r.ambito.id }).catch((e: Error) => toast.error(e.message));
          }}>{r.interna ? "Rimetti da quotare" : "Lavoro interno"}</Button>}
          {!apri && disponibile && !r.interna && r.residua > 0 && <Button size="sm" variant="outline" className="h-7" onClick={() => prepara(true, [r])}>Chiedi preventivo</Button>}
        </div>
      </li>;
    })}
    {apri && righe.length > 4 && <li className="px-3 py-2 text-xs text-muted-foreground">Altre {righe.length - 4} lavorazioni in Subappalto</li>}
  </ul>;

  if (apri) return <section className="space-y-3" aria-label="Riepilogo subappalto">
    <header className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 p-3">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Handshake className="size-4 text-primary" aria-hidden="true" />Subappalto</h3>
        <p className="mt-1 text-xs text-muted-foreground">{righe.length === 0 ? "Nessuna lavorazione nella selezione"
          : quotabili.length === 0 ? "Nessuna lavorazione da quotare"
          : `${quotabili.length} ${quotabili.length === 1 ? "voce da affidare" : "voci da affidare"}`}</p>
      </div>
      <Button size="sm" variant="outline" onClick={apri}>Gestisci subappalto</Button>
    </header>
    {elenco}
  </section>;

  const segnaInviata = async (id: string) => {
    await aggiorna({ tipo: "invia", id });
    toast.success("Richiesta segnata come inviata.");
  };

  return <section className="space-y-3" aria-label="Subappalto">
    <Tabs value={disponibile ? scheda : scheda === "offerte" ? "lavorazioni" : scheda}
      onValueChange={(valore) => { setUltimaBozza(undefined); setScheda(valore as SchedaSubappalto); }} activationMode="manual">
      <TabsList aria-label="Sezioni del subappalto" className="h-auto w-full flex-wrap justify-start gap-1">
        {disponibile && <TabsTrigger value="offerte" className="gap-1.5"><Mail className="size-4 shrink-0" aria-hidden="true" />Richieste d’offerta
          {registro.richieste.length > 0 && <span className="text-xs text-muted-foreground">{registro.richieste.length}</span>}</TabsTrigger>}
        <TabsTrigger value="lavorazioni" className="gap-1.5"><ClipboardList className="size-4 shrink-0" aria-hidden="true" />Lavorazioni</TabsTrigger>
        <TabsTrigger value="contratti" className="gap-1.5"><FileText className="size-4 shrink-0" aria-hidden="true" />Contratti</TabsTrigger>
      </TabsList>
      <TabsContent value="lavorazioni">{elenco || <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Seleziona una fase o una voce per vedere cosa affidare.</p>}</TabsContent>
      {disponibile && <TabsContent value="offerte" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 p-3">
          <p className="text-sm text-muted-foreground">{quotabili.length > 0
            ? `${quotabili.length} ${quotabili.length === 1 ? "voce selezionata da quotare" : "voci selezionate da quotare"}`
            : "Seleziona lavorazioni con quantità disponibili per chiedere un preventivo."}</p>
          <Button size="sm" variant={registro.richieste.length ? "outline" : "default"} disabled={!quotabili.length || salvaInCorso} onClick={() => prepara(true, quotabili)}>
            <Plus className="size-4" aria-hidden="true" />Nuova richiesta
          </Button>
        </div>
        {!intera && (filtroSelezione || richiesteSelezionate.length < registro.richieste.length) && <label className="inline-flex items-center gap-2 px-1 text-sm text-muted-foreground">
          <input type="checkbox" className="accent-primary" checked={filtroSelezione} onChange={(e) => setFiltroSelezione(e.target.checked)} />
          Solo le lavorazioni selezionate
        </label>}
        {!richieste.length && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {filtroSelezione ? "Nessuna richiesta per le lavorazioni selezionate." : "Nessuna richiesta in questa commessa."}
        </p>}
        {richieste.map((r) => {
          const contrattoId = r.offerta?.contrattoId ?? r.contrattoId;
          const bozza = !r.inviataIl && !r.offerta && !contrattoId;
          const stato = contrattoId ? "Contratto collegato" : r.offerta ? "Offerta ricevuta" : r.inviataIl ? "In attesa di offerta" : "Bozza";
          const fasi = [...new Set(r.righe.map((v) => v.fase).filter(Boolean))];
          const quotate = r.offerta ? Object.keys(r.offerta.prezzi).length : 0;
          const inModifica = offerta?.id === r.id;
          const dettagli = anteprima === r.id;
          return <article key={r.id} className="space-y-3 rounded-lg border bg-background p-3 sm:p-4" aria-label={`Richiesta per ${r.ditta}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 basis-56 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="break-words text-sm font-semibold" tabIndex={r.id === ultimaBozza ? -1 : undefined}
                    ref={r.id === ultimaBozza ? titoloBozza : undefined}>{r.ditta}</h4>
                  <Badge variant="outline" className={colori[stato]}>{stato}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {r.righe.length} {r.righe.length === 1 ? "voce" : "voci"}
                  {fasi.length > 0 && ` · ${fasi.slice(0, 2).join(" · ")}${fasi.length > 2 ? ` +${fasi.length - 2}` : ""}`}
                </p>
                {r.offerta
                  ? <p className="text-sm"><strong className="tabular-nums">{formatCurrency(r.righe.reduce((tot, v) => tot + Math.round(v.quantita * (r.offerta?.prezzi[v.id] ?? 0) * 100) / 100, 0))}</strong>
                    <span className="text-xs text-muted-foreground"> IVA esclusa · {quotate} di {r.righe.length} voci quotate</span></p>
                  : <p className="text-xs text-muted-foreground">
                    {r.inviataIl ? `Inviata il ${dataIt(r.inviataIl)}` : `Salvata il ${dataIt(r.creataIl)}`}
                    {r.scadenza && ` · Risposta entro ${dataIt(r.scadenza)}`}
                  </p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setAnteprima(dettagli ? undefined : r.id)} aria-expanded={dettagli}>
                  {dettagli ? "Chiudi dettagli" : "Dettagli"}
                </Button>
                {!inModifica && (contrattoId
                  ? <Button size="sm" onClick={() => apriContratto(contrattoId)}>Apri contratto</Button>
                  : r.offerta ? <Button size="sm" disabled={salvaInCorso} onClick={() => usaComputo(r, true)}>Prepara contratto</Button>
                  : bozza ? <Button size="sm" disabled={caricaEmail || !!email || salvaInCorso} onClick={() => void apriEmail(r)}>
                    <Mail className="size-4" aria-hidden="true" />Prepara email
                  </Button>
                  : <Button size="sm" disabled={salvaInCorso} onClick={() => setOfferta(r)}>Registra offerta</Button>)}
              </div>
            </div>
            {dettagli && <div className="space-y-3 border-t pt-3">
              {r.offerta && <p className="text-sm text-muted-foreground">Offerta del {dataIt(r.offerta.data)}{r.offerta.riferimento && ` · ${r.offerta.riferimento}`}</p>}
              <div className="flex flex-wrap gap-2">
                {azienda?.id === companyId && <Button size="sm" variant="outline" onClick={() => void import("@/lib/subappaltatori/richiestaOffertaPdf")
                  .then((m) => m.scaricaComputoRichiesta(r, azienda)).catch(() => toast.error("Non riesco a scaricare il PDF."))}>Scarica PDF</Button>}
                {bozza && <Button size="sm" variant="outline" disabled={salvaInCorso || caricaEmail || !!email}
                  onClick={() => void segnaInviata(r.id).catch((e: Error) => toast.error(e.message))}>Segna come inviata</Button>}
                {!contrattoId && !inModifica && (bozza || r.offerta) && <Button size="sm" variant="outline" disabled={salvaInCorso}
                  onClick={() => setOfferta(r)}>{r.offerta ? "Modifica offerta" : "Registra offerta"}</Button>}
                {!r.offerta && !contrattoId && <Button size="sm" variant="ghost" disabled={salvaInCorso} onClick={() => usaComputo(r, false)}>Prepara contratto dal computo</Button>}
              </div>
              <ComputoSubappaltoAnteprima dati={r} richiesta={r} />
            </div>}
            {inModifica && offerta && <RegistraOfferta key={r.id} richiesta={offerta} salvaInCorso={salvaInCorso} onAnnulla={() => setOfferta(undefined)} onSalva={(d) => {
              void aggiorna({ tipo: "offerta", id: r.id, offerta: d, precedente: offerta.offerta ?? null })
                .then(() => { setOfferta(undefined); toast.success("Offerta registrata."); })
                .catch((e: Error) => toast.error(e.message));
            }} />}
          </article>;
        })}
      </TabsContent>}
      <TabsContent value="contratti" className="space-y-3">
        <ContrattiSubappaltoCommessa companyId={companyId} orderId={orderId} dati={datiContratti.data} contrattoAperto={contrattoAperto}
          voci={misurate.data} affidamenti={affidamenti.data} inRicarica={datiContratti.isFetching || affidamenti.isFetching} />
      </TabsContent>
      {(scheda !== "offerte" || !disponibile) && <div className="mt-3 flex justify-end border-t pt-3">
        <Button size="sm" disabled={!ambiti.length} onClick={() => prepara(false, quotabili)}>Prepara contratto</Button>
      </div>}
    </Tabs>
    {email && <Suspense fallback={<p role="status">Apro l’email…</p>}>
      <EmailComposeDialog open context={email.context} companyIdOverride={companyId} onOpenChange={(open) => !open && setEmail(undefined)}
        documentSummary={{ title: "Computo per la ditta", mode: "pdf", rows: email.richiesta.righe.length }}
        onSent={() => {
          void segnaInviata(email.richiesta.id)
            .catch(() => toast.warning("Email inviata. Non riesco ad aggiornare lo stato della richiesta."));
        }} />
    </Suspense>}
  </section>;
}
