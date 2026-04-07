import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Trophy } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCampaignDetail, type CampaignVariant } from "@/hooks/superadmin/useCampaigns";

// ─── Utilità ──────────────────────────────────────────────

/** Calcola la percentuale su sent_count, restituisce 0 se sent_count è 0 */
function calcolaPerc(contatore: number, inviati: number): number {
  if (inviati === 0) return 0;
  return Math.round((contatore / inviati) * 1000) / 10;
}

/** Formatta una percentuale con un decimale */
function fmtPerc(val: number): string {
  return `${val.toFixed(1)}%`;
}

// ─── Skeleton loader ───────────────────────────────────────

function SkeletonAnalytics() {
  return (
    <div className="space-y-6 p-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-48" />
      <div className="rounded-md border">
        <div className="p-4 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

// ─── Componente riga metrica variante ──────────────────────

interface RigaVarianteProps {
  variante: CampaignVariant;
  isVincitrice: boolean;
}

function RigaVariante({ variante, isVincitrice }: RigaVarianteProps) {
  const openRate = calcolaPerc(variante.open_count, variante.sent_count);
  const clickRate = calcolaPerc(variante.click_count, variante.sent_count);
  const convRate = calcolaPerc(variante.conversion_count, variante.sent_count);
  const unsubRate = calcolaPerc(variante.unsubscribe_count, variante.sent_count);

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="font-bold w-7 h-7 flex items-center justify-center p-0"
          >
            {variante.variant_name}
          </Badge>
          {isVincitrice && (
            <Badge className="bg-green-100 text-green-800 border-green-300 text-xs">
              <Trophy className="h-3 w-3 mr-1" />
              Vincente
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="tabular-nums">
        {variante.sent_count.toLocaleString("it-IT")}
      </TableCell>
      <TableCell>
        <span className="font-medium">{variante.open_count.toLocaleString("it-IT")}</span>
        <span className="text-muted-foreground text-xs ml-1">({fmtPerc(openRate)})</span>
      </TableCell>
      <TableCell>
        <span className="font-medium">{variante.click_count.toLocaleString("it-IT")}</span>
        <span className="text-muted-foreground text-xs ml-1">({fmtPerc(clickRate)})</span>
      </TableCell>
      <TableCell>
        <span className="font-medium">{variante.conversion_count.toLocaleString("it-IT")}</span>
        <span className="text-muted-foreground text-xs ml-1">({fmtPerc(convRate)})</span>
      </TableCell>
      <TableCell>
        <span className="font-medium">{variante.unsubscribe_count.toLocaleString("it-IT")}</span>
        <span className="text-muted-foreground text-xs ml-1">({fmtPerc(unsubRate)})</span>
      </TableCell>
    </TableRow>
  );
}

// ─── Calcolo vincitore ─────────────────────────────────────

/**
 * Restituisce il nome della variante vincitrice se:
 * - differenza open_rate > 5%
 * - sent_count di entrambe > 100
 */
function calcolaVincitrice(varianti: CampaignVariant[]): string | null {
  const a = varianti.find(v => v.variant_name === "A");
  const b = varianti.find(v => v.variant_name === "B");

  if (!a || !b) return null;
  if (a.sent_count <= 100 || b.sent_count <= 100) return null;

  const openRateA = calcolaPerc(a.open_count, a.sent_count);
  const openRateB = calcolaPerc(b.open_count, b.sent_count);
  const diff = Math.abs(openRateA - openRateB);

  if (diff <= 5) return null;

  return openRateA > openRateB ? "A" : "B";
}

// ─── Pagina principale ─────────────────────────────────────

/** Pagina analytics per una singola campagna con confronto A/B */
export default function CampaignAnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: campagna, isLoading } = useCampaignDetail(id ?? "");

  if (isLoading) return <SkeletonAnalytics />;

  if (!campagna) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="ghost" onClick={() => navigate("/admin/campagne")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Torna alle campagne
        </Button>
        <p className="text-muted-foreground">Campagna non trovata.</p>
      </div>
    );
  }

  const varianti = campagna.variants;
  const nomeVincitrice = calcolaVincitrice(varianti);

  // Prepara i dati per il grafico a barre comparativo
  const datiGrafico = [
    {
      metrica: "Aperture %",
      A: calcolaPerc(
        varianti.find(v => v.variant_name === "A")?.open_count ?? 0,
        varianti.find(v => v.variant_name === "A")?.sent_count ?? 0
      ),
      B: calcolaPerc(
        varianti.find(v => v.variant_name === "B")?.open_count ?? 0,
        varianti.find(v => v.variant_name === "B")?.sent_count ?? 0
      ),
    },
    {
      metrica: "Click %",
      A: calcolaPerc(
        varianti.find(v => v.variant_name === "A")?.click_count ?? 0,
        varianti.find(v => v.variant_name === "A")?.sent_count ?? 0
      ),
      B: calcolaPerc(
        varianti.find(v => v.variant_name === "B")?.click_count ?? 0,
        varianti.find(v => v.variant_name === "B")?.sent_count ?? 0
      ),
    },
    {
      metrica: "Conversioni %",
      A: calcolaPerc(
        varianti.find(v => v.variant_name === "A")?.conversion_count ?? 0,
        varianti.find(v => v.variant_name === "A")?.sent_count ?? 0
      ),
      B: calcolaPerc(
        varianti.find(v => v.variant_name === "B")?.conversion_count ?? 0,
        varianti.find(v => v.variant_name === "B")?.sent_count ?? 0
      ),
    },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <Button
            variant="ghost"
            size="sm"
            className="mb-1 -ml-2 text-muted-foreground"
            onClick={() => navigate("/admin/campagne")}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Torna alle campagne
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">{campagna.name}</h1>
          <p className="text-muted-foreground text-sm">
            Analytics e confronto varianti A/B
          </p>
        </div>

        {/* Badge vincitore */}
        {nomeVincitrice && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
            <Trophy className="h-5 w-5 text-green-600" />
            <span className="font-semibold text-green-800 text-sm">
              Variante {nomeVincitrice} sta vincendo
            </span>
          </div>
        )}
      </div>

      {/* Tabella metriche varianti */}
      <div className="rounded-md border bg-background">
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold text-sm">Metriche comparate per variante</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Variante</TableHead>
              <TableHead>Inviati</TableHead>
              <TableHead>Aperture</TableHead>
              <TableHead>Click</TableHead>
              <TableHead>Conversioni</TableHead>
              <TableHead>Disiscrizioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {varianti.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground py-8"
                >
                  Nessuna variante disponibile per questa campagna.
                </TableCell>
              </TableRow>
            )}
            {varianti.map(variante => (
              <RigaVariante
                key={variante.id}
                variante={variante}
                isVincitrice={variante.variant_name === nomeVincitrice}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Grafico comparativo */}
      {varianti.length >= 2 && (
        <div className="rounded-md border bg-background p-4">
          <h2 className="font-semibold text-sm mb-4">
            Confronto visivo varianti A vs B
          </h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={datiGrafico}
              margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="metrica"
                tick={{ fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={v => `${v}%`}
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                formatter={(value: number) => [`${value.toFixed(1)}%`]}
                contentStyle={{
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
              />
              {/* Barre side-by-side per variante A e B */}
              <Bar
                dataKey="A"
                name="Variante A"
                fill="#3b82f6"
                radius={[4, 4, 0, 0]}
                maxBarSize={60}
              />
              <Bar
                dataKey="B"
                name="Variante B"
                fill="#f97316"
                radius={[4, 4, 0, 0]}
                maxBarSize={60}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
