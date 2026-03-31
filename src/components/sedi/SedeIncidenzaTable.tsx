import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useSediAnalytics } from '@/hooks/useSediAnalytics'
import { useSedeFilter } from '@/store/sedeFilterStore'

function formatCurrency(v: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}
function formatPercent(v: number) {
  return `${v.toFixed(1)}%`
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta > 2)
    return (
      <Badge className="bg-green-100 text-green-700 gap-1 hover:bg-green-100">
        <TrendingUp className="h-3 w-3" />+{delta.toFixed(1)}%
      </Badge>
    )
  if (delta < -2)
    return (
      <Badge className="bg-red-100 text-red-700 gap-1 hover:bg-red-100">
        <TrendingDown className="h-3 w-3" />{delta.toFixed(1)}%
      </Badge>
    )
  return (
    <Badge className="bg-gray-100 text-gray-600 gap-1 hover:bg-gray-100">
      <Minus className="h-3 w-3" />{delta.toFixed(1)}%
    </Badge>
  )
}

export function SedeIncidenzaTable() {
  const { sediSelezionate, periodo } = useSedeFilter()
  const { data, isLoading } = useSediAnalytics({ da: periodo.da, a: periodo.a })

  const sedi = (data?.sedi ?? [])
    .filter((s) => sediSelezionate.length === 0 || sediSelezionate.includes(s.sede_id))
    .sort((a, b) => b.delta_incidenza - a.delta_incidenza)

  if (isLoading) return <div className="h-48 animate-pulse bg-muted rounded-lg" />

  if (sedi.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground text-sm">
        Nessun dato disponibile. Assegna le sedi ai preventivi per visualizzare le analytics.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-[#1E3A5F] text-white">
          <tr>
            <th className="p-3 text-left">Sede</th>
            <th className="p-3 text-right">Ricavi</th>
            <th className="p-3 text-right">Margine</th>
            <th className="p-3 text-right">Marg. %</th>
            <th className="p-3 text-right">Inc. Ricavi</th>
            <th className="p-3 text-right">Inc. Margine</th>
            <th className="p-3 text-center">Delta</th>
          </tr>
        </thead>
        <tbody>
          {sedi.map((s, i) => (
            <tr key={s.sede_id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
              <td className="p-3">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: s.colore }}
                  />
                  <span className="font-medium">{s.nome}</span>
                  <span className="text-xs text-muted-foreground capitalize">{s.tipo}</span>
                </div>
              </td>
              <td className="p-3 text-right font-mono">{formatCurrency(s.ricavi)}</td>
              <td className="p-3 text-right font-mono">{formatCurrency(s.margine)}</td>
              <td className="p-3 text-right">
                <span
                  className={
                    s.margine_pct >= 35
                      ? 'text-green-600 font-semibold'
                      : s.margine_pct >= 20
                        ? 'text-amber-600 font-semibold'
                        : 'text-red-600 font-semibold'
                  }
                >
                  {formatPercent(s.margine_pct)}
                </span>
              </td>
              <td className="p-3 text-right text-muted-foreground">
                {formatPercent(s.incidenza_ricavi)}
              </td>
              <td className="p-3 text-right text-muted-foreground">
                {formatPercent(s.incidenza_margine)}
              </td>
              <td className="p-3 text-center">
                <DeltaBadge delta={s.delta_incidenza} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
