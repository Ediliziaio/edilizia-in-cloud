import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useSediAnalytics } from '@/hooks/useSediAnalytics'
import { useSedeFilter } from '@/store/sedeFilterStore'

export function LeadPerSedeChart() {
  const { sediSelezionate, periodo, tipoSede } = useSedeFilter()
  const { data, isLoading } = useSediAnalytics({
    da:        periodo.da,
    a:         periodo.a,
    tipo_sede: tipoSede ?? undefined,
  })

  const sedi = (data?.sedi ?? []).filter(
    (s) => sediSelezionate.length === 0 || sediSelezionate.includes(s.sede_id)
  )

  const chartData = sedi.map((s) => ({
    nome:       s.nome.length > 15 ? s.nome.slice(0, 15) + '…' : s.nome,
    Lead:       s.n_lead,
    'CPL (€)':  s.cpl,
    fill:       s.colore,
  }))

  if (isLoading) return <div className="h-64 animate-pulse bg-muted rounded-lg" />

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-[#1E3A5F] text-base">Lead & CPL per Sede</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
            Nessun dato disponibile
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[#1E3A5F] text-base">Lead & CPL per Sede</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart
            data={chartData}
            margin={{ top: 5, right: 20, bottom: 20, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="nome" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="left"  tick={{ fontSize: 12 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={(val: number, name: string) =>
                name === 'CPL (€)' ? `${val} €` : val
              }
            />
            <Legend />
            <Bar
              yAxisId="left"
              dataKey="Lead"
              fill="#1E3A5F"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              yAxisId="right"
              dataKey="CPL (€)"
              fill="#F97316"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
