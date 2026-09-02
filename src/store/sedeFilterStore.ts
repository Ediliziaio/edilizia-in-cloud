import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SedeFilterState {
  sediSelezionate: string[]      // array di sede_id, vuoto = tutte
  periodo: { da: string; a: string }
  tipoSede: string | null        // 'showroom'|'magazzino'|'ufficio'|'altro'|null
  setSediSelezionate: (ids: string[]) => void
  setPeriodo: (da: string, a: string) => void
  setTipoSede: (tipo: string | null) => void
  resetFiltri: () => void
}

function defaultPeriodo() {
  const a  = new Date()
  const da = new Date(a.getFullYear(), 0, 1) // 1 gen anno corrente
  return {
    da: da.toISOString().split('T')[0],
    a:  a.toISOString().split('T')[0],
  }
}

export const useSedeFilter = create<SedeFilterState>()(
  persist(
    (set) => ({
      sediSelezionate: [] as string[],
      periodo:         defaultPeriodo(),
      tipoSede:        null as string | null,

      setSediSelezionate: (ids) => set({ sediSelezionate: ids }),
      setPeriodo:         (da, a) => set({ periodo: { da, a } }),
      setTipoSede:        (tipo) => set({ tipoSede: tipo }),
      resetFiltri:        () =>
        set({ sediSelezionate: [], periodo: defaultPeriodo(), tipoSede: null }),
    }),
    { name: 'sede-filter-storage' }
  )
)
