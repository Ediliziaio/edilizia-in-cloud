/**
 * SerramentiStimaPubblica — microsito pubblico per il cliente (NO LOGIN).
 *
 * URL: /stima/<public_token>
 *
 * Vista cliente del preventivo:
 *  - Vista del PDF in iframe
 *  - Box riepilogo (forbice, risparmio, payback)
 *  - CTA "Contatta consulente" (telefono / email / WhatsApp)
 *  - CTA "Firma digitalmente" se allow_self_signing e non già firmato
 *  - Badge "Firmato il [data]" se firmato
 *
 * NB: il cliente NON modifica nulla (colori, materiali, ecc.). Solo visione + firma.
 */
import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  FileText, Phone, Mail, MessageCircle, PenLine, CheckCircle, ExternalLink,
  Calendar, Loader2, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PublicStima {
  progetto: {
    code: string;
    stato: string;
    cliente_nome: string | null;
    cliente_cognome: string | null;
    cliente_citta: string | null;
    cantiere_citta: string | null;
    tipo_intervento: string;
    intervento_titolo: string | null;
    intervento_sintesi: string | null;
    totale_serramenti: number;
    totale_min: number;
    totale_max: number;
    iva_inclusa: boolean;
    risparmio_eur_anno: number | null;
    detrazione_eur_totale: number | null;
    payback_anni: number | null;
    co2_risparmiata_t_anno: number | null;
    consulenza_at: string | null;
    consulenza_luogo: string | null;
    valido_fino_data: string | null;
    allow_self_signing: boolean;
    firmato_il: string | null;
  };
  pdf_url: string | null;
  azienda: {
    nome: string;
    indirizzo: string | null;
    telefono: string | null;
    email: string | null;
    partita_iva: string | null;
    logo_url: string | null;
    colore_primario: string;
  };
  consulente: {
    nome: string;
    email: string | null;
    telefono: string | null;
  } | null;
}

function formatEuro(n: number | null | undefined, decimals = 0): string {
  if (n == null || isNaN(Number(n))) return "—";
  return "€ " + Number(n).toLocaleString("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatNum(n: number | null | undefined, decimals = 0): string {
  if (n == null || isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default function SerramentiStimaPubblica() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const debugMode = searchParams.get("debug") === "1";

  const [data, setData] = useState<PublicStima | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSignDialog, setShowSignDialog] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [signing, setSigning] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Token mancante");
      setLoading(false);
      return;
    }
    void load();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const { data: result, error: invErr } = await supabase.functions.invoke("sr-public-progetto", {
        body: { token },
      });
      if (invErr) throw invErr;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = result as any;
      if (!r?.ok) {
        setError(r?.error ?? "Stima non disponibile");
        return;
      }
      setData(r as PublicStima);
    } catch (e) {
      console.error("[stima-pubblica] load", e);
      setError("Impossibile caricare la stima. Il link potrebbe essere scaduto.");
    } finally {
      setLoading(false);
    }
  };

  // ─── Signature pad ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!showSignDialog) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    setHasInk(false);

    const getPos = (e: MouseEvent | TouchEvent): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      if ("touches" in e && e.touches.length > 0) {
        return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
      }
      const me = e as MouseEvent;
      return { x: (me.clientX - rect.left) * scaleX, y: (me.clientY - rect.top) * scaleY };
    };

    const start = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      drawingRef.current = true;
      const pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      setHasInk(true);
    };
    const move = (e: MouseEvent | TouchEvent) => {
      if (!drawingRef.current) return;
      e.preventDefault();
      const pos = getPos(e);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    };
    const stop = () => { drawingRef.current = false; };

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mouseup", stop);
    canvas.addEventListener("mouseleave", stop);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", stop);

    return () => {
      canvas.removeEventListener("mousedown", start);
      canvas.removeEventListener("mousemove", move);
      canvas.removeEventListener("mouseup", stop);
      canvas.removeEventListener("mouseleave", stop);
      canvas.removeEventListener("touchstart", start);
      canvas.removeEventListener("touchmove", move);
      canvas.removeEventListener("touchend", stop);
    };
  }, [showSignDialog]);

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  };

  const submitSignature = async () => {
    if (!canvasRef.current || !token) return;
    if (!hasInk) {
      toast.error("Per favore firma nello spazio dedicato");
      return;
    }
    if (!signerName.trim()) {
      toast.error("Per favore inserisci il tuo nome");
      return;
    }
    setSigning(true);
    try {
      const dataUrl = canvasRef.current.toDataURL("image/png");
      const { data: result, error: invErr } = await supabase.functions.invoke("sr-firma-cliente", {
        body: { token, signature_data_url: dataUrl, signer_name: signerName.trim() },
      });
      if (invErr) throw invErr;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = result as any;
      if (!r?.ok) throw new Error(r?.error ?? "Firma fallita");
      toast.success("Firma registrata. Ti contatteremo a breve!");
      setShowSignDialog(false);
      await load(); // refresh con firmato_il
    } catch (e) {
      console.error("[stima-pubblica] sign", e);
      toast.error("Errore durante la firma", { description: String(e) });
    } finally {
      setSigning(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="container mx-auto p-4 max-w-4xl space-y-4 pt-16">
          <Skeleton className="h-16" />
          <Skeleton className="h-64" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-12 w-12 text-rose-400 mx-auto mb-3" />
            <h1 className="text-lg font-bold mb-2">Stima non disponibile</h1>
            <p className="text-sm text-muted-foreground">
              {error ?? "Il link potrebbe essere scaduto o non più valido."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { progetto, azienda, consulente, pdf_url } = data;
  const cliente = [progetto.cliente_nome, progetto.cliente_cognome].filter(Boolean).join(" ");
  const colore = azienda.colore_primario || "#2D7D5C";
  const whatsappLink = consulente?.telefono
    ? `https://wa.me/${consulente.telefono.replace(/\D/g, "")}?text=${encodeURIComponent(`Ciao, ho ricevuto la stima ${progetto.code}`)}`
    : null;

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto p-4 max-w-5xl flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            {azienda.logo_url ? (
              <img src={azienda.logo_url} alt={azienda.nome} className="h-10" />
            ) : (
              <div
                className="h-10 w-10 rounded border-2 flex items-center justify-center font-bold text-lg"
                style={{ borderColor: colore, color: colore }}
              >
                {azienda.nome.charAt(0)}
              </div>
            )}
            <div>
              <p className="font-bold text-sm">{azienda.nome}</p>
              <p className="text-[11px] text-muted-foreground">
                Stima n. <span className="font-mono font-semibold" style={{ color: colore }}>{progetto.code}</span>
              </p>
            </div>
          </div>
          {progetto.firmato_il ? (
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1">
              <CheckCircle className="h-3 w-3" /> Firmata il {new Date(progetto.firmato_il).toLocaleDateString("it-IT")}
            </Badge>
          ) : (
            <Badge className="bg-amber-100 text-amber-700 border-amber-200">
              In attesa di firma
            </Badge>
          )}
        </div>
      </header>

      <main className="container mx-auto p-4 max-w-5xl space-y-4 pt-6">
        {/* Hero */}
        <Card>
          <CardContent className="p-6">
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: colore }}>
              Proposta personalizzata
            </p>
            <h1 className="text-2xl md:text-3xl font-bold mt-1" style={{ color: colore }}>
              {progetto.intervento_titolo ?? `Per ${cliente}`}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {[progetto.cantiere_citta ?? progetto.cliente_citta, `${progetto.totale_serramenti} serramenti`, progetto.tipo_intervento].filter(Boolean).join(" · ")}
            </p>
            {progetto.intervento_sintesi && (
              <p className="text-sm mt-3 leading-relaxed">{progetto.intervento_sintesi}</p>
            )}
          </CardContent>
        </Card>

        {/* Big investment box */}
        <Card style={{ background: `${colore}10`, borderColor: `${colore}40` }}>
          <CardContent className="p-6">
            <p className="text-[11px] uppercase tracking-wide font-semibold mb-1" style={{ color: colore }}>
              Il tuo investimento stimato
            </p>
            <p className="text-3xl md:text-4xl font-bold tabular-nums" style={{ color: colore }}>
              {formatEuro(progetto.totale_min)} <span className="opacity-50 text-2xl">—</span> {formatEuro(progetto.totale_max)}
            </p>
            <p className="text-xs mt-1" style={{ color: colore }}>
              {progetto.iva_inclusa ? "IVA inclusa" : "IVA esclusa"} · Forbice indicativa, fissata in consulenza
            </p>
          </CardContent>
        </Card>

        {/* KPI ROI */}
        {(progetto.risparmio_eur_anno || progetto.detrazione_eur_totale || progetto.payback_anni) && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {progetto.risparmio_eur_anno && (
              <Card><CardContent className="p-4">
                <p className="text-[10px] uppercase font-semibold text-muted-foreground">Risparmio bolletta</p>
                <p className="text-xl font-bold" style={{ color: colore }}>
                  {formatEuro(progetto.risparmio_eur_anno)}<span className="text-xs font-normal ml-1">/anno</span>
                </p>
              </CardContent></Card>
            )}
            {progetto.detrazione_eur_totale && (
              <Card><CardContent className="p-4">
                <p className="text-[10px] uppercase font-semibold text-muted-foreground">Detrazione fiscale</p>
                <p className="text-xl font-bold" style={{ color: colore }}>
                  {formatEuro(progetto.detrazione_eur_totale)}
                </p>
                <p className="text-[10px] text-muted-foreground">recuperabile in 10 anni</p>
              </CardContent></Card>
            )}
            {progetto.payback_anni && (
              <Card><CardContent className="p-4">
                <p className="text-[10px] uppercase font-semibold text-muted-foreground">Payback</p>
                <p className="text-xl font-bold" style={{ color: colore }}>
                  {formatNum(progetto.payback_anni, 1)}<span className="text-xs font-normal ml-1">anni</span>
                </p>
              </CardContent></Card>
            )}
            {progetto.co2_risparmiata_t_anno && (
              <Card><CardContent className="p-4">
                <p className="text-[10px] uppercase font-semibold text-muted-foreground">CO₂ risparmiata</p>
                <p className="text-xl font-bold" style={{ color: colore }}>
                  {formatNum(progetto.co2_risparmiata_t_anno, 2)}<span className="text-xs font-normal ml-1">t/anno</span>
                </p>
              </CardContent></Card>
            )}
          </div>
        )}

        {/* PDF preview */}
        {pdf_url && (
          <Card>
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" style={{ color: colore }} />
                Documento completo (3 pagine)
              </CardTitle>
              <Button asChild variant="outline" size="sm">
                <a href={pdf_url} target="_blank" rel="noopener noreferrer" className="gap-1">
                  <ExternalLink className="h-3.5 w-3.5" /> Apri in nuova scheda
                </a>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <iframe
                src={pdf_url}
                title="Preventivo"
                className="w-full border-0"
                style={{ height: "75vh", minHeight: 600 }}
              />
            </CardContent>
          </Card>
        )}

        {/* Consulenza appuntamento */}
        {progetto.consulenza_at && (
          <Card>
            <CardContent className="p-4 flex items-center gap-3 flex-wrap">
              <Calendar className="h-5 w-5" style={{ color: colore }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">
                  Appuntamento di consulenza
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(progetto.consulenza_at).toLocaleString("it-IT", {
                    weekday: "long", day: "numeric", month: "long", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                  {progetto.consulenza_luogo ? ` · ${progetto.consulenza_luogo}` : ""}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Consulente contact card */}
        {consulente && (consulente.telefono || consulente.email) && (
          <Card style={{ background: `${colore}08`, borderColor: `${colore}30` }}>
            <CardContent className="p-4">
              <p className="text-[11px] uppercase tracking-wide font-semibold mb-2" style={{ color: colore }}>
                La tua consulenza
              </p>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-bold">{consulente.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {[consulente.telefono, consulente.email].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {consulente.telefono && (
                    <Button asChild variant="outline" size="sm">
                      <a href={`tel:${consulente.telefono}`} className="gap-1.5">
                        <Phone className="h-3.5 w-3.5" /> Chiama
                      </a>
                    </Button>
                  )}
                  {whatsappLink && (
                    <Button asChild variant="outline" size="sm" className="border-emerald-300 text-emerald-700">
                      <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="gap-1.5">
                        <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                      </a>
                    </Button>
                  )}
                  {consulente.email && (
                    <Button asChild variant="outline" size="sm">
                      <a href={`mailto:${consulente.email}?subject=${encodeURIComponent(`Stima ${progetto.code}`)}`} className="gap-1.5">
                        <Mail className="h-3.5 w-3.5" /> Email
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Firma CTA */}
        {progetto.allow_self_signing && !progetto.firmato_il && (
          <Card className="border-2" style={{ borderColor: colore }}>
            <CardContent className="p-6 text-center">
              <PenLine className="h-10 w-10 mx-auto mb-3" style={{ color: colore }} />
              <h3 className="text-lg font-bold mb-1" style={{ color: colore }}>
                Sei pronto a procedere?
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Firma digitalmente la stima per confermare il tuo interesse. Ti contatteremo per definire i dettagli.
              </p>
              <Button
                size="lg"
                onClick={() => setShowSignDialog(true)}
                style={{ backgroundColor: colore }}
                className="gap-2 hover:opacity-90"
              >
                <PenLine className="h-4 w-4" />
                Firma digitalmente
              </Button>
            </CardContent>
          </Card>
        )}

        {progetto.firmato_il && (
          <Card className="border-2 border-emerald-300 bg-emerald-50">
            <CardContent className="p-6 text-center">
              <CheckCircle className="h-10 w-10 mx-auto mb-2 text-emerald-600" />
              <h3 className="text-lg font-bold text-emerald-900 mb-1">
                Grazie {progetto.cliente_nome ? `${progetto.cliente_nome}!` : "!"}
              </h3>
              <p className="text-sm text-emerald-800">
                Abbiamo ricevuto la tua firma. Ti contatteremo a breve per definire i prossimi passi.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Footer azienda */}
        <Card>
          <CardContent className="p-4 text-center text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">{azienda.nome}</p>
            {azienda.indirizzo && <p>{azienda.indirizzo}</p>}
            <p>
              {[azienda.telefono, azienda.email, azienda.partita_iva ? `P.IVA ${azienda.partita_iva}` : null].filter(Boolean).join(" · ")}
            </p>
            {progetto.valido_fino_data && (
              <p className="mt-2 text-amber-700">
                Validità preventivo fino al {new Date(progetto.valido_fino_data).toLocaleDateString("it-IT")}
              </p>
            )}
            {debugMode && (
              <pre className="mt-3 text-[9px] bg-slate-100 p-2 text-left overflow-auto">
                {JSON.stringify({ progetto, azienda, consulente }, null, 2)}
              </pre>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Signature dialog */}
      <Dialog open={showSignDialog} onOpenChange={setShowSignDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Firma digitale</DialogTitle>
            <DialogDescription>
              Firma con il mouse o il dito nello spazio sotto. La firma sarà allegata al preventivo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Il tuo nome completo</Label>
              <Input
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder={cliente || "Mario Rossi"}
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-xs mb-1 block">La tua firma</Label>
              <div
                className="border-2 border-dashed rounded-md bg-white"
                style={{ borderColor: hasInk ? colore : "#cbd5e1" }}
              >
                <canvas
                  ref={canvasRef}
                  width={500}
                  height={180}
                  className="w-full touch-none cursor-crosshair"
                  style={{ height: 180 }}
                />
              </div>
              <Button
                size="sm" variant="ghost" onClick={clearSignature}
                disabled={!hasInk}
                className="mt-1 text-xs h-7"
              >
                Cancella
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSignDialog(false)} disabled={signing}>
              Annulla
            </Button>
            <Button
              onClick={submitSignature}
              disabled={signing || !hasInk || !signerName.trim()}
              style={{ backgroundColor: colore }}
              className="hover:opacity-90"
            >
              {signing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <PenLine className="h-4 w-4 mr-1" />}
              Conferma firma
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
