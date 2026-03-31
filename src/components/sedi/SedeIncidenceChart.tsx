import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { SedeAnalyticsData } from '@/hooks/useSediAnalytics'

function formatCurrency(v: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}

interface Props {
  sedi:   SedeAnalyticsData[]
  metric: 'ricavi' | 'margine' | 'n_lead'
  title:  string
}

export function SedeIncidenceChart({ sedi, metric, title }: Props) {
  const total = sedi.reduce((s, d) => s + (d[metric] as number), 0)

  const chartData = sedi
    .map((s) => ({
      name:  s.nome,
      value: s[metric] as number,
      color: s.colore,
    }))
    .filter((d) => d.value > 0)

  const formatTooltip = (val: number) =>
    metric === 'n_lead' ? `${val} lead` : formatCurrency(val)

  if (chartData.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-semibold text-[#1E3A5F] mb-3">{title}</h3>
        <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
          Nessun dato disponibile
        </div>
      </div>
    )
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-[#1E3A5F] mb-3">{title}</h3>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={2}
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              /* Safe: static color array, no item state */
              <Cell key={index} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip formatter={(val: number) => formatTooltip(val)} />
          <Legend
            formatter={(value, entry) => {
              const pct = total > 0
                ? ((entry.payload as any).value / total * 100).toFixed(1)
                : '0'
              return `${value} (${pct}%)`
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
