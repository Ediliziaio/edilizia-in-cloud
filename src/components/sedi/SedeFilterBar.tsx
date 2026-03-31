import { MapPin, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSedeFilter } from '@/store/sedeFilterStore'
import { useSediList } from '@/hooks/useSediAnalytics'

const TIPI_SEDE = ['showroom', 'cantiere', 'magazzino', 'ufficio'] as const

export function SedeFilterBar() {
  const {
    sediSelezionate,
    tipoSede,
    setSediSelezionate,
    setTipoSede,
    resetFiltri,
  } = useSedeFilter()

  const { data: sedi = [] } = useSediList()
  const attive = sedi.filter((s) => s.attiva)

  const toggleSede = (id: string) => {
    setSediSelezionate(
      sediSelezionate.includes(id)
        ? sediSelezionate.filter((s) => s !== id)
        : [...sediSelezionate, id]
    )
  }

  const label =
    sediSelezionate.length === 0
      ? 'Tutte le sedi'
      : sediSelezionate.length === 1
        ? (attive.find((s) => s.id === sediSelezionate[0])?.nome ?? '1 sede')
        : `${sediSelezionate.length} sedi`

  const hasFilter = sediSelezionate.length > 0 || tipoSede !== null

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Dropdown sedi */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-[#1E3A5F] text-[#1E3A5F] hover:bg-[#1E3A5F]/5"
          >
            <MapPin className="h-4 w-4" />
            {label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Filtra per Sede</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {attive.map((sede) => (
            <DropdownMenuCheckboxItem
              key={sede.id}
              checked={sediSelezionate.includes(sede.id)}
              onCheckedChange={() => toggleSede(sede.id)}
            >
              <span
                className="inline-block w-3 h-3 rounded-full mr-2 flex-shrink-0"
                style={{ backgroundColor: sede.colore ?? '#1E3A5F' }}
              />
              <span className="flex-1 truncate">{sede.nome}</span>
              <span className="ml-auto text-xs text-muted-foreground capitalize">
                {sede.tipo}
              </span>
            </DropdownMenuCheckboxItem>
          ))}
          {attive.length > 1 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={sediSelezionate.length === 0}
                onCheckedChange={() => setSediSelezionate([])}
              >
                Tutte le sedi
              </DropdownMenuCheckboxItem>
            </>
          )}
          {attive.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Nessuna sede attiva
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Filtro per tipo sede */}
      {TIPI_SEDE.map((tipo) => (
        <Badge
          key={tipo}
          variant={tipoSede === tipo ? 'default' : 'outline'}
          className="cursor-pointer capitalize select-none"
          style={
            tipoSede === tipo
              ? { backgroundColor: '#1E3A5F', color: '#fff' }
              : {}
          }
          onClick={() => setTipoSede(tipoSede === tipo ? null : tipo)}
        >
          {tipo}
        </Badge>
      ))}

      {/* Reset */}
      {hasFilter && (
        <Button
          variant="ghost"
          size="sm"
          onClick={resetFiltri}
          className="gap-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
          Reset
        </Button>
      )}
    </div>
  )
}
