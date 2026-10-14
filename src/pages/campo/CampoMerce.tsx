/**
 * «Merce presa» — l'operaio ha ritirato o comprato della merce (Tecnomat, Leroy Merlin, un
 * rivenditore) e ha in mano una bolla, uno scontrino o una fattura.
 *
 *   1. fotografa il documento: il sistema lo legge (fornitore, numero, prodotti, totale);
 *   2. dice COME l'ha presa: l'ha pagata lui, è sul conto dell'azienda, o è un ordine già fatto;
 *   3. controlla, sceglie il cantiere, invia: l'ufficio verifica prima che il costo conti.
 *
 * Niente costo e niente rimborso finché l'ufficio non dice sì: qui si segna, non si registra.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useFormDraft } from "@/hooks/campo/useFormDraft";
import { supabase } from "@/integrations/supabase/client";
import { ImgRiservata } from "@/components/common/ImgRiservata";
import { useCampoAssignments } from "@/hooks/campo/useCampoAssignments";
import { useCampoDayTime } from "@/hooks/campo/useCampoDayTime";
import { useAnnullaAcquisto, useMieiAcquisti, useRegistraAcquisto } from "@/hooks/campo/useCampoAcquisti";
import { elaboraFotoDocumento, type FotoDocumento } from "@/lib/campo/leggiDocumentoAcquisto";
import {
  MODALITA, cambiaQuantita, descriviStato, euro, numeroDocumento, tipoDocumentoDa, totaleRighe,
  type LetturaDocumento, type ModalitaAcquisto, type RigaAcquisto,
} from "@/lib/campo/acquisti";
import { messaggioErrore } from "@/lib/campo/messaggioErrore";
import { cn } from "@/lib/utils";

type FaseFoto = "nessuna" | "leggo" | "letto" | "non_letto";
type RigaModulo = RigaAcquisto & { quantitaTesto?: string };
type TipoDocumento = "bolla" | "scontrino" | "fattura" | "altro";
const liberaAnteprima = (url?: string) => { if (url?.startsWith("blob:")) URL.revokeObjectURL?.(url); };

const campo = "h-11 w-full min-w-0 rounded-xl border bg-background px-3 text-base";

export default function CampoMerce() {
  const { user, profile } = useAuth();
  return <CampoMerceEditor key={`${profile?.company_id}:${user?.id}`} />;
}

function CampoMerceEditor() {
  const { user, profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const assegnazioni = useCampoAssignments();
  const dayTime = useCampoDayTime(user?.id, companyId);
  const registra = useRegistraAcquisto();
  const annulla = useAnnullaAcquisto();
  const miei = useMieiAcquisti();
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fotoTask = useRef(0);
  const fotoInCorso = useRef(false);
  const invioInCorso = useRef(false);
  const anteprima = useRef<string | undefined>(undefined);

  const [foto, setFoto] = useState<FotoDocumento | null>(null);
  const [fase, setFase] = useState<FaseFoto>("nessuna");
  const [lettura, setLettura] = useState<LetturaDocumento | null>(null);
  const [modalita, setModalita] = useState<ModalitaAcquisto | "">("");
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento | "">("");
  const [nuovaFoto, setNuovaFoto] = useState<File | null>(null);
  const [invioAttivo, setInvioAttivo] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [fornitore, setFornitore] = useState("");
  const [numero, setNumero] = useState("");
  const [data, setData] = useState("");
  const [totale, setTotale] = useState("");
  const [righe, setRighe] = useState<RigaModulo[]>([]);
  const [note, setNote] = useState("");
  const bozza = useFormDraft(`merce:${companyId}:${user?.id}:ritiro`, {
    fotoPath: null as string | null, lettura: null as LetturaDocumento | null,
    modalita: "" as ModalitaAcquisto | "", tipoDocumento: "" as TipoDocumento | "", orderId: "", fornitore: "", numero: "", data: "", totale: "", righe: [] as RigaModulo[], note: "",
  });
  const [ripresaDecisa, setRipresaDecisa] = useState(!bozza.hasSavedDraft);
  const bozzaAttivata = useRef(false);
  const aggiornaBozza = bozza.updateDraft;
  const contenutoBozza = useMemo(() => ({ fotoPath: foto?.path ?? null, lettura, modalita, tipoDocumento, orderId, fornitore, numero, data, totale, righe, note }),
    [foto?.path, lettura, modalita, tipoDocumento, orderId, fornitore, numero, data, totale, righe, note]);
  useEffect(() => {
    if (!ripresaDecisa || !user?.id || !companyId) return;
    if (bozzaAttivata.current || contenutoBozza.fotoPath || contenutoBozza.fornitore || contenutoBozza.totale || contenutoBozza.righe.length || contenutoBozza.note || contenutoBozza.modalita) {
      bozzaAttivata.current = true; aggiornaBozza(contenutoBozza);
    }
  }, [contenutoBozza, ripresaDecisa, user?.id, companyId, aggiornaBozza]);
  const riprendiBozza = () => {
    const b = bozza.draft;
    const text = (v: unknown) => typeof v === "string" ? v : "";
    setOrderId(text(b.orderId)); setFornitore(text(b.fornitore)); setNumero(text(b.numero)); setData(text(b.data)); setTotale(text(b.totale)); setNote(text(b.note));
    setModalita(MODALITA.some(m => m.key === b.modalita) ? b.modalita : "");
    setTipoDocumento(["bolla", "scontrino", "fattura", "altro"].includes(b.tipoDocumento) ? b.tipoDocumento : "");
    setRighe(Array.isArray(b.righe) ? b.righe.filter(r => r && typeof r.descrizione === "string" && typeof r.quantita === "number") : []);
    setLettura(b.lettura && typeof b.lettura === "object" ? b.lettura : null);
    if (typeof b.fotoPath === "string" && b.fotoPath.startsWith(`${companyId}/`)) {
      const { data: link } = supabase.storage.from("campo-rapportini").getPublicUrl(b.fotoPath);
      setFoto({ path: b.fotoPath, anteprima: link.publicUrl, lettura: b.lettura }); setFase(b.lettura ? "letto" : "non_letto");
    }
    bozzaAttivata.current = true; setRipresaDecisa(true);
  };

  // Il cantiere: quello in cui sei adesso, o l'unico che hai.
  const cantieri = useMemo(() => assegnazioni.data ?? [], [assegnazioni.data]);
  const predefinito = useMemo(() => {
    const attivo = dayTime.summary.activeOrderId;
    if (attivo && cantieri.some(c => c.order_id === attivo)) return attivo;
    return cantieri.length === 1 ? cantieri[0].order_id : "";
  }, [cantieri, dayTime.summary.activeOrderId]);
  const cantiereScelto = orderId ? (cantieri.some(c => c.order_id === orderId) ? orderId : "") : predefinito;

  // Una risposta arrivata dopo l'uscita dalla pagina non riapre il modulo.
  useEffect(() => {
    return () => { fotoTask.current += 1; liberaAnteprima(anteprima.current); };
  }, []);

  const elaboraFoto = async (file: File) => {
    if (!companyId || fotoInCorso.current || invioInCorso.current) return;
    fotoInCorso.current = true;
    // Il ritiro resta sul cantiere scelto anche se nel frattempo inizi il turno altrove.
    if (!orderId && cantiereScelto) setOrderId(cantiereScelto);
    const richiesta = ++fotoTask.current;
    const fasePrecedente = fase;
    setNuovaFoto(null);
    setFase("leggo");
    try {
      const f = await elaboraFotoDocumento(file, companyId, cantiereScelto || null);
      if (richiesta !== fotoTask.current) { liberaAnteprima(f.anteprima); return; }
      liberaAnteprima(anteprima.current);
      anteprima.current = f.anteprima;
      setFoto(f);
      setLettura(f.lettura);
      // Foto e campi appartengono sempre allo stesso documento, anche se il nuovo è illeggibile.
      setFornitore(f.lettura?.fornitore ?? "");
      setNumero(f.lettura?.numero ?? "");
      setData(f.lettura?.data ?? "");
      setTotale(f.lettura?.totale != null ? String(f.lettura.totale).replace(".", ",") : "");
      setRighe(f.lettura?.righe ?? []);
      setTipoDocumento("");
      setFase(f.lettura ? "letto" : "non_letto");
      if (!f.path) toast.warning("Non sono riuscito a salvare la foto: riprova, o inviala all’ufficio in un altro modo.");
    } catch (e) {
      if (richiesta !== fotoTask.current) return;
      // Una sostituzione fallita conserva il documento precedente, senza fingere di averlo cambiato.
      setFase(fasePrecedente);
      toast.error(messaggioErrore(e, "Non riesco a usare questa foto: riprova."));
    } finally {
      if (richiesta === fotoTask.current) fotoInCorso.current = false;
    }
  };

  const scegliFoto = (file: File | undefined) => {
    if (!file || fotoInCorso.current || invioInCorso.current) return;
    if (foto || fornitore || numero || data || totale || righe.length) setNuovaFoto(file);
    else void elaboraFoto(file);
  };

  const totaleNumero = numeroDocumento(totale);
  const totaleSuggerito = totaleNumero ?? totaleRighe(righe);

  const aggiornaRiga = (i: number, patch: Partial<RigaAcquisto>) => setRighe(r => r.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  const invia = async () => {
    if (!ripresaDecisa) { toast.error("Riprendi o scarta prima la bozza salvata."); return; }
    if (invioInCorso.current || fotoInCorso.current || nuovaFoto) return;
    if (!user?.id || !companyId) { toast.error("Sessione scaduta: accedi di nuovo."); return; }
    if (!modalita) { toast.error("Dici come hai preso la merce."); return; }
    if (assegnazioni.isError || assegnazioni.isLoading) { toast.error("Aspetta che siano caricati i tuoi cantieri, oppure riprova."); return; }
    if (!cantiereScelto) { toast.error("Scegli il cantiere a cui va la merce."); return; }
    if (totale.trim() && (totaleNumero == null || totaleNumero < 0 || totaleNumero > 1000000)) { toast.error("Controlla il totale: scrivi un importo valido, per esempio 1.234,56."); return; }
    if (righe.some(r => r.descrizione.trim() && (!Number.isFinite(r.quantita) || r.quantita <= 0 || r.quantita > 1000000))) { toast.error("Controlla le quantità dei prodotti: devono essere maggiori di zero."); return; }
    if (modalita === "pagato_da_me" && !foto?.path) { toast.error("Per il rimborso serve la foto dello scontrino."); return; }
    if (modalita === "pagato_da_me" && !(totaleSuggerito && totaleSuggerito > 0)) { toast.error("Indica quanto hai speso."); return; }
    if (totaleSuggerito == null && !righe.some(r => r.descrizione.trim())) { toast.error("Indica il totale o almeno un prodotto che hai preso."); return; }
    invioInCorso.current = true;
    setInvioAttivo(true);
    try {
      await registra.mutateAsync({
        orderId: cantiereScelto,
        modalita,
        tipoDocumento: tipoDocumento || tipoDocumentoDa(modalita),
        fornitore: fornitore.trim(),
        numero: numero.trim(),
        data: data || null,
        totale: totaleSuggerito,
        righe: righe.filter(r => r.descrizione.trim() !== "").map(({ quantitaTesto: _bozza, ...r }) => r),
        fotoPath: foto?.path ?? null,
        lettura: lettura ? { confidenza: lettura.confidenza, da_controllare: lettura.daControllare || righe.some(r => r.quantitaTesto !== undefined) } : null,
        note: note.trim(),
      });
      toast.success("Inviata all’ufficio");
      bozzaAttivata.current = false; bozza.clearDraft();
      liberaAnteprima(anteprima.current); anteprima.current = undefined;
      setFoto(null); setLettura(null); setFase("nessuna");
      setModalita(""); setTipoDocumento(""); setFornitore(""); setNumero(""); setData(""); setTotale(""); setRighe([]); setNote("");
    } catch (e) {
      toast.error(messaggioErrore(e, "Non sono riuscito a inviarla. Riprova."));
    } finally {
      invioInCorso.current = false;
      setInvioAttivo(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-3 py-3 md:px-4 md:py-5">
      <div>
        <h1 className="text-xl font-black">Merce presa</h1>
        <p className="text-sm text-muted-foreground">Hai ritirato o comprato della merce? Fotografa il documento: ci pensa l’ufficio a registrarlo.</p>
      </div>

      {!ripresaDecisa && <div role="status" className="space-y-2 rounded-xl border bg-muted/40 p-3 text-sm"><p>Hai un ritiro non ancora inviato salvato su questo telefono.</p><button type="button" className="min-h-11 text-primary underline" onClick={riprendiBozza}>Riprendi il ritiro</button>{" "}<button type="button" className="min-h-11 text-primary underline" onClick={() => { bozza.clearDraft(); setRipresaDecisa(true); }}>Scarta la bozza</button></div>}
      {bozza.saveError && <p role="alert" className="text-sm text-destructive">{bozza.saveError}</p>}
      {ripresaDecisa && bozza.lastSaved && <p role="status" className="text-xs text-muted-foreground">Bozza salvata sul telefono, non inviata. Le foto non caricate vanno scattate di nuovo.</p>}

      <fieldset disabled={!ripresaDecisa || fase === "leggo" || invioAttivo || registra.isPending} className="min-w-0 space-y-4">
      {/* 1. La foto */}
      <section className="space-y-3 rounded-2xl border bg-background p-4 shadow-sm" aria-label="Documento">
        <input
          ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden"
          aria-label="Scatta foto del documento"
          onChange={e => { scegliFoto(e.target.files?.[0]); e.target.value = ""; }}
        />
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label="Foto del documento"
          onChange={e => { scegliFoto(e.target.files?.[0]); e.target.value = ""; }}
        />
        {!foto ? (
          <button
            type="button"
            disabled={fase === "leggo"}
            onClick={() => cameraInput.current?.click()}
            className="flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed bg-muted/50 p-4 text-center active:border-primary disabled:opacity-60"
          >
            {fase === "leggo" ? <Loader2 className="h-7 w-7 animate-spin text-primary" aria-hidden="true" /> : <Camera className="h-7 w-7 text-muted-foreground" aria-hidden="true" />}
            <span className="text-base font-semibold">{fase === "leggo" ? "Leggo il documento…" : "Fotografa bolla, scontrino o fattura"}</span>
            {fase !== "leggo" && <span className="text-xs text-muted-foreground">Scatta ora con la fotocamera</span>}
          </button>
        ) : (
          <div className="flex items-start gap-3">
            {foto.anteprima.startsWith("blob:") ? <img src={foto.anteprima} alt="Documento fotografato" className="h-24 w-20 shrink-0 rounded-xl border object-cover" /> : <ImgRiservata src={foto.anteprima} alt="Documento fotografato" className="h-24 w-20 shrink-0 rounded-xl border object-cover" />}
            <div className="min-w-0 flex-1 space-y-1">
              {fase === "letto" && !lettura?.daControllare && <p role="status" className="flex items-center gap-1.5 text-sm font-semibold text-green-700"><Check className="h-4 w-4" aria-hidden="true" />Letto: controlla qui sotto</p>}
              {fase === "letto" && lettura?.daControllare && <p role="status" className="text-sm font-semibold text-amber-700">Letto in parte: controlla bene fornitore, prodotti e totale.</p>}
              {fase === "non_letto" && <p role="status" className="text-sm font-semibold text-amber-700">Non sono riuscito a leggerlo: scrivi tu fornitore e totale.</p>}
              {!foto.path && <p role="alert" className="text-xs text-destructive">La foto non è stata salvata.</p>}
              {fase === "leggo" && <p role="status" className="text-sm">Leggo il nuovo documento…</p>}
              <button type="button" className="min-h-11 text-sm text-primary underline" onClick={() => cameraInput.current?.click()}>Scatta di nuovo</button>
            </div>
          </div>
        )}
        <button type="button" className="min-h-11 text-sm text-primary underline" onClick={() => fileInput.current?.click()}>{foto ? "Cambia foto dalla galleria" : "Scegli dalla galleria"}</button>
        {nuovaFoto && <div role="alert" className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <p>La nuova foto sostituirà il documento e i dati compilati. Cantiere, pagamento e note restano invariati.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="min-h-11 rounded-xl border px-3 font-semibold" onClick={() => void elaboraFoto(nuovaFoto)}>Sostituisci documento</button>
            <button type="button" className="min-h-11 rounded-xl border px-3" onClick={() => setNuovaFoto(null)}>Mantieni documento</button>
          </div>
        </div>}
        {!foto && fase !== "leggo" && (
          <p className="text-xs text-muted-foreground">Senza foto puoi comunque segnare la merce a mano, ma per un rimborso la foto serve.</p>
        )}
      </section>

      {/* 2. Come l'hai presa */}
      <section className="space-y-2" aria-label="Come l’hai presa">
        <h2 className="text-sm font-bold">Come l’hai presa?</h2>
        <div className="grid gap-2">
          {MODALITA.map(m => (
            <button
              key={m.key}
              type="button"
              aria-pressed={modalita === m.key}
              onClick={() => { setModalita(m.key); if (!orderId && cantiereScelto) setOrderId(cantiereScelto); }}
              className={cn(
                "flex min-h-14 w-full flex-col items-start rounded-2xl border p-3 text-left transition-colors",
                modalita === m.key ? "border-primary bg-primary/10" : "bg-background",
              )}
            >
              <span className="text-base font-semibold">{m.titolo}</span>
              <span className="text-xs text-muted-foreground">{m.descrizione}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 3. Cantiere e dati */}
      <section className="space-y-3 rounded-2xl border bg-background p-4 shadow-sm" aria-label="Dati del documento">
        <div className="space-y-1.5">
          <label htmlFor="merce-cantiere" className="text-sm font-semibold">Per quale cantiere?</label>
          <select id="merce-cantiere" value={cantiereScelto} onChange={e => setOrderId(e.target.value)} className={campo}>
            {!cantiereScelto && <option value="" disabled>Scegli il cantiere</option>}
            {cantieri.map(c => <option key={c.order_id} value={c.order_id}>{c.order.order_code || "Cantiere"} · {c.order.description || c.order.indirizzo_lavori || "Lavoro assegnato"}</option>)}
          </select>
          {assegnazioni.isError && <p role="alert" className="text-xs text-destructive">Non riesco a leggere i tuoi cantieri. <button type="button" className="underline" onClick={() => assegnazioni.refetch()}>Riprova</button></p>}
        </div>
        <details className="rounded-xl border p-3">
        <summary className="min-h-11 cursor-pointer text-sm font-semibold">Dettagli del documento · facoltativi</summary>
        <div className="space-y-1.5">
          <label htmlFor="merce-tipo" className="text-sm font-semibold">Che documento è?</label>
          <select id="merce-tipo" className={campo} value={tipoDocumento || (modalita ? tipoDocumentoDa(modalita) : "bolla")} onChange={e => setTipoDocumento(e.target.value as TipoDocumento)}>
            <option value="bolla">Bolla / DDT</option><option value="scontrino">Scontrino / ricevuta</option><option value="fattura">Fattura</option><option value="altro">Altro documento</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="merce-numero" className="text-sm font-semibold">N° documento</label>
            <input id="merce-numero" className={campo} value={numero} onChange={e => setNumero(e.target.value)} placeholder="Facoltativo" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="merce-data" className="text-sm font-semibold">Data</label>
            <input id="merce-data" type="date" className={campo} value={data} onChange={e => setData(e.target.value)} />
          </div>
        </div>
        </details>
        <div className="space-y-1.5">
          <label htmlFor="merce-fornitore" className="text-sm font-semibold">Dove l’hai presa?</label>
          <input id="merce-fornitore" className={campo} value={fornitore} onChange={e => setFornitore(e.target.value)} placeholder="Es. Tecnomat, Leroy Merlin" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="merce-totale" className="text-sm font-semibold">Totale (€){modalita === "pagato_da_me" ? " — quanto hai speso" : ""}</label>
          <input
            id="merce-totale"
            inputMode="decimal"
            className={campo}
            value={totale}
            onChange={e => setTotale(e.target.value)}
            placeholder={totaleRighe(righe) != null ? euro(totaleRighe(righe)) : "Es. 45,50"}
          />
        </div>
      </section>

      {/* 4. I prodotti */}
      <section className="space-y-3 rounded-2xl border bg-background p-4 shadow-sm" aria-label="Prodotti">
        <h2 className="text-sm font-bold">Cosa hai preso</h2>
        {righe.length === 0 && <p className="text-xs text-muted-foreground">Nessun prodotto letto. Aggiungili a mano, oppure lascia solo il totale.</p>}
        {righe.map((r, i) => (
          <div key={i} className="space-y-2 rounded-xl border bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <input
                aria-label={`Prodotto ${i + 1}`}
                className={campo}
                value={r.descrizione}
                onChange={e => aggiornaRiga(i, { descrizione: e.target.value })}
                placeholder="Cosa è"
              />
              <button type="button" aria-label={`Togli ${r.descrizione || `prodotto ${i + 1}`}`} onClick={() => setRighe(x => x.filter((_, k) => k !== i))}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-500/10">
                <Trash2 className="h-4 w-4 text-red-500" aria-hidden="true" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                aria-label={`Quantità ${r.descrizione || `prodotto ${i + 1}`}`}
                inputMode="decimal"
                className="h-11 w-24 rounded-xl border bg-background px-3 text-center text-base"
                value={r.quantitaTesto ?? (r.quantita > 0 ? String(r.quantita).replace(".", ",") : "")}
                aria-invalid={r.quantita <= 0 || r.quantita > 1000000}
                placeholder="Quantità"
                onChange={e => {
                  const testo = e.target.value;
                  const n = numeroDocumento(testo) ?? 0;
                  setRighe(righe => righe.map((riga, k) => k === i ? { ...cambiaQuantita(riga, n), quantitaTesto: testo } : riga));
                }}
              />
              <input
                aria-label={`Unità ${r.descrizione || `prodotto ${i + 1}`}`}
                className="h-11 w-24 rounded-xl border bg-background px-3 text-base"
                value={r.unita ?? ""}
                onChange={e => aggiornaRiga(i, { unita: e.target.value })}
                placeholder="pz, m…"
              />
              {r.importo != null && <span className="ml-auto text-sm text-muted-foreground">{euro(r.importo)}</span>}
            </div>
            {(r.quantita <= 0 || r.quantita > 1000000) && <p className="text-xs text-amber-700">Indica la quantità: non è stata confermata.</p>}
            {r.quantitaTesto !== undefined && <p className="text-xs text-muted-foreground">Quantità modificata: controlla anche il totale del documento.</p>}
          </div>
        ))}
        <button type="button" onClick={() => setRighe(r => [...r, { descrizione: "", quantita: 1 }])}
          className="flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold">
          <Plus className="h-4 w-4" aria-hidden="true" />Aggiungi un prodotto
        </button>
      </section>

      <section className="space-y-1.5">
        <label htmlFor="merce-note" className="text-sm font-semibold">Note per l’ufficio (facoltativo)</label>
        <textarea id="merce-note" rows={2} className="w-full resize-none rounded-xl border bg-background px-3 py-2 text-base" value={note} onChange={e => setNote(e.target.value)} />
      </section>

      <button type="button" disabled={registra.isPending || invioAttivo || fase === "leggo" || !!nuovaFoto} onClick={() => void invia()}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-white disabled:opacity-60">
        {registra.isPending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
        Invia all’ufficio
      </button>
      </fieldset>

      {/* Le ultime inviate */}
      {(miei.data?.length ?? 0) > 0 && (
        <section className="space-y-2" aria-label="Le ultime che hai inviato">
          <h2 className="text-sm font-bold">Le ultime che hai inviato</h2>
          {miei.data!.map(a => {
            const s = descriviStato(a);
            return (
              <div key={a.id} className="space-y-1 rounded-xl border bg-background p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 font-semibold">{a.fornitore || "Negozio"}{a.order?.order_code ? ` · ${a.order.order_code}` : ""}</p>
                  <span className="shrink-0 font-semibold">{euro(a.totale)}</span>
                </div>
                <p className={cn("text-xs", s.tono === "no" ? "font-medium text-red-700" : s.tono === "ok" ? "text-green-700" : s.tono === "attesa" ? "text-amber-700" : "text-muted-foreground")}>{s.testo}</p>
                {a.stato === "da_verificare" && (
                  <button type="button" disabled={annulla.isPending} className="flex min-h-11 items-center gap-1 text-xs text-primary underline"
                    onClick={() => annulla.mutate(a.id, { onError: e => toast.error(messaggioErrore(e, "Non sono riuscito a ritirarla.")) })}>
                    <X className="h-3 w-3" aria-hidden="true" />Ritira, ho sbagliato
                  </button>
                )}
              </div>
            );
          })}
        </section>
      )}

    </div>
  );
}
