import { TrendingUp, TrendingDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import type { SedeAnalyticsData } from '@/hooks/useSediAnalytics'

function formatCurrency(v: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}
function formatPercent(v: number) {
  return `${v.toFixed(1)}%`
}

function getSemaforoColor(margine_pct: number) {
  if (margine_pct >= 35) return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' }
  if (margine_pct >= 20) return { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700'  }
  return                        { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700'    }
}

interface Props {
  sede:      SedeAnalyticsData
  totRicavi: number
}

export function SedeMargineCard({ sede }: Props) {
  const colors = getSemaforoColor(sede.margine_pct)
  const conversione =
    sede.n_preventivi > 0
      ? formatPercent((sede.preventivi_vinti / sede.n_preventivi) * 100)
      : '—'

  return (
    <Card className={`border-2 ${colors.border} ${colors.bg}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="w-4 h-4 rounded-full flex-shrink-0"
              style={{ backgroundColor: sede.colore }}
            />
            <CardTitle className="text-base font-semibold text-[#1E3A5F] truncate">
              {sede.nome}
            </CardTitle>
          </div>
          <span className={`text-2xl font-bold ${colors.text}`}>
            {formatPercent(sede.margine_pct)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground capitalize">
          {sede.tipo}{sede.citta ? ` • ${sede.citta}` : ''}
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Ricavi</p>
            <p className="font-semibold">{formatCurrency(sede.ricavi)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Margine €</p>
            <p className="font-semibold">{formatCurrency(sede.margine)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">N. Preventivi</p>
            <p className="font-semibold">{sede.n_preventivi}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Conversione</p>
            <p className="font-semibold">{conversione}</p>
          </div>
        </div>

        {/* Barra incidenza ricavi */}
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Incidenza sui ricavi azienda</span>
            <span className="font-medium text-[#1E3A5F]">
              {formatPercent(sede.incidenza_ricavi)}
            </span>
          </div>
          <Progress value={sede.incidenza_ricavi} className="h-2" />
        </div>

        {/* Delta incidenza */}
        <div className="flex items-center gap-2 pt-1">
          {sede.delta_incidenza >= 0 ? (
            <TrendingUp className="h-4 w-4 text-green-600 flex-shrink-0" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-600 flex-shrink-0" />
          )}
          <span className="text-xs text-muted-foreground">
            Delta incidenza:{' '}
            {sede.delta_incidenza > 0 ? '+' : ''}
            {sede.delta_incidenza.toFixed(1)}pp{' '}
            {sede.delta_incidenza > 0 ? '— Sede premium ✓' : '— Da analizzare ⚠'}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
