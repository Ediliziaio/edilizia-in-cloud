/**
 * SerramentiStimaPubblica — microsito pubblico per il cliente (NO LOGIN).
 *
 * URL: /stima/<public_token>
 *
 * Vista cliente del preventivo:
 *  - Vista del PDF in iframe
 *  - Box riepilogo (totale, risparmio, payback)
 *  - CTA "Contatta consulente" (telefono / email / WhatsApp)
 *  - CTA "Firma con il codice" se l'azienda ha mandato la richiesta di firma
 *    (flusso FEA /firma-fea/<token>, codice via email); niente più firma a disegno
 *  - Badge "Firmato il [data]" se firmato
 *
 * NB: il cliente NON modifica nulla (colori, materiali, ecc.). Solo visione + firma.
 */
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  FileText, Phone, Mail, MessageCircle, PenLine, CheckCircle, ExternalLink,
  Calendar, AlertCircle,
} from "lucide-react";
import { inchiostroSuBianco, testoSopra } from "@/lib/pdf/contrastoColori";

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

function formatEuroRangeOrSingle(min: number | null | undefined, max: number | null | undefined, decimals = 0): string {
  const minN = Number(min ?? 0);
  const maxN = Number(max ?? 0);
  if (!minN && !maxN) return "—";
  if (!minN) return formatEuro(maxN, decimals);
  if (!maxN) return formatEuro(minN, decimals);
  if (Math.abs(minN - maxN) < 0.01) return formatEuro(maxN, decimals);
  return `${formatEuro(minN, decimals)} – ${formatEuro(maxN, decimals)}`;
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
  const [firmaToken, setFirmaToken] = useState<string | null>(null);

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
      setFirmaToken(typeof r.firma_token === "string" ? r.firma_token : null);
    } catch (e) {
      console.error("[stima-pubblica] load", e);
      setError("Impossibile caricare la stima. Il link potrebbe essere scaduto.");
    } finally {
      setLoading(false);
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
  // Il colore dell'azienda com'è per sfondi e tinte; per testi, bordi e icone su
  // bianco la sua versione leggibile, e il testo dei bottoni in contrasto. Col
  // lime di Renova titolo e totale non si leggevano, né «Firma digitalmente».
  const inchiostro = inchiostroSuBianco(colore);
  const testoBottone = testoSopra(colore);
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
              <img loading="lazy" src={azienda.logo_url} alt={azienda.nome} className="h-10" />
            ) : (
              <div
                className="h-10 w-10 rounded border-2 flex items-center justify-center font-bold text-lg"
                style={{ borderColor: inchiostro, color: inchiostro }}
              >
                {azienda.nome.charAt(0)}
              </div>
            )}
            <div>
              <p className="font-bold text-sm">{azienda.nome}</p>
              <p className="text-[11px] text-muted-foreground">
                Stima n. <span className="font-mono font-semibold" style={{ color: inchiostro }}>{progetto.code}</span>
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
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: inchiostro }}>
              Proposta personalizzata
            </p>
            <h1 className="text-2xl md:text-3xl font-bold mt-1" style={{ color: inchiostro }}>
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

        {/* Big total box */}
        <Card style={{ background: `${colore}10`, borderColor: `${colore}40` }}>
          <CardContent className="p-6">
            <p className="text-[11px] uppercase tracking-wide font-semibold mb-1" style={{ color: inchiostro }}>
              Totale preventivo
            </p>
            <p className="text-3xl md:text-4xl font-bold tabular-nums" style={{ color: inchiostro }}>
              {formatEuroRangeOrSingle(progetto.totale_min, progetto.totale_max)}
            </p>
            <p className="text-xs mt-1" style={{ color: inchiostro }}>
              {progetto.iva_inclusa ? "IVA inclusa" : "IVA esclusa"} · Importo della revisione corrente
            </p>
          </CardContent>
        </Card>

        {/* KPI ROI */}
        {(progetto.risparmio_eur_anno || progetto.detrazione_eur_totale || progetto.payback_anni) && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {progetto.risparmio_eur_anno && (
              <Card><CardContent className="p-4">
                <p className="text-[10px] uppercase font-semibold text-muted-foreground">Risparmio bolletta</p>
                <p className="text-xl font-bold" style={{ color: inchiostro }}>
                  {formatEuro(progetto.risparmio_eur_anno)}<span className="text-xs font-normal ml-1">/anno</span>
                </p>
              </CardContent></Card>
            )}
            {progetto.detrazione_eur_totale && (
              <Card><CardContent className="p-4">
                <p className="text-[10px] uppercase font-semibold text-muted-foreground">Detrazione fiscale</p>
                <p className="text-xl font-bold" style={{ color: inchiostro }}>
                  {formatEuro(progetto.detrazione_eur_totale)}
                </p>
                <p className="text-[10px] text-muted-foreground">recuperabile in 10 anni</p>
              </CardContent></Card>
            )}
            {progetto.payback_anni && (
              <Card><CardContent className="p-4">
                <p className="text-[10px] uppercase font-semibold text-muted-foreground">Payback</p>
                <p className="text-xl font-bold" style={{ color: inchiostro }}>
                  {formatNum(progetto.payback_anni, 1)}<span className="text-xs font-normal ml-1">anni</span>
                </p>
              </CardContent></Card>
            )}
            {progetto.co2_risparmiata_t_anno && (
              <Card><CardContent className="p-4">
                <p className="text-[10px] uppercase font-semibold text-muted-foreground">CO₂ risparmiata</p>
                <p className="text-xl font-bold" style={{ color: inchiostro }}>
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
                <FileText className="h-4 w-4" style={{ color: inchiostro }} />
                Documento completo
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
              <Calendar className="h-5 w-5" style={{ color: inchiostro }} />
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
              <p className="text-[11px] uppercase tracking-wide font-semibold mb-2" style={{ color: inchiostro }}>
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
        {!progetto.firmato_il && (
          <Card className="border-2" style={{ borderColor: inchiostro }}>
            <CardContent className="p-6 text-center">
              <PenLine className="h-10 w-10 mx-auto mb-3" style={{ color: inchiostro }} />
              <h3 className="text-lg font-bold mb-1" style={{ color: inchiostro }}>
                Sei pronto a procedere?
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {firmaToken
                  ? "Hai letto la stima? Per firmarla ti mandiamo un codice di verifica via email: bastano due passaggi."
                  : "Per firmare ti serve il link di firma che ti manda l'azienda via email, con il codice di verifica. Se non l'hai ricevuto, contatta il tuo consulente."}
              </p>
              {firmaToken && (
                <Button
                  size="lg"
                  asChild
                  style={{ backgroundColor: colore, color: testoBottone }}
                  className="gap-2 hover:opacity-90"
                >
                  <a href={`/firma-fea/${firmaToken}?avvia=1`}>
                    <PenLine className="h-4 w-4" />
                    Firma con il codice
                  </a>
                </Button>
              )}
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

    </div>
  );
}
