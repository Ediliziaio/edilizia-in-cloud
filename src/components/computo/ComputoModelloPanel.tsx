/**
 * Impostazioni → Modelli preventivi → Computo metrico: il modello del
 * «Preventivo con computo» dell'azienda, con l'anteprima del PDF su un
 * computo d'esempio. Come per le offerte del preventivo classico, la veste
 * si decide una volta qui e ogni computo la usa; le condizioni sono quelle
 * con cui parte un computo nuovo, e nel singolo preventivo si cambiano.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuoteTemplates } from "@/hooks/useQuoteTemplates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PdfBlobLivePreviewPanel } from "@/components/shared/PdfBlobLivePreviewPanel";
import { createPdfPreviewUrl } from "@/lib/pdfPreviewSource";
import { ComputoFormatoSchede, ComputoOpzione } from "./ComputoPdfControls";
import { bozzaVuota, voceVuota, vociPerAnteprima, type BozzaComputo } from "@/lib/computo/editorNativo";
import { leggiLogoPerPdf, modelloComputoDiSerie, useModelloComputo, useSalvaModelloComputo, vesteDalModello, type ModelloComputo, type VesteComputo } from "@/lib/computo/modelloComputo";

const COPERTINE = [
  ["piena", "Fascia piena", "La prima pagina si apre col colore del marchio."],
  ["fascia", "Banda sottile", "Un filo di colore in alto, testo scuro su bianco."],
  ["sobria", "Sobria", "Niente colore: titolo, filetto e dati del lavoro."],
] as const;

/** Un computo d'esempio, lo stesso per tutti: basta a vedere copertina, capitoli, riepilogo e firme. */
function bozzaEsempio(m: ModelloComputo): BozzaComputo {
  const voce = (capitolo: string, descrizione: string, unita: string, quantita: string, prezzo: string) => ({ ...voceVuota(), capitolo, descrizione, unita, quantita, prezzo });
  return {
    ...bozzaVuota(), titolo: "Campo da tennis in resina", committente: "Circolo Tennis Esempio", indirizzo: "Via dello Sport 1, 20900 Monza (MB)",
    oggetto: "Realizzazione di un campo da tennis 18 × 36 m con recinzione e illuminazione", numero: "P-2026-001", dataDocumento: new Date().toLocaleDateString("it-IT"),
    formatoPdf: m.formatoPredefinito, condizioni: m.condizioni, inclusioni: m.inclusioni, esclusioni: m.esclusioni, tempi: m.tempi, pagamenti: m.pagamenti,
    riferimentoPrezzi: m.riferimentoPrezzi, ivaModalita: m.ivaModalita, ivaAliquota: m.ivaAliquota,
    voci: [
      voce("Scavi e sottofondi", "Scavo di sbancamento dell'area del campo, profondità media 40 cm", "mc", "259,2", "12"),
      voce("Scavi e sottofondi", "Sottofondo in misto stabilizzato, spessore 30 cm, rullato", "mc", "194,4", "38"),
      voce("Pavimentazione sportiva", "Manto in resina acrilica a più strati, colori a scelta", "mq", "648", "32"),
      voce("Pavimentazione sportiva", "Tracciatura delle linee di gioco", "corpo", "1", "650"),
      voce("Recinzione e illuminazione", "Recinzione perimetrale h 4 m in rete plastificata", "m", "108", "85"),
      voce("Recinzione e illuminazione", "Proiettore LED 400 W su palo da 10 m", "cad", "8", "1100"),
    ],
  };
}

export default function ComputoModelloPanel({ canEdit }: { canEdit: boolean }) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const letto = useModelloComputo(companyId);
  // Le condizioni già scritte nelle offerte del preventivo classico: si possono riprendere qui.
  const { templates } = useQuoteTemplates();
  const offerteConCondizioni = (templates ?? []).filter(t => (t.contractual_terms_text ?? "").trim() || (t.legal_terms_text ?? "").trim());
  const salva = useSalvaModelloComputo(companyId);
  const [modello, setModello] = useState<ModelloComputo | null>(null);
  const salvato = letto.data?.modello;
  const [logo, setLogo] = useState<VesteComputo["logo"]>(null);
  const logoUrl = effectiveCompany?.logo_url;
  useEffect(() => {
    let attivo = true;
    void leggiLogoPerPdf(logoUrl).then(l => { if (attivo) setLogo(l); });
    return () => { attivo = false; };
  }, [logoUrl]);

  const m = modello ?? salvato ?? modelloComputoDiSerie();
  const cambiato = !!modello && !!salvato && JSON.stringify(modello) !== JSON.stringify(salvato);
  const cambia = (patch: Partial<ModelloComputo>) => setModello({ ...m, ...patch });
  const colore = m.colorePrimario || effectiveCompany?.brand_primary_color || "#1e3a8a";

  const esempio = useMemo(() => bozzaEsempio(m), [m]);
  const depsKey = useMemo(() => JSON.stringify([m, !!logo, effectiveCompany?.id]), [m, logo, effectiveCompany?.id]);
  const anteprima = async () => {
    const { generaDocumentoComputo } = await import("@/lib/computo/esportaComputo");
    const b = esempio; const v = vociPerAnteprima(b, b.formatoPdf === "senza-prezzi");
    const dettagli = [effectiveCompany?.legal_address, effectiveCompany?.legal_city, effectiveCompany?.vat_number && `P.IVA ${effectiveCompany.vat_number}`, effectiveCompany?.email, effectiveCompany?.phone].filter(Boolean).join(" | ");
    const blob = await generaDocumentoComputo(v.voci, {
      titolo: b.titolo, committente: b.committente, oggetto: b.oggetto, indirizzoIntervento: b.indirizzo, numero: b.numero, dataDocumento: b.dataDocumento,
      stato: "", azienda: effectiveCompany?.business_name || effectiveCompany?.name || "La tua azienda", dettagliAzienda: dettagli, colore,
      senzaPrezzi: b.formatoPdf === "senza-prezzi", presentazione: b.formatoPdf === "cliente" ? "preventivo" : "tecnico",
      impaginazione: b.formatoPdf === "elenco-prezzi" ? "elenco-prezzi" : b.formatoPdf === "tecnico" || b.formatoPdf === "senza-prezzi" ? "primus" : "editoriale", soloRiepilogo: b.formatoPdf === "riepilogo",
      dettaglioMisure: true, riferimentoPrezzi: b.riferimentoPrezzi, condizioni: b.condizioni, inclusioni: b.inclusioni, esclusioni: b.esclusioni, tempi: b.tempi, pagamenti: b.pagamenti,
      ivaModalita: b.ivaModalita, ivaAliquota: b.ivaAliquota, ivaNota: "", veste: { ...vesteDalModello(m), logo },
      condizioniContrattuali: m.condizioniContrattuali, firmaCommittente: b.committente,
    }, []);
    return createPdfPreviewUrl(blob);
  };

  if (letto.isLoading) return <p role="status" className="text-sm text-muted-foreground">Carico il modello del computo…</p>;
  if (letto.error) return <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">Il modello del computo non si legge adesso.<Button size="sm" variant="outline" onClick={() => { void letto.refetch(); }}>Riprova</Button></div>;

  const area = (label: string, key: "premessa" | "condizioni" | "inclusioni" | "esclusioni" | "tempi" | "pagamenti" | "riferimentoPrezzi", max: number, placeholder = "", rows = 3) =>
    <div className="space-y-1"><Label htmlFor={`modello-${key}`} className="text-xs">{label}</Label>
      <Textarea id={`modello-${key}`} rows={rows} maxLength={max} placeholder={placeholder} value={m[key]} disabled={!canEdit} onChange={e => cambia({ [key]: e.target.value })} /></div>;

  return <section aria-label="Modello del computo metrico" className="grid gap-5 xl:grid-cols-2">
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><h2 className="text-lg font-semibold leading-tight">Preventivo con computo</h2>
          <p className="text-sm text-muted-foreground">La veste del PDF e le condizioni con cui parte ogni computo nuovo. Nel singolo preventivo si possono sempre cambiare.</p></div>
        {canEdit && <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={salva.isPending} onClick={() => setModello(modelloComputoDiSerie())}><RotateCcw className="mr-1 h-4 w-4" />Valori di serie</Button>
          <Button size="sm" disabled={!cambiato && letto.data?.salvato || salva.isPending} onClick={() => {
            salva.mutate(m, { onSuccess: () => toast.success("Modello del computo salvato", { description: "Lo usano i computi da adesso in poi." }), onError: e => toast.error((e as Error).message) });
          }}>{salva.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}Salva modello</Button>
        </div>}
      </div>
      {!canEdit && <p role="note" className="rounded-md bg-slate-50 p-2 text-xs text-muted-foreground">Solo chi gestisce i modelli dei preventivi può cambiarlo.</p>}

      <fieldset disabled={!canEdit} className="space-y-4">
        <section aria-label="Aspetto" className="space-y-3 rounded-xl border bg-white p-4">
          <h3 className="text-sm font-semibold">Aspetto</h3>
          <div role="radiogroup" aria-label="Copertina" className="grid gap-2 sm:grid-cols-3">
            {COPERTINE.map(([v, titolo, testo]) => <button key={v} type="button" role="radio" aria-checked={m.copertina === v} onClick={() => cambia({ copertina: v })}
              className={`rounded-lg border p-3 text-left transition-colors ${m.copertina === v ? "border-orange-400 bg-orange-50 ring-1 ring-orange-300" : "border-slate-200 bg-white hover:border-orange-200"}`}>
              <span className="mb-2 block h-8 overflow-hidden rounded border bg-white" aria-hidden="true">
                {v === "piena" && <span className="block h-full" style={{ background: colore }} />}
                {v === "fascia" && <span className="block h-1.5" style={{ background: colore }} />}
                {v === "sobria" && <span className="mx-2 mt-5 block h-px" style={{ background: colore }} />}
              </span>
              <span className="block text-sm font-medium">{titolo}</span><span className="block text-xs text-muted-foreground">{testo}</span>
            </button>)}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label htmlFor="modello-colore" className="text-xs">Colore del documento</Label>
              <div className="flex items-center gap-2">
                <input id="modello-colore" type="color" aria-label="Colore del documento" className="h-9 w-12 cursor-pointer rounded border bg-white p-1" value={colore} onChange={e => cambia({ colorePrimario: e.target.value })} />
                <span className="text-xs text-muted-foreground">{m.colorePrimario ? m.colorePrimario.toUpperCase() : "Quello del marchio"}</span>
                {m.colorePrimario && <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => cambia({ colorePrimario: "" })}>Usa il marchio</Button>}
              </div></div>
            <div className="space-y-1"><Label htmlFor="modello-sopratitolo" className="text-xs">Sopra il titolo</Label>
              <Input id="modello-sopratitolo" className="h-9" maxLength={120} placeholder="PREVENTIVO / COMPUTO METRICO ESTIMATIVO" value={m.sopratitolo} onChange={e => cambia({ sopratitolo: e.target.value })} /></div>
          </div>
          <div className="rounded-lg border px-3">
            <ComputoOpzione label={effectiveCompany?.logo_url ? "Logo dell'azienda in copertina" : "Logo in copertina (caricalo in Impostazioni → Marchio)"} checked={m.mostraLogo && !!effectiveCompany?.logo_url} disabled={!effectiveCompany?.logo_url || !canEdit} onChange={mostraLogo => cambia({ mostraLogo })} />
            <ComputoOpzione label="Firme dell'impresa e del committente in fondo" checked={m.mostraFirma} disabled={!canEdit} onChange={mostraFirma => cambia({ mostraFirma })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label htmlFor="modello-firmatario" className="text-xs">Chi firma per l'impresa</Label>
              <Input id="modello-firmatario" className="h-9" maxLength={160} placeholder={effectiveCompany?.business_name || "Nome e ruolo"} value={m.firmatario} onChange={e => cambia({ firmatario: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="modello-piede" className="text-xs">Piè di pagina</Label>
              <Input id="modello-piede" className="h-9" maxLength={200} placeholder={effectiveCompany?.business_name || "Nome dell'azienda"} value={m.piePagina} onChange={e => cambia({ piePagina: e.target.value })} /></div>
          </div>
          {area("Premessa in prima pagina", "premessa", 3000, "Es. Gentile cliente, ecco il computo delle lavorazioni concordate in sopralluogo…", 3)}
        </section>

        <section aria-label="Documento di serie" className="space-y-2 rounded-xl border bg-white p-4">
          <h3 className="text-sm font-semibold">Documento di serie</h3>
          <ComputoFormatoSchede value={m.formatoPredefinito} onChange={formatoPredefinito => cambia({ formatoPredefinito })} disabled={!canEdit} />
        </section>

        <section aria-label="Condizioni di serie" className="space-y-3 rounded-xl border bg-white p-4">
          <h3 className="text-sm font-semibold">Condizioni con cui parte ogni computo</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label htmlFor="modello-iva" className="text-xs">IVA</Label>
              <Select value={m.ivaModalita} onValueChange={v => cambia({ ivaModalita: v as ModelloComputo["ivaModalita"] })}>
                <SelectTrigger id="modello-iva" className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="da-definire">Da definire</SelectItem><SelectItem value="applicata">Applica IVA</SelectItem><SelectItem value="non-applicabile">IVA non applicabile</SelectItem></SelectContent>
              </Select></div>
            {m.ivaModalita === "applicata" && <div className="space-y-1"><Label htmlFor="modello-aliquota" className="text-xs">Aliquota</Label>
              <Select value={m.ivaAliquota} onValueChange={ivaAliquota => cambia({ ivaAliquota })}>
                <SelectTrigger id="modello-aliquota" className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{["4", "5", "10", "22"].map(a => <SelectItem key={a} value={a}>{a}%</SelectItem>)}</SelectContent>
              </Select></div>}
          </div>
          {area("Note e condizioni", "condizioni", 12000, "Validità dell'offerta, garanzie, varianti…")}
          <div className="grid gap-3 sm:grid-cols-2">
            {area("Lavorazioni incluse", "inclusioni", 6000)}{area("Esclusioni e limiti", "esclusioni", 6000)}
            {area("Tempi di esecuzione", "tempi", 3000)}{area("Modalità di pagamento", "pagamenti", 3000, "Es. 30% alla firma, 40% a metà lavori, saldo a fine lavori")}
          </div>
          {area("Riferimenti dei prezzi", "riferimentoPrezzi", 2000, "Es. Prezzario Regione Lombardia 2026, prezzi dell'impresa", 2)}
        </section>

        <section aria-label="Condizioni contrattuali" className="space-y-3 rounded-xl border bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><h3 className="text-sm font-semibold">Condizioni contrattuali e firma</h3>
              <p className="text-xs text-muted-foreground">Escono prima della pagina «Accettazione proposta». Titoli con «#», punti con «- ».</p></div>
            {offerteConCondizioni.length > 0 && <Select value="" onValueChange={id => { const o = offerteConCondizioni.find(t => t.id === id); if (o) cambia({ condizioniContrattuali: [o.contractual_terms_text, o.legal_terms_text].filter(Boolean).join("\n\n").slice(0, 20000) }); }}>
              <SelectTrigger aria-label="Prendi le condizioni da un'offerta" className="h-8 w-60 text-xs"><SelectValue placeholder="Prendi da un'offerta del preventivo classico" /></SelectTrigger>
              <SelectContent>{offerteConCondizioni.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
            </Select>}
          </div>
          <div className="space-y-1"><Label htmlFor="modello-contrattuali" className="text-xs">Condizioni contrattuali</Label>
            <Textarea id="modello-contrattuali" rows={8} maxLength={20000} placeholder={"# Condizioni contrattuali\n## 1. Oggetto del contratto\n- …\n## 2. Prezzi e pagamenti\n- …"} value={m.condizioniContrattuali} onChange={e => cambia({ condizioniContrattuali: e.target.value })} /></div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <div className="space-y-1"><Label htmlFor="modello-clausole" className="text-xs">Clausole da approvare con una seconda firma (artt. 1341-1342 c.c.), una per riga</Label>
              <Textarea id="modello-clausole" rows={3} maxLength={3000} placeholder={"Art. 5 - Varianti in corso d'opera\nArt. 9 - Foro competente"} value={m.clausoleDaApprovare} onChange={e => cambia({ clausoleDaApprovare: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="modello-validita" className="text-xs">Validità dell'offerta (giorni)</Label>
              <Input id="modello-validita" className="h-9 tabular-nums" inputMode="numeric" value={String(m.giorniValidita)} onChange={e => { const n = Number.parseInt(e.target.value, 10); cambia({ giorniValidita: Number.isFinite(n) && n > 0 ? Math.min(365, n) : 30 }); }} /></div>
          </div>
        </section>
      </fieldset>
    </div>
    <aside aria-label="Anteprima del modello" className="min-w-0 xl:sticky xl:top-4 xl:self-start">
      <p className="mb-2 text-xs text-muted-foreground">Anteprima su un computo d'esempio: si aggiorna mentre cambi il modello.</p>
      <div className="h-[75dvh] min-h-[480px]"><PdfBlobLivePreviewPanel renderBlobUrl={anteprima} depsKey={depsKey} debounceMs={700} downloadFileName="modello-computo.pdf" /></div>
    </aside>
  </section>;
}
