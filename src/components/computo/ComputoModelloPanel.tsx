import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, FileText, Layers3, Loader2, Palette, Plus, RotateCcw, Save, Settings2, Trash2, Type } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuoteTemplates } from "@/hooks/useQuoteTemplates";
import { useCondizioniArchivio } from "@/hooks/useCondizioniArchivio";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PdfBlobLivePreviewPanel } from "@/components/shared/PdfBlobLivePreviewPanel";
import { CondizioniContratto } from "@/components/preventivi/CondizioniContratto";
import { createPdfPreviewUrl } from "@/lib/pdfPreviewSource";
import { ComputoFormatoSchede, ComputoOpzione } from "./ComputoPdfControls";
import { bozzaDalModello, conCondizioniDellArchivio, leggiLogoPerPdf, leggiModelloComputo, modelloComputoDiSerie, modelloComputoSchema, useModelloComputo, useSalvaModelloComputo, vesteDalModello, type ModelloComputo, type VesteComputo } from "@/lib/computo/modelloComputo";
import { ComputoAssetUpload } from "./ComputoAssetUpload";
import { ComputoPagineModello } from "./ComputoPagineModello";
import { FONT_DOCUMENTO, cssFontDocumento, fontDelDocumento } from "@/lib/computo/fontDocumento";
import { bozzaVuota, voceVuota, vociPerAnteprima, numeroEditor } from "@/lib/computo/editorNativo";
import { aspettoDaOfferta } from "@/lib/computo/personalizzaDocumento";

const COPERTINE = [
  ["piena", "Architettura", "Colore pieno, trama tecnica e titolo in evidenza."],
  ["editoriale", "Editoriale", "Carta chiara, ampio respiro e dettagli del marchio."],
  ["fascia", "Compatta", "Una testata a colori, subito seguita dal preventivo."],
  ["sobria", "Essenziale", "Bianco, tipografia e un filetto sottile."],
] as const;
const COLORI = ["#1E3A5F", "#244C3A", "#8B4C36", "#252525", "#3746A0", "#A65A13"];

function bozzaEsempio(m: ModelloComputo) {
  const voce = (capitolo: string, descrizione: string, unita: string, quantita: string, prezzo: string) => ({ ...voceVuota(), capitolo, descrizione, unita, quantita, prezzo });
  return {
    ...bozzaDalModello(bozzaVuota(), m), titolo: "Una nuova casa,\nun nuovo inizio", committente: "Cliente di esempio", indirizzo: "Via dei Giardini 12 · Milano",
    oggetto: "Riqualificazione degli ambienti, nuovi serramenti e finiture interne", numero: "P-2026-001", dataDocumento: "19/11/2026",
    cronoprogramma: { ...bozzaVuota().cronoprogramma, fasi: [] },
    voci: [
      voce("Serramenti e schermature", "Finestra a due ante in PVC, vetrocamera basso emissiva", "cad", "4", "620"),
      voce("Serramenti e schermature", "Tapparella in alluminio coibentato, completa di guide", "cad", "4", "180"),
      voce("Opere e finiture", "Controparete in cartongesso con isolamento termoacustico", "mq", "32", "48"),
      voce("Opere e finiture", "Preparazione del fondo e tinteggiatura delle pareti", "mq", "90", "12"),
      voce("Impianto elettrico", "Punto presa completo di frutto, supporto e placca", "cad", "12", "65"),
      voce("Impianto elettrico", "Verifica funzionale e dichiarazione di conformità", "corpo", "1", "280"),
    ],
  };
}

function MiniCopertina({ tipo, colore, font }: { tipo: ModelloComputo["copertina"]; colore: string; font: string }) {
  const piena = tipo === "piena", editoriale = tipo === "editoriale";
  return <span aria-hidden="true" className="relative mx-auto mb-3 flex aspect-[.76] w-full max-w-32 flex-col overflow-hidden rounded-sm border p-3 shadow-sm"
    style={{ background: piena ? colore : editoriale ? "#FAF8F4" : "#FFFFFF", color: piena ? "#FFFFFF" : "#172033", fontFamily: font }}>
    {piena && <span className="absolute inset-0 opacity-10" style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "12px 12px" }} />}
    {editoriale && <span className="absolute right-0 top-0 h-[28%] w-[24%]" style={{ background: colore }} />}
    {tipo === "fascia" && <span className="absolute inset-x-0 top-0 h-1.5" style={{ background: colore }} />}
    <span className="relative text-[7px] font-bold tracking-widest">LA TUA AZIENDA</span>
    <span className={`relative text-[7px] tracking-wider ${piena || editoriale ? "mt-auto" : "mt-6"}`}>PREVENTIVO</span>
    <span className="relative mt-1 text-[15px] font-semibold leading-[1.05]">Il tuo<br />progetto.</span>
    <span className="relative mt-3 block h-px opacity-35" style={{ background: "currentColor" }} />
    <span className="relative mt-2 text-[6px] opacity-75">CLIENTE · DATA · RIFERIMENTO</span>
    {!piena && !editoriale && <span className="mt-3 space-y-1.5">{[1, 2, 3].map(n => <span key={n} className="block h-0.5 bg-slate-200" />)}</span>}
  </span>;
}

export default function ComputoModelloPanel({ canEdit }: { canEdit: boolean }) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const letto = useModelloComputo(companyId);
  const salva = useSalvaModelloComputo(companyId);
  const { templates, isLoading: modelliInCaricamento } = useQuoteTemplates();
  const archivio = useCondizioniArchivio();
  const offerte = templates.filter(t => (t.kind ?? "offerta") === "offerta");
  const [modello, setModello] = useState<ModelloComputo | null>(null);
  const [scheda, setScheda] = useState("aspetto");
  const [assetInCorso, setAssetInCorso] = useState(0);
  const [destinazioneCampo, setDestinazioneCampo] = useState<"premessa" | "piePagina" | "sopratitolo" | "condizioni" | "inclusioni" | "esclusioni" | "tempi" | "pagamenti" | "riferimentoPrezzi">("premessa");
  const [logo, setLogo] = useState<VesteComputo["logo"]>(null);
  useEffect(() => {
    let attivo = true;
    void leggiLogoPerPdf(effectiveCompany?.logo_url).then(l => { if (attivo) setLogo(l); });
    return () => { attivo = false; };
  }, [effectiveCompany?.logo_url]);
  // Anche la cache persistente può contenere un modello precedente all'ultimo aggiornamento.
  const salvato = useMemo(() => letto.data?.modello ? leggiModelloComputo(letto.data.modello) : undefined, [letto.data]);
  const m = modello ?? salvato ?? modelloComputoDiSerie();
  const cambiato = !!modello && JSON.stringify(modello) !== JSON.stringify(salvato ?? modelloComputoDiSerie());
  useSettingsDraftGuard(cambiato);
  const cambia = (patch: Partial<ModelloComputo>) => setModello(prev => ({ ...(prev ?? salvato ?? modelloComputoDiSerie()), ...patch }));
  const colore = m.colorePrimario || effectiveCompany?.brand_primary_color || "#1e3a5f";
  const aliquota = numeroEditor(m.ivaAliquota);
  const ivaInvalida = m.ivaModalita === "applicata" && (aliquota == null || aliquota < 0 || aliquota > 100);
  const modelloInvalido = !modelloComputoSchema.safeParse(m).success || ((m.fontFamiglia === "personalizzato" || m.fontTitoli === "personalizzato") && !m.fontPersonalizzato?.file);
  const font = fontDelDocumento(m.fontFamiglia)?.css ?? "Arial, sans-serif";
  const modelloDocumento = useMemo(() => conCondizioniDellArchivio(m, archivio.modelli), [m, archivio.modelli]);
  const contrattoTroppoLungo = modelloDocumento.condizioniContrattuali.length > 100000 || modelloDocumento.clausoleDaApprovare.length > 12000;
  const archivioInAttesa = !!archivio.inCaricamento || archivio.disponibile === false;
  const esempio = useMemo(() => bozzaEsempio(modelloDocumento), [modelloDocumento]);
  const nomeAzienda = effectiveCompany?.business_name || effectiveCompany?.name || "La tua azienda";
  const dettagliAzienda = [effectiveCompany?.legal_address, effectiveCompany?.legal_city, effectiveCompany?.vat_number && `P.IVA ${effectiveCompany.vat_number}`, effectiveCompany?.email, effectiveCompany?.phone].filter(Boolean).join(" | ");
  const depsKey = useMemo(() => JSON.stringify([modelloDocumento, logo, effectiveCompany?.id, nomeAzienda, dettagliAzienda, colore, archivioInAttesa]), [modelloDocumento, logo, effectiveCompany?.id, nomeAzienda, dettagliAzienda, colore, archivioInAttesa]);
  const anteprima = async () => {
    if (archivioInAttesa && m.sezioni.contrattuali) throw new Error("Verifica l’archivio dei contratti prima di generare il PDF.");
    if (contrattoTroppoLungo && m.sezioni.contrattuali) throw new Error("Il contratto supera il limite di 100.000 caratteri: riducilo nell’archivio prima di generare il PDF.");
    const { generaDocumentoComputo } = await import("@/lib/computo/esportaComputo");
    const b = esempio, v = vociPerAnteprima(b, b.formatoPdf === "senza-prezzi");
    const blob = await generaDocumentoComputo(v.voci, {
      companyId, titolo: b.titolo, committente: b.committente, oggetto: b.oggetto, indirizzoIntervento: b.indirizzo, numero: b.numero, dataDocumento: b.dataDocumento,
      stato: "", azienda: nomeAzienda, dettagliAzienda, colore,
      datiAzienda: { partitaIva: effectiveCompany?.vat_number, indirizzo: effectiveCompany?.legal_address, email: effectiveCompany?.email, telefono: effectiveCompany?.phone },
      senzaPrezzi: b.formatoPdf === "senza-prezzi", presentazione: b.formatoPdf === "cliente" ? "preventivo" : "tecnico",
      impaginazione: b.formatoPdf === "elenco-prezzi" ? "elenco-prezzi" : b.formatoPdf === "tecnico" || b.formatoPdf === "senza-prezzi" ? "primus" : "editoriale", soloRiepilogo: b.formatoPdf === "riepilogo",
      dettaglioMisure: true, riferimentoPrezzi: b.riferimentoPrezzi, condizioni: b.condizioni, inclusioni: b.inclusioni, esclusioni: b.esclusioni, tempi: b.tempi, pagamenti: b.pagamenti,
      ivaModalita: b.ivaModalita, ivaAliquota: b.ivaAliquota, ivaNota: "", veste: { ...vesteDalModello(modelloDocumento), logo }, sezioni: b.sezioniPdf,
      condizioniContrattuali: modelloDocumento.condizioniContrattuali, contrattoOrigine: modelloDocumento.contrattoOrigine, firmaCommittente: b.committente,
    }, []);
    return createPdfPreviewUrl(blob);
  };
  if (letto.isLoading || archivio.inCaricamento) return <p role="status" className="py-12 text-center text-sm text-muted-foreground">Carico il modello dell'azienda…</p>;
  if (letto.error) return <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">Non è stato possibile leggere il modello.<Button size="sm" variant="outline" onClick={() => { void letto.refetch(); }}>Riprova</Button></div>;
  const area = (label: string, key: "premessa" | "condizioni" | "inclusioni" | "esclusioni" | "tempi" | "pagamenti" | "riferimentoPrezzi", max: number, placeholder = "", rows = 3) =>
    <div className="space-y-1.5"><Label htmlFor={`modello-${key}`} className="text-xs">{label}</Label><Textarea id={`modello-${key}`} rows={rows} maxLength={max} placeholder={placeholder} value={m[key]} onFocus={() => setDestinazioneCampo(key)} onChange={e => cambia({ [key]: e.target.value })} /></div>;
  const fileOccupato = (busy: boolean) => setAssetInCorso(n => Math.max(0, n + (busy ? 1 : -1)));
  const fileProps = { companyId, onBusy: fileOccupato, disabled: !canEdit || salva.isPending || assetInCorso > 0 };
  const dimensione = (label: string, key: "dimensioneTitolo" | "dimensioneSottotitoli" | "dimensioneTesto", min: number, max: number, step = 1) => <div className="space-y-1.5"><Label htmlFor={`modello-${key}`} className="text-xs">{label}</Label><div className="flex items-center gap-2"><Input id={`modello-${key}`} type="number" min={min} max={max} step={step} value={m[key]} onChange={e => { const n = e.target.valueAsNumber; if (Number.isFinite(n) && n >= min && n <= max) cambia({ [key]: n }); }} /><span className="text-xs text-muted-foreground">pt</span></div></div>;

  return <section aria-label="Builder del preventivo" className="space-y-5">
    <style>{cssFontDocumento}</style>
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-gradient-to-br from-slate-50 via-white to-orange-50/40 p-5 sm:p-6">
      <div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border bg-white text-slate-700 shadow-sm"><Palette className="h-5 w-5" /></span>
        <div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground">Il documento della tua azienda</p><h2 className="mt-1 text-xl font-semibold tracking-tight">Un preventivo che ti rappresenta</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">Scegli lo stile, decidi cosa mostrare e controlla il PDF mentre lo personalizzi.</p></div></div>
      <div className="flex flex-wrap items-center gap-2">
        <span role="status" className={`mr-1 text-xs ${cambiato ? "text-amber-700" : "text-muted-foreground"}`}>{cambiato ? "Modifiche da salvare" : "Modello aziendale"}</span>
        {canEdit && <><Button variant="outline" size="sm" disabled={!cambiato || salva.isPending || assetInCorso > 0} onClick={() => setModello(null)}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Annulla modifiche</Button>
          <Button size="sm" disabled={(!cambiato && letto.data?.salvato) || salva.isPending || ivaInvalida || modelloInvalido || assetInCorso > 0 || (contrattoTroppoLungo || archivioInAttesa) && m.sezioni.contrattuali} onClick={() => {
            const daSalvare = m;
            salva.mutate(daSalvare, { onSuccess: () => { setModello(prev => prev && JSON.stringify(prev) !== JSON.stringify(daSalvare) ? prev : null); toast.success("Modello salvato", { description: "Le impostazioni sono disponibili nei documenti che usano questo modello." }); }, onError: e => toast.error((e as Error).message) });
          }}>{salva.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}Salva modello</Button></>}
      </div>
    </div>
    {!canEdit && <p role="note" className="rounded-lg bg-slate-50 p-3 text-sm text-muted-foreground">Il tuo ruolo consente di consultare il modello. Le modifiche sono riservate a chi gestisce i preventivi.</p>}
    {archivio.disponibile === false && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs">Archivio dei contratti non disponibile. Riprova prima di scaricare un documento con le condizioni.<Button type="button" size="sm" variant="outline" onClick={() => { void archivio.riprova?.(); }}>Riprova archivio</Button></div>}

    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <Tabs value={scheda} onValueChange={setScheda} className="min-w-0 rounded-2xl border bg-white">
        <TabsList aria-label="Personalizza il modello" className="grid h-auto w-full grid-cols-3 rounded-b-none rounded-t-2xl border-b bg-slate-50 p-2">
          <TabsTrigger value="aspetto" className="gap-1.5 py-2.5 text-xs"><Palette className="h-4 w-4" />Aspetto</TabsTrigger>
          <TabsTrigger value="pagine" className="gap-1.5 py-2.5 text-xs"><Layers3 className="h-4 w-4" />Pagine e contenuti</TabsTrigger>
          <TabsTrigger value="condizioni" className="gap-1.5 py-2.5 text-xs"><Settings2 className="h-4 w-4" />Condizioni</TabsTrigger>
        </TabsList>
        <fieldset disabled={!canEdit || salva.isPending} className="lg:max-h-[74dvh] lg:overflow-y-auto">
          <TabsContent value="aspetto" className="m-0 space-y-6 p-5">
            <div className="space-y-2"><Label htmlFor="modello-offerta" className="text-xs">Riprendi lo stile di un modello salvato</Label>
              <Select value={m.modelloOffertaId ?? "personalizzato"} disabled={modelliInCaricamento || !canEdit} onValueChange={id => {
                if (id === "personalizzato") cambia({ modelloOffertaId: null });
                else { const t = offerte.find(t => t.id === id); if (t) cambia(aspettoDaOfferta(t)); }
              }}><SelectTrigger id="modello-offerta"><SelectValue placeholder="Scegli un modello" /></SelectTrigger><SelectContent><SelectItem value="personalizzato">Stile personalizzato</SelectItem>{offerte.map(t => <SelectItem key={t.id} value={t.id}>{t.name}{t.is_default ? " · predefinito" : ""}</SelectItem>)}</SelectContent></Select>
              <p className="text-xs text-muted-foreground">Riprendi colori, font e stile delle tue offerte. Le condizioni restano quelle di questo modello.</p>
            </div>
            <div><h3 className="text-sm font-semibold">Scegli la copertina</h3><p className="mt-1 text-xs text-muted-foreground">Quattro stili pronti, tutti con i tuoi colori.</p>
              <div role="radiogroup" aria-label="Stile della copertina" className="mt-4 grid grid-cols-2 gap-3 2xl:grid-cols-4">
                {COPERTINE.map(([v, titolo, testo]) => <button key={v} type="button" role="radio" aria-label={titolo} aria-checked={m.copertina === v} onClick={() => cambia({ copertina: v })}
                  className={`relative min-w-0 rounded-xl border p-3 text-left transition-colors ${m.copertina === v ? "border-primary bg-orange-50/40 ring-1 ring-primary" : "border-slate-200 hover:border-slate-400"}`} title={testo}>
                  {m.copertina === v && <span className="absolute right-1.5 top-1.5 z-10 rounded-full bg-primary p-0.5 text-white"><Check className="h-3 w-3" /></span>}
                  <MiniCopertina tipo={v} colore={colore} font={font} /><span className="block text-center text-xs font-medium">{titolo}</span>
                </button>)}
              </div><p className="mt-3 text-xs text-muted-foreground">{COPERTINE.find(([v]) => v === m.copertina)?.[2]}</p>
            </div>
            <ComputoAssetUpload {...fileProps} tipo="copertina" label="Immagine di copertina" valore={m.immagineCopertina} onChange={immagineCopertina => cambia({ immagineCopertina })} />
            {!m.sezioni.copertina && m.immagineCopertina && <p className="text-xs text-amber-700">L'immagine è caricata. Attiva la copertina in «Pagine e contenuti» per mostrarla.</p>}
            <div className="border-t pt-5"><h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Type className="h-4 w-4 text-muted-foreground" />Carattere e colori</h3>
              <p className="mb-3 text-xs leading-relaxed text-muted-foreground">Nove caratteri già inclusi nel sistema. Scegli quello per i testi e, se vuoi, uno diverso per i titoli.</p>
              <div role="radiogroup" aria-label="Carattere del documento" className="grid grid-cols-3 gap-2">{FONT_DOCUMENTO.map(f => <button key={f.id} type="button" role="radio" aria-checked={m.fontFamiglia === f.id} aria-label={f.nome} onClick={() => cambia({ fontFamiglia: f.id })} className={`min-w-0 rounded-xl border p-3 text-left ${m.fontFamiglia === f.id ? "border-primary bg-orange-50/40 ring-1 ring-primary/20" : "border-slate-200 hover:border-slate-400"}`}><span className="block text-2xl" style={{ fontFamily: f.css }}>Aa</span><span className="mt-1 block break-words text-xs font-medium">{f.nome}</span><span className="text-[10px] text-muted-foreground">{f.stile}</span></button>)}</div>
              {m.fontFamiglia === "personalizzato" && m.fontPersonalizzato && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-muted-foreground">Questo modello conserva il carattere precedente «{m.fontPersonalizzato.nome}». Puoi sostituirlo scegliendo uno dei caratteri del sistema qui sopra.</p>}
              <div className="mt-4 space-y-3">
                <div className="space-y-1.5"><Label htmlFor="modello-font-titoli" className="text-xs">Carattere dei titoli</Label><Select value={m.fontTitoli ?? "uguale"} onValueChange={v => cambia({ fontTitoli: v === "uguale" ? null : v as ModelloComputo["fontTitoli"] })}><SelectTrigger id="modello-font-titoli"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="uguale">Come il testo</SelectItem>{FONT_DOCUMENTO.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}{m.fontPersonalizzato && <SelectItem value="personalizzato">Carattere precedente · {m.fontPersonalizzato.nome}</SelectItem>}</SelectContent></Select></div>
                <div className="grid gap-3 sm:grid-cols-3">{dimensione("Titolo di copertina", "dimensioneTitolo", 18, 48)}{dimensione("Titoli delle sezioni", "dimensioneSottotitoli", 9, 20)}{dimensione("Testo del documento", "dimensioneTesto", 8, 12, .5)}</div>
                <p className="text-xs text-muted-foreground">Il carattere scelto viene incluso nel PDF. I titoli molto lunghi si adattano allo spazio della copertina; le tabelle tecniche mantengono proporzioni adatte alle misure.</p>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">{COLORI.map(c => <button type="button" key={c} aria-label={`Colore ${c}`} aria-pressed={colore.toLowerCase() === c.toLowerCase()} className={`h-8 w-8 rounded-full border-2 border-white shadow-sm outline-offset-2 ${colore.toLowerCase() === c.toLowerCase() ? "outline outline-1 outline-slate-900" : ""}`} style={{ background: c }} onClick={() => cambia({ colorePrimario: c })} />)}
                <Label htmlFor="modello-colore" className="sr-only">Colore personalizzato</Label><input id="modello-colore" type="color" aria-label="Colore personalizzato" className="h-9 w-12 cursor-pointer rounded-lg border bg-white p-1" value={colore} onChange={e => cambia({ colorePrimario: e.target.value })} /><span className="text-xs uppercase text-muted-foreground">{colore}</span>
                {m.colorePrimario && <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => cambia({ colorePrimario: "" })}>Usa il marchio</Button>}
              </div>
            </div>
            <div className="space-y-4 border-t pt-5"><h3 className="text-sm font-semibold">Identità del documento</h3>
              <div className="space-y-1.5"><Label htmlFor="modello-sopratitolo" className="text-xs">Sopra il titolo</Label><Input id="modello-sopratitolo" maxLength={120} placeholder="PREVENTIVO · IL TUO PROGETTO" value={m.sopratitolo} onFocus={() => setDestinazioneCampo("sopratitolo")} onChange={e => cambia({ sopratitolo: e.target.value })} /></div>
              {area("Presentazione dell'offerta", "premessa", 3000, "Gentile cliente, ecco la nostra proposta per il tuo progetto…")}
              <ComputoOpzione label="Mostra il logo" checked={m.mostraLogo} onChange={mostraLogo => cambia({ mostraLogo })} />
              <ComputoAssetUpload {...fileProps} tipo="logo" label="Logo del modello" valore={m.logoPersonalizzato} onChange={logoPersonalizzato => cambia({ logoPersonalizzato, ...(logoPersonalizzato ? { mostraLogo: true } : {}) })} />
              {!m.logoPersonalizzato && <p className="text-xs text-muted-foreground">{effectiveCompany?.logo_url ? "Viene usato il logo del marchio aziendale." : "Carica un logo qui oppure in Impostazioni → Marchio."}</p>}
              <div className="space-y-3 rounded-xl border p-3"><div className="flex items-center justify-between gap-3"><Label htmlFor="modello-logo-larghezza" className="text-xs">Larghezza massima del logo</Label><span className="text-xs tabular-nums text-muted-foreground">{m.logoLarghezza} mm</span></div>
                <input id="modello-logo-larghezza" aria-label="Larghezza massima del logo" type="range" min={15} max={150} step={1} value={m.logoLarghezza} onChange={e => cambia({ logoLarghezza: Number(e.target.value) })} className="h-2 w-full cursor-pointer accent-primary" />
                <div className="flex items-center gap-2"><Input aria-label="Larghezza logo in millimetri" className="h-8 w-20" type="number" min={15} max={150} value={m.logoLarghezza} onChange={e => { const n = e.target.valueAsNumber; if (Number.isFinite(n) && n >= 15 && n <= 150) cambia({ logoLarghezza: n }); }} /><span className="text-xs text-muted-foreground">mm · proporzioni mantenute</span></div>
                <div role="radiogroup" aria-label="Allineamento del logo" className="grid grid-cols-3 gap-2">{([['sinistra', 'Sinistra'], ['centro', 'Centro'], ['destra', 'Destra']] as const).map(([valore, label]) => <button key={valore} type="button" role="radio" aria-checked={m.logoAllineamento === valore} onClick={() => cambia({ logoAllineamento: valore })} className={`rounded-lg border px-2 py-2 text-xs ${m.logoAllineamento === valore ? "border-primary bg-orange-50/40 font-medium" : "border-slate-200"}`}>{label}</button>)}</div>
                <ComputoOpzione label="Fondo bianco dietro il logo" checked={m.logoFondoBianco} onChange={logoFondoBianco => cambia({ logoFondoBianco })} />
                <p className="text-[11px] text-muted-foreground">Posizione e dimensioni nel preventivo cliente. Nel computo tecnico il logo resta nella testata per lasciare spazio alle misure.</p>
              </div>
              <ComputoOpzione label="Intestazione aziendale in alto a sinistra" checked={m.mostraIntestazione} onChange={mostraIntestazione => cambia({ mostraIntestazione })} />
              <p className="text-xs text-muted-foreground">Nome e recapiti nella testata. Il logo e il piè di pagina si gestiscono separatamente.</p>
              <div className="space-y-1.5"><Label htmlFor="modello-piede" className="text-xs">Testo a piè di pagina</Label><Input id="modello-piede" maxLength={200} placeholder={effectiveCompany?.business_name || "Nome dell'azienda"} value={m.piePagina} onFocus={() => setDestinazioneCampo("piePagina")} onChange={e => cambia({ piePagina: e.target.value })} /></div>
              <ComputoOpzione label="Numeri di pagina" checked={m.mostraNumeriPagina} onChange={mostraNumeriPagina => cambia({ mostraNumeriPagina })} />
            </div>
          </TabsContent>
          <TabsContent value="pagine" className="m-0 space-y-5 p-5">
            <ComputoPagineModello modello={m} onChange={cambia} contratto={modelloDocumento.contrattoOrigine} caricamento={archivio.inCaricamento} onGestisciContratto={() => setScheda("condizioni")} />
            <details className="border-t pt-4"><summary className="cursor-pointer text-sm font-medium">Formato del documento</summary><div className="mt-3"><ComputoFormatoSchede value={m.formatoPredefinito} onChange={formatoPredefinito => cambia({ formatoPredefinito })} disabled={!canEdit} /></div></details>
            {["tecnico", "senza-prezzi", "elenco-prezzi"].includes(m.formatoPredefinito) && <p className="text-xs text-muted-foreground">Il formato tecnico mantiene la tabella di computo. Copertina e pagina di accettazione fanno parte dei formati Preventivo cliente e Riepilogo per capitoli.</p>}
            <details className="border-t pt-5"><summary className="cursor-pointer text-sm font-semibold">Campi personalizzati <span className="ml-1 text-xs font-normal text-muted-foreground">{m.campiPersonalizzati.length} campi · testi e valori del modello</span></summary><div className="mt-4 space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold">Valori e riferimenti</h3><p className="mt-1 text-xs text-muted-foreground">Aggiungi i valori comuni del modello e richiamali nei testi.</p></div><Button type="button" size="sm" variant="outline" disabled={m.campiPersonalizzati.length >= 30} onClick={() => {
              let n = m.campiPersonalizzati.length + 1; while (m.campiPersonalizzati.some(c => c.chiave === `campo_${n}`)) n++;
              cambia({ campiPersonalizzati: [...m.campiPersonalizzati, { chiave: `campo_${n}`, etichetta: `Campo ${n}`, valore: "", mostraNelDocumento: true }] });
            }}><Plus className="mr-1 h-3.5 w-3.5" />Aggiungi campo</Button></div>
              {m.campiPersonalizzati.map((campo, index) => {
                const aggiorna = (patch: Partial<typeof campo>) => cambia({ campiPersonalizzati: m.campiPersonalizzati.map((c, k) => k === index ? { ...c, ...patch } : c) });
                return <div key={index} className="space-y-3 rounded-xl border bg-slate-50/50 p-3"><div className="flex items-end gap-2"><div className="min-w-0 flex-1 space-y-1"><Label htmlFor={`campo-nome-${index}`} className="text-xs">Nome del campo {index + 1}</Label><Input id={`campo-nome-${index}`} maxLength={80} value={campo.etichetta} onChange={e => aggiorna({ etichetta: e.target.value })} /></div><Button type="button" variant="ghost" size="icon" aria-label={`Elimina campo ${index + 1}`} onClick={() => cambia({ campiPersonalizzati: m.campiPersonalizzati.filter((_, k) => k !== index) })}><Trash2 className="h-4 w-4" /></Button></div>
                  <div className="space-y-1"><Label htmlFor={`campo-codice-${index}`} className="text-xs">Codice per i testi {index + 1}</Label><Input id={`campo-codice-${index}`} maxLength={48} value={campo.chiave} onChange={e => aggiorna({ chiave: e.target.value })} /><p className="text-[11px] text-muted-foreground">{`{{custom.${campo.chiave}}}`} · lettere, numeri e underscore; inizia con una lettera.</p></div>
                  <div className="space-y-1"><Label htmlFor={`campo-valore-${index}`} className="text-xs">Valore predefinito {index + 1}</Label><Textarea id={`campo-valore-${index}`} maxLength={3000} rows={2} value={campo.valore} onChange={e => aggiorna({ valore: e.target.value })} /></div>
                  <ComputoOpzione label={`Mostra ${campo.etichetta || `campo ${index + 1}`} nei dati del lavoro`} checked={campo.mostraNelDocumento} onChange={mostraNelDocumento => aggiorna({ mostraNelDocumento })} />
                </div>;
              })}
              <div className="space-y-2 rounded-xl bg-slate-50 p-3"><Label htmlFor="modello-campo-destinazione" className="text-xs">Inserisci un riferimento in</Label><Select value={destinazioneCampo} onValueChange={v => setDestinazioneCampo(v as typeof destinazioneCampo)}><SelectTrigger id="modello-campo-destinazione"><SelectValue /></SelectTrigger><SelectContent>{[["premessa", "Presentazione"], ["sopratitolo", "Sopra il titolo"], ["piePagina", "Piè di pagina"], ["condizioni", "Note e condizioni"], ["inclusioni", "Inclusioni"], ["esclusioni", "Esclusioni"], ["tempi", "Tempi"], ["pagamenti", "Pagamenti"], ["riferimentoPrezzi", "Riferimenti dei prezzi"]].map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}</SelectContent></Select>
                <div className="flex flex-wrap gap-1.5">{[["Cliente", "cliente.nome_completo"], ["Azienda", "azienda.ragione_sociale"], ["Numero", "preventivo.numero"], ["Data", "preventivo.data"], ["Indirizzo", "cantiere.indirizzo"], ["Totale", "preventivo.totale"], ...m.campiPersonalizzati.map(c => [c.etichetta, `custom.${c.chiave}`])].map(([label, tag], index) => <Button key={`${tag}-${index}`} type="button" size="sm" variant="outline" className="h-auto whitespace-normal px-2 py-1 text-xs" onClick={() => {
                  const valore = `${m[destinazioneCampo]}${m[destinazioneCampo] ? " " : ""}{{${tag}}}`;
                  const max = destinazioneCampo === "sopratitolo" ? 120 : destinazioneCampo === "piePagina" ? 200 : destinazioneCampo === "condizioni" ? 12000 : ["inclusioni", "esclusioni"].includes(destinazioneCampo) ? 6000 : destinazioneCampo === "riferimentoPrezzi" ? 2000 : 3000;
                  if (valore.length <= max) { cambia({ [destinazioneCampo]: valore }); toast.success("Riferimento inserito"); } else toast.error("Il testo ha raggiunto la lunghezza massima.");
                }}>{label}</Button>)}</div><p className="text-[11px] text-muted-foreground">I riferimenti vengono compilati nel PDF. Puoi anche scriverli direttamente tra doppie parentesi graffe.</p></div>
              {modelloInvalido && <p role="alert" className="text-xs text-amber-800">Completa i nomi dei campi e usa codici validi e diversi prima di salvare.</p>}
            </div></details>
          </TabsContent>
          <TabsContent value="condizioni" className="m-0 space-y-5 p-5">
            <div><h3 className="text-base font-semibold">Contratto e condizioni dell'offerta</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Il contratto si scrive in «Contratti e condizioni». Qui scegli quello da includere; le note operative completano la proposta.</p></div>
            {contrattoTroppoLungo && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Il contratto supera i limiti del documento. Riducilo nell'archivio: il testo non viene troncato automaticamente.</p>}
            <CondizioniContratto companyId={companyId} settore="generico" nomeModulo="Preventivo" testo={m.condizioniContrattuali} modelloAssociatoId={m.condizioniModelloId} attivo={m.sezioni.contrattuali} onAttivo={v => cambia({ sezioni: { ...m.sezioni, contrattuali: v } })} onAssocia={id => cambia({ condizioniModelloId: id })} />
            <p className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-muted-foreground">{m.sezioni.contrattuali ? "Il contratto completo viene incluso nello stesso PDF del preventivo. Le clausole richieste compaiono anche nell'approvazione separata se la pagina di accettazione è attiva." : "Il contratto è escluso dal PDF. Puoi riattivarlo anche da «Pagine e contenuti»."} I documenti già emessi conservano le proprie condizioni.</p>
            <div className="border-t pt-4"><h3 className="text-sm font-semibold">Dati economici e note operative</h3><p className="mt-1 text-xs text-muted-foreground">Valori di partenza modificabili nel singolo preventivo.</p></div>
            <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label htmlFor="modello-iva" className="text-xs">IVA predefinita</Label><Select value={m.ivaModalita} onValueChange={v => cambia({ ivaModalita: v as ModelloComputo["ivaModalita"] })}><SelectTrigger id="modello-iva"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="da-definire">Da definire</SelectItem><SelectItem value="applicata">Applica IVA</SelectItem><SelectItem value="non-applicabile">Non applicabile</SelectItem></SelectContent></Select></div>
              {m.ivaModalita === "applicata" && <div className="space-y-1.5"><Label htmlFor="modello-aliquota" className="text-xs">Aliquota %</Label><Input id="modello-aliquota" aria-invalid={ivaInvalida} inputMode="decimal" maxLength={6} value={m.ivaAliquota} onChange={e => cambia({ ivaAliquota: e.target.value })} /></div>}</div>
            {ivaInvalida && <p role="alert" className="text-xs text-amber-800">Inserisci un'aliquota IVA valida tra 0 e 100 prima di salvare.</p>}
            {area("Note operative della proposta", "condizioni", 12000, "Validità dell'offerta, garanzie, varianti…")}
            {area("Lavorazioni incluse", "inclusioni", 6000)}{area("Esclusioni e limiti", "esclusioni", 6000)}
            <div className="grid gap-4 sm:grid-cols-2">{area("Tempi di esecuzione", "tempi", 3000)}{area("Modalità di pagamento", "pagamenti", 3000)}</div>
            {area("Riferimenti dei prezzi", "riferimentoPrezzi", 2000, "Prezzario di riferimento o prezzi dell'impresa", 2)}
            <div className="space-y-4 border-t pt-5"><h3 className="flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4 text-muted-foreground" />Contratto e accettazione</h3>
              <div className="space-y-1.5"><Label htmlFor="modello-firmatario" className="text-xs">Chi firma per l'impresa</Label><Input id="modello-firmatario" maxLength={160} value={m.firmatario} onChange={e => cambia({ firmatario: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="modello-clausole" className="text-xs">Clausole da approvare separatamente, una per riga</Label><Textarea id="modello-clausole" rows={3} value={modelloDocumento.clausoleDaApprovare} readOnly placeholder="Nessuna clausola richiede approvazione separata" /><p className="text-xs text-muted-foreground">Le clausole e la richiesta di approvazione si modificano nel contratto in archivio. Nel PDF compaiono solo con contratto e accettazione attivi.</p></div>
              <div className="space-y-1.5"><Label htmlFor="modello-validita" className="text-xs">Validità dell'offerta (giorni)</Label><Input id="modello-validita" type="number" min={1} max={365} value={m.giorniValidita} onChange={e => { const n = e.target.valueAsNumber; if (Number.isInteger(n) && n >= 1 && n <= 365) cambia({ giorniValidita: n }); }} /></div>
            </div>
          </TabsContent>
        </fieldset>
      </Tabs>
      <aside aria-label="Anteprima del modello" className="min-w-0 lg:sticky lg:top-4">
        <div className="mb-3 flex items-center justify-between gap-2"><div><h3 className="text-sm font-semibold">Il tuo documento, in anteprima</h3><p className="mt-0.5 text-xs text-muted-foreground">Dati dimostrativi · stesso PDF del download</p></div><span className="rounded-full border bg-white px-2.5 py-1 text-[10px] font-medium text-muted-foreground">A4</span></div>
        <div className="h-[76dvh] min-h-[520px] overflow-hidden rounded-2xl border bg-slate-100 shadow-sm"><PdfBlobLivePreviewPanel renderBlobUrl={anteprima} depsKey={depsKey} debounceMs={500} downloadFileName="modello-preventivo.pdf" headerLabel="Anteprima PDF" showDownloadOnMobile /></div>
      </aside>
    </div>
  </section>;
}
