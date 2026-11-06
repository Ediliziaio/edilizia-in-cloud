import { useState, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Eraser,
  PenTool,
  Calendar,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";

type PageStatus = "loading" | "ready" | "submitting" | "approved" | "rejected" | "already_done" | "error";

interface OdVData {
  id: string;
  numero_odv: number;
  titolo: string;
  descrizione: string;
  motivazione: string | null;
  impatto_economico: number;
  impatto_giorni: number;
  richiesto_da: string | null;
  richiesto_il: string | null;
  status: string;
  document_hash: string;
  has_document?: boolean;
  attachments?: {id:string;name:string}[];
  /** Dalla 20281216170000: finché non c'è, la pagina funziona lo stesso senza questi. */
  impresa?: string | null;
  iva_percentuale?: number | null;
  cantiere?: string | null;
}

export default function FirmaOdV() {
  const { token } = useParams<{ token: string }>();
  const [pageStatus, setPageStatus] = useState<PageStatus>("loading");
  const [odv, setOdv] = useState<OdVData | null>(null);
  const [firmatoDa, setFirmatoDa] = useState("");
  const [hasDrawn, setHasDrawn] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [documentBusy,setDocumentBusy] = useState(false);
  const loadEpoch = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);

  useEffect(() => {
    if (!token) { setPageStatus("error"); return; }
    setOdv(null);setAccepted(false);setHasDrawn(false);setFirmatoDa("");setPageStatus("loading");
    void loadOdv();
    return () => {loadEpoch.current++;};
  }, [token]);

  // Si passa dalla RPC e non dalla tabella: la policy anon che permetteva la
  // lettura diretta ("firma_token IS NOT NULL") esponeva TUTTE le varianti in
  // attesa, non solo la propria — la RLS non vede il .eq() del client. Stesso
  // schema dei SAL (sal_view_by_token).
  const loadOdv = async () => {
    const epoch = ++loadEpoch.current;
    const { data, error } = await supabase.rpc("odv_view_by_token" as never, {
      p_token: token!,
    } as never);

    const res = data as { valid?: boolean; gia_firmato?: boolean } | null;
    if(epoch!==loadEpoch.current)return;
    if (error || !res?.valid) { setPageStatus("error"); return; }
    if (res.gia_firmato) { setPageStatus("already_done"); return; }
    setOdv(res as unknown as OdVData);
    setPageStatus("ready");
  };
  const openPublicDocument = async (fileId = "proposal") => {
    if(documentBusy || !token)return;
    setDocumentBusy(true);
    try {const {data,error}=await supabase.functions.invoke("variante-commessa",{body:{action:"public_open",token,file_id:fileId}});
      if(error || data?.success!==true || typeof data.url!=="string" || new URL(data.url).origin!==new URL(import.meta.env.VITE_SUPABASE_URL).origin)throw new Error("Documento non disponibile o link scaduto.");
      const link=document.createElement("a");link.href=data.url;link.target="_blank";link.rel="noopener";link.textContent=data.name;document.body.appendChild(link);link.click();link.remove();
    }catch(e){toast.error(e instanceof Error?e.message:"Documento non disponibile");}finally{setDocumentBusy(false);}
  };

  // ── Canvas drawing ────────────────────────────────────────────
  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isDrawingRef.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const endDraw = () => { isDrawingRef.current = false; };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  // ── Submit approve ───────────────────────────────────────────
  const handleApprove = async () => {
    if (!hasDrawn || !token || !odv || !accepted || firmatoDa.trim().length < 2 || pageStatus === "submitting") return;

    // Guard: canvas must be serializable
    const firmaData = canvasRef.current?.toDataURL("image/png");
    if (!firmaData) {
      toast.error("Impossibile acquisire la firma. Riprova.");
      return;
    }

    setPageStatus("submitting");

    // Una sola transizione: non alterare il contratto base né ripetere alla cieca.
    const { data, error } = await supabase.functions.invoke("firma-odv-webhook", {
      body: {
        token,
        firma_data_base64: firmaData,
        firmato_da: firmatoDa.trim() || null,
        accepted: true,
        document_hash: odv.document_hash,
      },
    });

    if (error || !data?.success) {
      toast.error("Esito della firma non confermato. Verifico lo stato della variante.");
      await loadOdv();
      return;
    }

    setPageStatus("approved");
  };

  // ── Submit reject ────────────────────────────────────────────
  const handleReject = async () => {
    if (!token || !odv) return;
    setPageStatus("submitting");
    const { data, error } = await supabase.rpc("odv_reject_with_token" as never, {
      p_token: token,
      p_firmato_da: firmatoDa.trim() || null,
    } as never);

    if (error || !(data as { success?: boolean } | null)?.success) {
      toast.error("Errore durante il rifiuto. Riprova.");
      setPageStatus("ready");
      return;
    }
    setPageStatus("rejected");
  };

  // ── States ───────────────────────────────────────────────────
  if (pageStatus === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (pageStatus === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <AlertTriangle className="h-12 w-12 text-destructive" />
            <h2 className="text-lg font-semibold">Link non valido</h2>
            <p className="text-sm text-muted-foreground text-center">
              Il link non è valido o è stato rimosso. Contatta l'azienda per assistenza.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // useGrouping esplicito: senza, su alcuni dispositivi esce «1848,00 €» invece di «1.848,00 €».
  const euro = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: true }).format(n);
  const esito = (icona: React.ReactNode, titolo: string, testo: string, tono: string) => (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl border bg-white p-8 text-center shadow-sm">
        <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${tono}`}>{icona}</div>
        <h2 className="text-xl font-semibold">{titolo}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{testo}</p>
        {odv?.impresa && <p className="mt-4 text-xs text-muted-foreground">{odv.impresa}</p>}
      </div>
    </div>
  );

  if (pageStatus === "already_done") {
    return esito(<CheckCircle2 className="h-8 w-8 text-slate-600" />, "Già firmato",
      "Questi lavori extra sono già stati firmati o annullati. Puoi chiudere la pagina.", "bg-slate-100");
  }
  if (pageStatus === "approved") {
    return esito(<CheckCircle2 className="h-8 w-8 text-emerald-600" />, "Grazie, è approvato",
      "L'impresa ha ricevuto la tua firma e può partire con i lavori. Riceverai l'aggiornamento del contratto.", "bg-emerald-100");
  }
  if (pageStatus === "rejected") {
    return esito(<XCircle className="h-8 w-8 text-rose-600" />, "Non approvato",
      "L'impresa è stata avvisata. Questi lavori non si fanno e il contratto non cambia.", "bg-rose-100");
  }

  // ── La pagina del cliente: chi chiede, cosa fa, quanto costa, la firma ──
  const iva = typeof odv?.iva_percentuale === "number" && odv.iva_percentuale > 0 ? odv.iva_percentuale : null;
  const conIva = odv && iva ? Math.round(odv.impatto_economico * (1 + iva / 100) * 100) / 100 : null;
  const inCorso = pageStatus === "submitting";
  const puoFirmare = !!hasDrawn && accepted && firmatoDa.trim().length >= 2 && !inCorso;
  const riduzione = (odv?.impatto_economico ?? 0) < 0;

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-xl flex-col gap-1 px-4 py-5">
          {odv?.impresa && <p className="text-sm font-semibold text-slate-900">{odv.impresa}</p>}
          <h1 className="text-lg font-bold text-slate-900 sm:text-xl">{riduzione ? "Riduzione dei lavori da approvare" : "Lavori extra da approvare"}</h1>
          <p className="text-sm text-muted-foreground">
            {odv?.cantiere ? <>Cantiere di {odv.cantiere}. </> : null}Leggi cosa cambia, poi firma qui sotto.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-4 px-4 py-5">
        {odv && (
          <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="border-b bg-slate-50/80 px-5 py-4">
              <p className="text-xs text-muted-foreground">Proposta n. {odv.numero_odv}{odv.richiesto_il ? ` del ${format(new Date(odv.richiesto_il), "d MMMM yyyy", { locale: it })}` : ""}</p>
              <h2 className="mt-0.5 text-lg font-semibold leading-snug text-slate-900">{odv.titolo}</h2>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div>
                <p className="text-3xl font-bold tabular-nums text-slate-900">{euro(odv.impatto_economico)}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {conIva !== null
                    ? <>IVA {iva}% esclusa · <span className="font-medium text-slate-700">{euro(conIva)}</span> in tutto</>
                    : <>IVA esclusa</>}
                </p>
                {odv.impatto_giorni > 0 && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900">
                    <Calendar className="h-3.5 w-3.5" aria-hidden />+{odv.impatto_giorni} giorni sulla consegna
                  </p>
                )}
              </div>

              <div className="border-t pt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cosa comprende</p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{odv.descrizione}</p>
              </div>

              {odv.motivazione && (
                <div className="border-t pt-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Perché serve</p>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{odv.motivazione}</p>
                </div>
              )}

              {odv.has_document && (
                <div className="flex flex-wrap gap-2 border-t pt-4">
                  <Button variant="outline" className="min-h-11" disabled={documentBusy} onClick={() => void openPublicDocument()}>
                    {documentBusy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}Leggi il documento completo
                  </Button>
                  {odv.attachments?.map(file => (
                    <Button key={file.id} variant="ghost" className="min-h-11" disabled={documentBusy} onClick={() => void openPublicDocument(file.id)}>{file.name}</Button>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          {riduzione
            ? <>Se approvi, l'importo si toglie dal contratto. Se non approvi, resta tutto com'è.</>
            : <>Se approvi, l'impresa fa questi lavori e l'importo si aggiunge al contratto. Se non approvi, non si fa niente e il contratto resta uguale.</>}
        </p>

        <section className="space-y-4 rounded-2xl border bg-white px-5 py-5 shadow-sm">
          <div className="flex items-center gap-2">
            <PenTool className="h-4 w-4 text-primary" aria-hidden />
            <h2 className="text-base font-semibold">La tua firma</h2>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="odv-signer">Nome e cognome</Label>
            <Input id="odv-signer" className="min-h-11" maxLength={200} autoComplete="name" placeholder="Es. Mario Rossi"
              value={firmatoDa} onChange={(e) => setFirmatoDa(e.target.value)} disabled={inCorso} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="odv-firma-area">Firma col dito o col mouse</Label>
            <div id="odv-firma-area" className="relative overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-white">
              {!hasDrawn && <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">Firma qui</p>}
              <canvas
                ref={canvasRef}
                width={460}
                height={180}
                aria-label="Riquadro della firma"
                className="block w-full cursor-crosshair touch-none"
                style={{ touchAction: "none" }}
                onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
                onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
              />
            </div>
            {hasDrawn && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearCanvas} disabled={inCorso}>
                <Eraser className="mr-1 h-3 w-3" />Rifai la firma
              </Button>
            )}
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-800">
            <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-600" checked={accepted} onChange={e => setAccepted(e.target.checked)} disabled={inCorso} />
            Ho letto i lavori e l'importo, e li approvo.
          </label>

          <Button onClick={handleApprove} disabled={!puoFirmare}
            className="min-h-12 w-full bg-emerald-600 text-base font-semibold hover:bg-emerald-700">
            {inCorso ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Registro la firma…</> : <><CheckCircle2 className="mr-2 h-5 w-5" />Approvo e firmo</>}
          </Button>
          {!puoFirmare && !inCorso && (
            <p className="text-center text-xs text-muted-foreground">
              {firmatoDa.trim().length < 2 ? "Scrivi il tuo nome" : !hasDrawn ? "Firma nel riquadro" : "Spunta la casella per approvare"}
            </p>
          )}
        </section>

        <div className="text-center">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" className="min-h-11 text-sm text-muted-foreground hover:text-rose-700" disabled={inCorso}>
                Non approvo questi lavori
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Non approvi «{odv?.titolo}»?</AlertDialogTitle>
                <AlertDialogDescription>
                  L'impresa viene avvisata, i lavori non si fanno e il contratto non cambia. Se ti serve solo una modifica, chiama l'impresa prima di rifiutare.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Torna indietro</AlertDialogCancel>
                <AlertDialogAction onClick={handleReject} className="bg-rose-600 text-white hover:bg-rose-700">Sì, non approvo</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <p className="px-2 text-center text-xs leading-relaxed text-muted-foreground">
          Firmando autorizzi questi lavori e accetti l'importo. La firma resta registrata con la data.
        </p>
      </main>
    </div>
  );
}
