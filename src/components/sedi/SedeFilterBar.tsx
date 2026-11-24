import { MapPin, X, Settings } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
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
import { useT } from "@/lib/campo/lingua/LinguaCampo";

// v8.6.42 — Rimosso 'cantiere': i cantieri sono `orders`, non sedi.
const TIPI_SEDE = ['showroom', 'magazzino', 'ufficio'] as const

export function SedeFilterBar() {
  const t = useT();
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
      ? t("Tutte le sedi")
      : sediSelezionate.length === 1
        ? (attive.find((s) => s.id === sediSelezionate[0])?.nome ?? t("1 sede"))
        : t("{n} sedi", { n: sediSelezionate.length })

  const hasFilter = sediSelezionate.length > 0 || tipoSede !== null

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Dropdown sedi */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-eic-navy text-eic-navy hover:bg-eic-navy/5"
          >
            <MapPin className="h-4 w-4" />
            {label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>{t("Filtra per Sede")}</DropdownMenuLabel>
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
                {t("Tutte le sedi")}
              </DropdownMenuCheckboxItem>
            </>
          )}
          {attive.length === 0 && (
            <div className="px-3 py-2 space-y-2">
              <p className="text-sm text-muted-foreground">{t("Nessuna sede attiva")}</p>
              <Link
                to="/azienda/impostazioni/sedi"
                className="flex items-center gap-1.5 text-xs text-eic-navy hover:underline"
              >
                <Settings className="h-3 w-3" />
                {t("Configura sedi")}
              </Link>
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Filtro per tipo sede */}
      {TIPI_SEDE.map((tipo) => (
        <Button
          key={tipo}
          type="button"
          size="sm"
          aria-pressed={tipoSede === tipo}
          variant={tipoSede === tipo ? 'default' : 'outline'}
          className="cursor-pointer capitalize select-none"
          style={
            tipoSede === tipo
              ? { backgroundColor: '#1E3A5F', color: '#fff' }
              : {}
          }
          onClick={() => setTipoSede(tipoSede === tipo ? null : tipo)}
        >
          {t(tipo)}
        </Button>
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
          {t("Reset")}
        </Button>
      )}
    </div>
  )
}
