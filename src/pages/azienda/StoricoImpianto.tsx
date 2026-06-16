import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  AlertCircle,
  Plus,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  PenTool,
  Flame,
  Snowflake,
  Droplets,
  Zap,
  Sun,
  Wrench,
  Calendar,
  User,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────

interface ImpiantoCliente {
  id: string;
  tipo_impianto: string | null;
  marca: string | null;
  modello: string | null;
  matricola: string | null;
  customer_id: string | null;
  customer?: { first_name: string | null; last_name: string | null } | null;
}

interface RapportinoStorico {
  id: string;
  ticket_id: string | null;
  created_at: string;
  stato: string | null;
  stato_chiusura: string | null;
  note_chiusura: string | null;
  ore_lavoro: number | null;
  ore_lavoro_effettive: number | null;
  firma_tecnico_url: string | null;
  foto_chiusura: string[] | null;
  foto_urls: string[] | null;
  ticket?: { subject: string; id: string } | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const TIPO_IMPIANTO_ICONS: Record<string, React.ReactNode> = {
  termico: <Flame className="h-5 w-5 text-orange-500" />,
  riscaldamento: <Flame className="h-5 w-5 text-orange-500" />,
  caldaia: <Flame className="h-5 w-5 text-orange-500" />,
  raffrescamento: <Snowflake className="h-5 w-5 text-blue-500" />,
  climatizzazione: <Snowflake className="h-5 w-5 text-blue-500" />,
  aria_condizionata: <Snowflake className="h-5 w-5 text-blue-500" />,
  idrico: <Droplets className="h-5 w-5 text-cyan-500" />,
  idraulico: <Droplets className="h-5 w-5 text-cyan-500" />,
  elettrico: <Zap className="h-5 w-5 text-yellow-500" />,
  fotovoltaico: <Sun className="h-5 w-5 text-yellow-400" />,
  solare: <Sun className="h-5 w-5 text-yellow-400" />,
};

function getTipoIcon(tipo: string | null): React.ReactNode {
  if (!tipo) return <Wrench className="h-5 w-5 text-gray-400" />;
  const lower = tipo.toLowerCase();
  for (const [key, icon] of Object.entries(TIPO_IMPIANTO_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return <Wrench className="h-5 w-5 text-gray-400" />;
}

const STATO_CHIUSURA_CONFIG: Record<string, { label: string; className: string }> = {
  aperto: { label: "Aperto", className: "bg-blue-100 text-blue-700" },
  in_lavorazione: { label: "In lavorazione", className: "bg-yellow-100 text-yellow-700" },
  completato: { label: "Completato", className: "bg-orange-100 text-orange-700" },
  firmato: { label: "Firmato", className: "bg-green-100 text-green-700" },
};

function getStatoBadge(stato: string | null) {
  const key = stato ?? "aperto";
  const cfg = STATO_CHIUSURA_CONFIG[key] ?? { label: key, className: "bg-gray-100 text-gray-600" };
  return <Badge className={cn("text-xs", cfg.className)}>{cfg.label}</Badge>;
}

// ─── KPI Card ───────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card className="flex-1 min-w-0">
      <CardContent className="pt-4 pb-4">
        <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
        <p className="text-xs text-gray-500 mt-1">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Timeline item ──────────────────────────────────────────────────────────

function TimelineItem({
  rapportino,
  onFirmaOra,
}: {
  rapportino: RapportinoStorico;
  onFirmaOra: (ticketId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const fotos: string[] = [
    ...(rapportino.foto_chiusura ?? []),
    ...(rapportino.foto_urls ?? []),
  ].slice(0, 3);

  const oreLavorateDisplay =
    rapportino.ore_lavoro_effettive ?? rapportino.ore_lavoro ?? null;

  const statoDisplay = rapportino.stato_chiusura ?? rapportino.stato ?? null;
  const ticketId = rapportino.ticket_id ?? rapportino.ticket?.id ?? null;
  const isFirmato = !!rapportino.firma_tecnico_url;

  return (
    <>
      {/* Lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxSrc(null)}
        >
          <img loading="lazy"
            src={lightboxSrc}
            alt="Foto ingrandita"
            className="max-h-[85vh] max-w-full rounded-lg shadow-2xl object-contain"
          />
        </div>
      )}

      <div className="bg-white border rounded-lg p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-800 truncate">
                {rapportino.ticket?.subject ?? "Intervento"}
              </span>
              {getStatoBadge(statoDisplay)}
              {isFirmato && (
                <Badge className="bg-green-100 text-green-700 text-xs gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Firmato
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {format(new Date(rapportino.created_at), "dd MMM yyyy", { locale: it })}
              </span>
              {oreLavorateDisplay != null && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {oreLavorateDisplay}h lavorate
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isFirmato && ticketId && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs text-[#1E3A5F] border-[#1E3A5F]/30 hover:bg-blue-50"
                onClick={() => onFirmaOra(ticketId)}
              >
                <PenTool className="h-3 w-3" />
                Firma ora
              </Button>
            )}
            {(rapportino.note_chiusura || fotos.length > 0) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-gray-400"
                onClick={() => setExpanded((v) => !v)}
                aria-label={expanded ? "Comprimi" : "Espandi"}
              >
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>

        {/* Expanded content */}
        {expanded && (
          <div className="space-y-3 pt-2 border-t">
            {rapportino.note_chiusura && (
              <div className="bg-gray-50 rounded p-3 text-sm text-gray-700 leading-relaxed">
                <p className="text-xs text-gray-400 font-medium mb-1 uppercase tracking-wide">
                  Note chiusura
                </p>
                {rapportino.note_chiusura}
              </div>
            )}
            {fotos.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {fotos.map((url, i) => (
                  <button
                    key={i}
                    type="button"
                    className="h-16 w-16 rounded overflow-hidden border hover:opacity-80 transition-opacity"
                    onClick={() => setLightboxSrc(url)}
                    aria-label={`Foto ${i + 1}`}
                  >
                    <img loading="lazy"
                      src={url}
                      alt={`Foto ${i + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function StoricoImpianto() {
  const { impiantoId } = useParams<{ impiantoId: string }>();
  const navigate = useNavigate();

  // ── Query impianto ────────────────────────────────────────────────────────
  const { data: impianto, isLoading: impiantoLoading, isError: impiantoError } = useQuery({
    queryKey: ["impianto-storico-header", impiantoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("impianti_cliente")
        .select(
          "id, tipo_impianto, marca, modello, matricola, customer_id, customer:profiles!impianti_cliente_customer_id_fkey(first_name, last_name)"
        )
        .eq("id", impiantoId!)
        .single();
      if (error) throw error;
      return data as ImpiantoCliente;
    },
    enabled: !!impiantoId,
  });

  // ── Query rapportini per impianto ─────────────────────────────────────────
  const { data: rapportini = [], isLoading: rapportiniLoading, isError: rapportiniError } = useQuery({
    queryKey: ["storico-rapportini-impianto", impiantoId],
    queryFn: async () => {
      // Primary: rapportini with impianto_id
      const { data: rapData, error: rapError } = await (supabase as any)
        .from("rapportini_intervento")
        .select(
          "id, ticket_id, created_at, stato, stato_chiusura, note_chiusura, ore_lavoro, ore_lavoro_effettive, firma_tecnico_url, foto_chiusura, foto_urls"
        )
        .eq("impianto_id", impiantoId!)
        .order("created_at", { ascending: false });
      if (rapError) throw rapError;

      let items: RapportinoStorico[] = (rapData ?? []) as RapportinoStorico[];

      // If no rapportini found via impianto_id, try via tickets
      if (items.length === 0) {
        const { data: ticketData, error: ticketErr } = await supabase
          .from("tickets")
          .select("id, subject")
          .eq("impianto_id", impiantoId!);
        if (ticketErr) throw ticketErr;

        if (ticketData && ticketData.length > 0) {
          const ticketIds = ticketData.map((t) => t.id);
          const { data: rapFromTickets, error: rapFromTicketsErr } = await (supabase as any)
            .from("rapportini_intervento")
            .select(
              "id, ticket_id, created_at, stato, stato_chiusura, note_chiusura, ore_lavoro, ore_lavoro_effettive, firma_tecnico_url, foto_chiusura, foto_urls"
            )
            .in("ticket_id", ticketIds)
            .order("created_at", { ascending: false });
          if (rapFromTicketsErr) throw rapFromTicketsErr;

          // Enrich with ticket subject
          const ticketMap = Object.fromEntries(ticketData.map((t) => [t.id, t]));
          items = ((rapFromTickets ?? []) as RapportinoStorico[]).map((r) => ({
            ...r,
            ticket: r.ticket_id ? ticketMap[r.ticket_id] ?? null : null,
          }));
        }

        // Also add tickets without rapportini (virtual entries)
        if (items.length === 0 && ticketData && ticketData.length > 0) {
          items = ticketData.map((t) => ({
            id: `ticket-${t.id}`,
            ticket_id: t.id,
            ticket: t,
            created_at: new Date().toISOString(),
            stato: "aperto",
            stato_chiusura: null,
            note_chiusura: null,
            ore_lavoro: null,
            ore_lavoro_effettive: null,
            firma_tecnico_url: null,
            foto_chiusura: null,
            foto_urls: null,
          }));
        }
      } else {
        // Enrich with ticket subject via join
        const ticketIds = [...new Set(items.map((r) => r.ticket_id).filter(Boolean))];
        if (ticketIds.length > 0) {
          const { data: ticketData, error: ticketEnrichErr } = await supabase
            .from("tickets")
            .select("id, subject")
            .in("id", ticketIds as string[]);
          if (ticketEnrichErr) throw ticketEnrichErr;
          const ticketMap = Object.fromEntries((ticketData ?? []).map((t) => [t.id, t]));
          items = items.map((r) => ({
            ...r,
            ticket: r.ticket_id ? (ticketMap[r.ticket_id] ?? null) : null,
          }));
        }
      }

      return items;
    },
    enabled: !!impiantoId,
  });

  // ── KPI calculation ───────────────────────────────────────────────────────

  const totaleInterventi = rapportini.length;
  const oreTotali = rapportini.reduce((acc, r) => {
    return acc + (r.ore_lavoro_effettive ?? r.ore_lavoro ?? 0);
  }, 0);
  const firmati = rapportini.filter((r) => !!r.firma_tecnico_url).length;
  const percentualeFirmati =
    totaleInterventi > 0 ? Math.round((firmati / totaleInterventi) * 100) : 0;

  const ultimoIntervento =
    rapportini.length > 0
      ? format(new Date(rapportini[0].created_at), "dd MMM yy", { locale: it })
      : "—";

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleFirmaOra = (ticketId: string) => {
    navigate(`/azienda/assistenza/${ticketId}/chiudi`);
  };

  const handleNuovoIntervento = () => {
    navigate(`/azienda/assistenza/nuovo?tipo=intervento&impiantoId=${impiantoId}`);
  };

  // ── Loading state ─────────────────────────────────────────────────────────

  const isLoading = impiantoLoading || rapportiniLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-3xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <div className="grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  if (impiantoError) {
    return (
      <div className="p-6 max-w-md mx-auto">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Errore nel caricamento. Riprova.</AlertDescription>
        </Alert>
        <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>
          Torna indietro
        </Button>
      </div>
    );
  }

  if (!impianto) {
    return (
      <div className="p-6 text-center py-20">
        <AlertCircle className="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">Impianto non trovato</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>
          Torna indietro
        </Button>
      </div>
    );
  }

  const customerName = impianto.customer
    ? [impianto.customer.first_name, impianto.customer.last_name].filter(Boolean).join(" ")
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/azienda/manutenzione/impianto/${impiantoId}`)}
          className="mt-0.5 -ml-2"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">Storico Interventi</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {[impianto.marca, impianto.modello].filter(Boolean).join(" ") || impianto.tipo_impianto || "Impianto"}
          </p>
        </div>
        <Button
          onClick={handleNuovoIntervento}
          size="sm"
          className="gap-2 bg-[#1E3A5F] hover:bg-[#162d4a] shrink-0"
        >
          <Plus className="h-4 w-4" />
          Nuovo intervento
        </Button>
      </div>

      {/* Impianto header card */}
      <Card className="bg-gradient-to-br from-[#1E3A5F]/5 to-white border-[#1E3A5F]/10">
        <CardContent className="pt-5 pb-5">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-white border border-gray-100 shadow-sm flex items-center justify-center shrink-0">
              {getTipoIcon(impianto.tipo_impianto)}
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <p className="font-semibold text-gray-900">
                {[impianto.marca, impianto.modello].filter(Boolean).join(" ") || "—"}
              </p>
              {impianto.tipo_impianto && (
                <p className="text-sm text-gray-600 capitalize">{impianto.tipo_impianto}</p>
              )}
              {impianto.matricola && (
                <p className="text-xs text-gray-400">
                  Matricola: <span className="font-mono">{impianto.matricola}</span>
                </p>
              )}
              {customerName && (
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {customerName}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Interventi totali" value={totaleInterventi} />
        <KpiCard
          label="Ore lavorate"
          value={oreTotali > 0 ? `${oreTotali.toFixed(1)}h` : "—"}
        />
        <KpiCard
          label="% Firmati"
          value={totaleInterventi > 0 ? `${percentualeFirmati}%` : "—"}
          sub={`${firmati} su ${totaleInterventi}`}
        />
        <KpiCard label="Ultimo intervento" value={ultimoIntervento} />
      </div>

      {/* Timeline */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Cronologia interventi</h2>
          <span className="text-xs text-gray-400">{totaleInterventi} record</span>
        </div>

        {rapportiniError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Errore nel caricamento. Riprova.</AlertDescription>
          </Alert>
        ) : rapportini.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Wrench className="h-10 w-10 text-gray-200 mx-auto mb-3" />
              <p className="font-medium text-gray-600">Nessun intervento registrato</p>
              <p className="text-sm text-gray-400 mt-1">
                Crea il primo intervento per questo impianto
              </p>
              <Button
                className="mt-4 gap-2 bg-[#1E3A5F] hover:bg-[#162d4a]"
                onClick={handleNuovoIntervento}
              >
                <Plus className="h-4 w-4" />
                Nuovo intervento
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {rapportini.map((r) => (
              <TimelineItem
                key={r.id}
                rapportino={r}
                onFirmaOra={handleFirmaOra}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
