import { useMemo, useState } from 'react'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Building2, Clock, Mail, MapPin, Pencil, Phone, Plus, Search, Star, Trash2, UserRound, Warehouse, Briefcase, MoreHorizontal, LayoutGrid, List as ListIcon } from 'lucide-react'

import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'
import { useSediList } from '@/hooks/useSediAnalytics'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Card, CardContent } from '@/components/ui/card'

// ── Schema Zod ──────────────────────────────────────────────
const emptyToUndefined = (v: string | undefined) => (!v || v.trim() === '' ? undefined : v)

const sedeSchema = z.object({
  nome:      z.string().min(2, 'Nome richiesto (min 2 caratteri)'),
  tipo:      z.enum(['showroom', 'magazzino', 'ufficio', 'altro']),
  indirizzo: z.preprocess(emptyToUndefined, z.string().optional()),
  citta:     z.preprocess(emptyToUndefined, z.string().optional()),
  cap:       z.preprocess(emptyToUndefined, z.string().regex(/^\d{5}$/, 'CAP non valido').optional()),
  provincia: z.preprocess(emptyToUndefined, z.string().length(2, 'Inserisci 2 lettere').optional()),
  regione:   z.preprocess(emptyToUndefined, z.string().optional()),
  nazione:   z.preprocess(emptyToUndefined, z.string().optional()),
  telefono:  z.preprocess(emptyToUndefined, z.string().regex(/^[+()0-9\s.-]{6,30}$/, 'Telefono non valido').optional()),
  email:     z.preprocess(emptyToUndefined, z.string().email('Email non valida').optional()),
  responsabile_sede: z.preprocess(emptyToUndefined, z.string().optional()),
  orari_apertura:    z.preprocess(emptyToUndefined, z.string().optional()),
  note_interne:      z.preprocess(emptyToUndefined, z.string().optional()),
  lat:       z.preprocess(emptyToUndefined, z.coerce.number().min(-90, 'Latitudine non valida').max(90, 'Latitudine non valida').optional()),
  lng:       z.preprocess(emptyToUndefined, z.coerce.number().min(-180, 'Longitudine non valida').max(180, 'Longitudine non valida').optional()),
  colore:    z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#1E3A5F'),
})

type SedeFormData = z.infer<typeof sedeSchema>
type Sede = {
  id: string
  nome: string
  tipo: SedeFormData['tipo']
  indirizzo: string | null
  citta: string | null
  cap: string | null
  provincia: string | null
  regione: string | null
  nazione: string | null
  telefono: string | null
  email: string | null
  responsabile_sede: string | null
  orari_apertura: string | null
  note_interne: string | null
  lat: number | null
  lng: number | null
  colore: string | null
  attiva: boolean | null
  principale: boolean | null
}

// v8.6.42 — Rimosso tipo 'cantiere': i cantieri sono entità separate
// (tabella `orders`), il tipo qui era ridondante e confondeva l'UX.
const TIPO_LABELS: Record<string, string> = {
  showroom: 'Showroom',
  magazzino: 'Magazzino',
  ufficio: 'Ufficio',
  altro: 'Altro',
}

// v8.6.41 — Mapping tipo → icona + colore semantico (badge + stat cards).
// Tailwind richiede classi statiche, quindi non si genera dinamicamente.
const TIPO_META: Record<string, { icon: typeof Building2; tone: string; chip: string; iconBg: string }> = {
  showroom:  { icon: Building2, tone: 'text-sky-700',     chip: 'bg-sky-50 text-sky-700 border-sky-200',         iconBg: 'bg-sky-100 text-sky-700' },
  magazzino: { icon: Warehouse, tone: 'text-emerald-700', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', iconBg: 'bg-emerald-100 text-emerald-700' },
  ufficio:   { icon: Briefcase, tone: 'text-violet-700',  chip: 'bg-violet-50 text-violet-700 border-violet-200',  iconBg: 'bg-violet-100 text-violet-700' },
  altro:     { icon: MoreHorizontal, tone: 'text-slate-700', chip: 'bg-slate-50 text-slate-700 border-slate-200', iconBg: 'bg-slate-100 text-slate-700' },
}
function getTipoMeta(tipo: string) {
  return TIPO_META[tipo] ?? TIPO_META.altro
}

const COLORI_PRESET = [
  '#1E3A5F', '#F97316', '#16A34A', '#7C3AED',
  '#DC2626', '#0891B2', '#CA8A04', '#9333EA',
]

async function parseFunctionError(error: unknown, fallback: string) {
  const err = error as { context?: unknown; message?: string }
  try {
    if (err.context instanceof Response) {
      const body = await err.context.json()
      return body?.error ?? body?.message ?? err.message ?? fallback
    }
  } catch {
    return err.message ?? fallback
  }
  return err.message ?? fallback
}

// ── Componente principale ───────────────────────────────────
export default function SettingsSedi() {
  const { effectiveCompany } = useAuth()
  const permissions = usePermissions()
  const company_id = effectiveCompany?.id
  const qc = useQueryClient()
  const { data: sedi = [], isLoading } = useSediList()
  const canEditSedi = permissions.isAdmin || permissions.canEditSettingsOrders

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editSede, setEditSede] = useState<Sede | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [tipoFilter, setTipoFilter] = useState<'all' | SedeFormData['tipo']>('all')
  const [statoFilter, setStatoFilter] = useState<'all' | 'attive' | 'disattive'>('all')
  // v8.6.41 — toggle vista (grid card vs list)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  const filteredSedi = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (sedi as Sede[]).filter((sede) => {
      const matchesSearch = !term || [
        sede.nome,
        sede.citta,
        sede.provincia,
        sede.regione,
        sede.nazione,
        sede.indirizzo,
        sede.telefono,
        sede.email,
        sede.responsabile_sede,
      ].some((value) => value?.toLowerCase().includes(term))
      const matchesTipo = tipoFilter === 'all' || sede.tipo === tipoFilter
      const matchesStato =
        statoFilter === 'all' ||
        (statoFilter === 'attive' && sede.attiva) ||
        (statoFilter === 'disattive' && !sede.attiva)
      return matchesSearch && matchesTipo && matchesStato
    })
  }, [search, sedi, statoFilter, tipoFilter])

  const activeCount = (sedi as Sede[]).filter((sede) => sede.attiva).length

  // v8.6.41 — Conteggio per tipo (stats card + filtri rapidi)
  const countByTipo = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of sedi as Sede[]) {
      map[s.tipo] = (map[s.tipo] ?? 0) + 1
    }
    return map
  }, [sedi])

  const form = useForm<SedeFormData>({
    resolver: zodResolver(sedeSchema),
    defaultValues: { nome: '', tipo: 'showroom', colore: '#1E3A5F', nazione: 'Italia' },
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['sedi-list'] })

  // ── Mutations ─────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async (values: SedeFormData) => {
      if (!company_id) throw new Error('Azienda non disponibile')
      const action = editSede ? 'aggiorna' : 'crea'
      const { data, error } = await supabase.functions.invoke('gestisci-sede', {
        body: { action, company_id, sede_id: editSede?.id, ...values },
      })
      if (error) {
        // Edge function non-2xx: estraiamo il body JSON dalla response
        const message = await parseFunctionError(error, 'Errore nel salvataggio')
        const msg = message === 'LIMITE_PIANO'
          ? 'LIMITE_PIANO'
          : message
        throw new Error(msg)
      }
      if (data?.error) throw new Error(data.error === 'LIMITE_PIANO' ? 'LIMITE_PIANO' : (data.message ?? data.error))
      return data
    },
    onSuccess: () => {
      toast.success(editSede ? 'Sede aggiornata' : 'Sede creata')
      setDialogOpen(false)
      form.reset()
      setEditSede(null)
      invalidate()
    },
    onError: (err: Error) => {
      if (err.message === 'LIMITE_PIANO') {
        toast.error('Limite piano raggiunto. Passa a Pro per aggiungere più sedi.')
      } else {
        toast.error(err.message)
      }
    },
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, attiva }: { id: string; attiva: boolean }) => {
      if (!company_id) throw new Error('Azienda non disponibile')
      const { error } = await supabase.functions.invoke('gestisci-sede', {
        body: { action: 'aggiorna', company_id, sede_id: id, attiva },
      })
      if (error) {
        throw new Error(await parseFunctionError(error, 'Errore nell\'aggiornamento'))
      }
    },
    onSuccess: () => { invalidate() },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!company_id) throw new Error('Azienda non disponibile')
      const { error } = await supabase.functions.invoke('gestisci-sede', {
        body: { action: 'elimina', company_id, sede_id: id },
      })
      if (error) {
        throw new Error(await parseFunctionError(error, 'Errore nell\'eliminazione'))
      }
    },
    onSuccess: () => {
      toast.success('Sede eliminata')
      setDeleteId(null)
      invalidate()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const setPrincipaleMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!company_id) throw new Error('Azienda non disponibile')
      const { error } = await supabase.functions.invoke('gestisci-sede', {
        body: { action: 'aggiorna', company_id, sede_id: id, principale: true },
      })
      if (error) {
        throw new Error(await parseFunctionError(error, 'Errore'))
      }
    },
    onSuccess: () => { toast.success('Sede principale aggiornata'); invalidate() },
    onError: (err: Error) => toast.error(err.message),
  })

  // ── Dialog ────────────────────────────────────────────────
  function openCreate() {
    if (!canEditSedi) {
      toast.error('Non hai il permesso di modificare le sedi.')
      return
    }
    setEditSede(null)
    form.reset({ nome: '', tipo: 'showroom', colore: '#1E3A5F', nazione: 'Italia' })
    setDialogOpen(true)
  }

  function openEdit(sede: Sede) {
    if (!canEditSedi) {
      toast.error('Non hai il permesso di modificare le sedi.')
      return
    }
    setEditSede(sede)
    form.reset({
      nome:      sede.nome,
      tipo:      sede.tipo,
      indirizzo: sede.indirizzo ?? '',
      citta:     sede.citta ?? '',
      cap:       sede.cap ?? '',
      provincia: sede.provincia ?? '',
      regione:   sede.regione ?? '',
      nazione:   sede.nazione ?? 'Italia',
      telefono:  sede.telefono ?? '',
      email:     sede.email ?? '',
      responsabile_sede: sede.responsabile_sede ?? '',
      orari_apertura:    sede.orari_apertura ?? '',
      note_interne:      sede.note_interne ?? '',
      lat:       sede.lat ?? undefined,
      lng:       sede.lng ?? undefined,
      colore:    sede.colore ?? '#1E3A5F',
    })
    setDialogOpen(true)
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <MapPin className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">Sedi Aziendali</h1>
            <p className="text-sm text-muted-foreground">
              Showroom, magazzini, uffici. Usate per timbrature e geofencing HR,
              analytics su lead/preventivi/costi e segmentazione del cruscotto.
            </p>
          </div>
        </div>
        <Button onClick={openCreate} size="sm" className="shrink-0" disabled={!canEditSedi}>
          <Plus className="h-4 w-4 mr-1.5" />
          Nuova Sede
        </Button>
      </div>

      {/* v8.6.41 — Stats overview: totale + breakdown per tipo. Clickable per
          filtrare rapidamente. La card "Tutte" resetta il filtro tipo. */}
      {sedi.length > 0 && (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-6">
          <button
            type="button"
            onClick={() => setTipoFilter('all')}
            className={`rounded-lg border p-3 text-left transition-colors hover:bg-muted/40 ${tipoFilter === 'all' ? 'ring-2 ring-primary border-primary' : 'border-border'}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <div className="h-7 w-7 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                <MapPin className="h-3.5 w-3.5" />
              </div>
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Tutte</span>
            </div>
            <div className="text-lg font-bold leading-none">{sedi.length}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {activeCount} attive
            </div>
          </button>
          {Object.entries(TIPO_LABELS).map(([key, label]) => {
            const meta = getTipoMeta(key)
            const count = countByTipo[key] ?? 0
            const Icon = meta.icon
            const isSelected = tipoFilter === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTipoFilter(isSelected ? 'all' : key as typeof tipoFilter)}
                className={`rounded-lg border p-3 text-left transition-colors hover:bg-muted/40 ${isSelected ? 'ring-2 ring-primary border-primary' : 'border-border'} ${count === 0 ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className={`h-7 w-7 rounded-md flex items-center justify-center ${meta.iconBg}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium truncate">{label}</span>
                </div>
                <div className="text-lg font-bold leading-none">{count}</div>
              </button>
            )
          })}
        </div>
      )}

      {/* Filtri + view mode */}
      {sedi.length > 0 && (
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cerca per nome, città, responsabile, telefono o email..."
              className="pl-9"
            />
          </div>
          <Select value={statoFilter} onValueChange={(value) => setStatoFilter(value as typeof statoFilter)}>
            <SelectTrigger className="md:w-44">
              <SelectValue placeholder="Stato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              <SelectItem value="attive">Solo attive</SelectItem>
              <SelectItem value="disattive">Solo disattive</SelectItem>
            </SelectContent>
          </Select>
          {/* View mode toggle */}
          <div className="hidden md:inline-flex rounded-md border bg-background p-0.5">
            <Button
              type="button"
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 px-2.5"
              onClick={() => setViewMode('grid')}
              aria-label="Vista griglia"
              aria-pressed={viewMode === 'grid'}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 px-2.5"
              onClick={() => setViewMode('list')}
              aria-label="Vista lista"
              aria-pressed={viewMode === 'list'}
            >
              <ListIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Lista sedi */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse bg-muted rounded-lg" />
          ))}
        </div>
      ) : sedi.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 gap-4 text-center">
            <MapPin className="h-10 w-10 text-muted-foreground/40" />
            <div>
              <p className="text-base font-semibold">Nessuna sede configurata</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-md">
                Aggiungi le sedi della tua azienda per disaggregare gli analytics in ogni dashboard.
                Scegli il tipo per iniziare con i campi giusti precompilati.
              </p>
            </div>
            {/* v8.6.41 — Quick-add chips per tipo: precompila il dialog */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 w-full max-w-xl">
              {Object.entries(TIPO_LABELS).map(([key, label]) => {
                const meta = getTipoMeta(key)
                const Icon = meta.icon
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      if (!canEditSedi) {
                        toast.error('Non hai il permesso di modificare le sedi.')
                        return
                      }
                      setEditSede(null)
                      form.reset({ nome: '', tipo: key as SedeFormData['tipo'], colore: '#1E3A5F', nazione: 'Italia' })
                      setDialogOpen(true)
                    }}
                    disabled={!canEditSedi}
                    className="flex flex-col items-center gap-1.5 rounded-lg border p-3 hover:bg-muted/40 transition-colors disabled:opacity-50"
                  >
                    <div className={`h-8 w-8 rounded-md flex items-center justify-center ${meta.iconBg}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-medium">{label}</span>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ) : filteredSedi.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 gap-2 text-center">
            <Search className="h-9 w-9 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">Nessuna sede trovata</p>
            <p className="text-xs text-muted-foreground">Modifica ricerca o filtri per visualizzare altre sedi.</p>
          </CardContent>
        </Card>
      ) : (
        <div className={viewMode === 'grid' ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-3'}>
          {filteredSedi.map((sede) => {
            const meta = getTipoMeta(sede.tipo)
            const TipoIcon = meta.icon
            const indirizzo = [sede.indirizzo, sede.cap, sede.citta, sede.provincia, sede.regione].filter(Boolean).join(', ')

            // Card grid: layout verticale con accent colore tipo in alto
            if (viewMode === 'grid') {
              return (
                <Card
                  key={sede.id}
                  className={`relative overflow-hidden transition-opacity ${!sede.attiva ? 'opacity-60' : ''}`}
                >
                  {/* Accent bar colore tipo */}
                  <div
                    className="absolute top-0 left-0 right-0 h-1"
                    style={{ backgroundColor: sede.colore ?? '#1E3A5F' }}
                  />
                  <CardContent className="pt-5 pb-4 space-y-3">
                    {/* Header: tipo + nome + badges */}
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${meta.iconBg}`}>
                          <TipoIcon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold leading-tight truncate">{sede.nome}</div>
                          <div className="text-[11px] text-muted-foreground uppercase tracking-wide mt-0.5">
                            {TIPO_LABELS[sede.tipo] ?? sede.tipo}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {sede.principale && (
                          <Badge className="bg-amber-100 text-amber-700 text-[10px] hover:bg-amber-100 gap-1 h-5">
                            <Star className="h-2.5 w-2.5" /> Principale
                          </Badge>
                        )}
                        {!sede.attiva && (
                          <Badge variant="secondary" className="text-[10px] h-5">Disattiva</Badge>
                        )}
                      </div>
                    </div>

                    {/* Info contatti */}
                    {(indirizzo || sede.responsabile_sede || sede.telefono || sede.email || sede.orari_apertura) && (
                      <div className="space-y-1.5 text-xs text-muted-foreground border-t pt-3">
                        {indirizzo && (
                          <div className="flex items-start gap-1.5">
                            <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                            <span className="line-clamp-2">{indirizzo}</span>
                          </div>
                        )}
                        {sede.responsabile_sede && (
                          <div className="flex items-center gap-1.5">
                            <UserRound className="h-3 w-3 shrink-0" />
                            <span className="truncate">{sede.responsabile_sede}</span>
                          </div>
                        )}
                        {sede.telefono && (
                          <div className="flex items-center gap-1.5">
                            <Phone className="h-3 w-3 shrink-0" />
                            <a href={`tel:${sede.telefono}`} className="truncate hover:text-foreground">{sede.telefono}</a>
                          </div>
                        )}
                        {sede.email && (
                          <div className="flex items-center gap-1.5">
                            <Mail className="h-3 w-3 shrink-0" />
                            <a href={`mailto:${sede.email}`} className="truncate hover:text-foreground">{sede.email}</a>
                          </div>
                        )}
                        {sede.orari_apertura && (
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3 w-3 shrink-0" />
                            <span className="truncate">{sede.orari_apertura}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Azioni */}
                    <div className="flex items-center justify-between pt-2 border-t -mx-2 px-2">
                      <div className="flex items-center gap-1.5">
                        <Switch
                          checked={Boolean(sede.attiva)}
                          aria-label={`${sede.attiva ? 'Disattiva' : 'Attiva'} sede ${sede.nome}`}
                          onCheckedChange={(v) => toggleMutation.mutate({ id: sede.id, attiva: v })}
                          disabled={!canEditSedi || toggleMutation.isPending}
                        />
                        <span className="text-[11px] text-muted-foreground">
                          {sede.attiva ? 'Attiva' : 'Disattiva'}
                        </span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        {!sede.principale && sede.attiva && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px] text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                            aria-label={`Imposta ${sede.nome} come sede principale`}
                            onClick={() => setPrincipaleMutation.mutate(sede.id)}
                            disabled={!canEditSedi || setPrincipaleMutation.isPending}
                          >
                            <Star className="h-3 w-3 mr-1" />
                            Principale
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon" aria-label={`Modifica sede ${sede.nome}`}
                          className="h-7 w-7"
                          onClick={() => openEdit(sede)}
                          disabled={!canEditSedi}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon" aria-label={`Elimina sede ${sede.nome}`}
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteId(sede.id)}
                          disabled={!canEditSedi}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            }

            // List view (vecchio layout compatto in orizzontale)
            return (
              <Card key={sede.id} className={`transition-opacity ${!sede.attiva ? 'opacity-60' : ''}`}>
                <CardContent className="flex flex-col gap-4 py-4 lg:flex-row lg:items-center">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${meta.iconBg}`}>
                      <TipoIcon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold truncate">{sede.nome}</span>
                        <Badge variant="outline" className={`text-xs ${meta.chip}`}>
                          {TIPO_LABELS[sede.tipo] ?? sede.tipo}
                        </Badge>
                        {sede.principale && (
                          <Badge className="bg-amber-100 text-amber-700 text-xs hover:bg-amber-100 gap-1">
                            <Star className="h-3 w-3" /> Principale
                          </Badge>
                        )}
                        {!sede.attiva && (
                          <Badge variant="secondary" className="text-xs">Disattiva</Badge>
                        )}
                      </div>
                      {indirizzo && (
                        <p className="text-xs text-muted-foreground mt-1">
                          <MapPin className="inline h-3 w-3 mr-1" />
                          {indirizzo}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {sede.responsabile_sede && (
                          <span className="inline-flex items-center gap-1">
                            <UserRound className="h-3 w-3" /> {sede.responsabile_sede}
                          </span>
                        )}
                        {sede.telefono && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {sede.telefono}
                          </span>
                        )}
                        {sede.email && (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="h-3 w-3" /> {sede.email}
                          </span>
                        )}
                        {sede.orari_apertura && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {sede.orari_apertura}
                          </span>
                        )}
                      </div>
                      {sede.note_interne && (
                        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{sede.note_interne}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 justify-end">
                    {!sede.principale && sede.attiva && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                        aria-label={`Imposta ${sede.nome} come sede principale`}
                        onClick={() => setPrincipaleMutation.mutate(sede.id)}
                        disabled={!canEditSedi || setPrincipaleMutation.isPending}
                      >
                        <Star className="h-3 w-3 mr-1" />
                        Principale
                      </Button>
                    )}
                    <Switch
                      checked={Boolean(sede.attiva)}
                      aria-label={`${sede.attiva ? 'Disattiva' : 'Attiva'} sede ${sede.nome}`}
                      onCheckedChange={(v) => toggleMutation.mutate({ id: sede.id, attiva: v })}
                      disabled={!canEditSedi || toggleMutation.isPending}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Modifica sede ${sede.nome}`}
                      onClick={() => openEdit(sede)}
                      disabled={!canEditSedi}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      aria-label={`Elimina sede ${sede.nome}`}
                      onClick={() => setDeleteId(sede.id)}
                      disabled={!canEditSedi}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Dialog crea/modifica */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) { setDialogOpen(false); setEditSede(null) } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editSede ? 'Modifica Sede' : 'Nuova Sede'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">
            {/* Nome */}
            <div className="space-y-1.5">
              <Label>Nome sede *</Label>
              <Input placeholder="es. Showroom Milano Nord" {...form.register('nome')} />
              {form.formState.errors.nome && (
                <p className="text-xs text-destructive">{form.formState.errors.nome.message}</p>
              )}
            </div>

            {/* Tipo */}
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select
                value={form.watch('tipo')}
                onValueChange={(v) => form.setValue('tipo', v as SedeFormData['tipo'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Indirizzo */}
            <div className="space-y-1.5">
              <Label>Indirizzo</Label>
              <Input placeholder="Via Roma 1" {...form.register('indirizzo')} />
            </div>

            {/* Città + CAP + Provincia */}
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-3 sm:col-span-1 space-y-1.5">
                <Label>Città</Label>
                <Input placeholder="Milano" {...form.register('citta')} />
              </div>
              <div className="col-span-3 sm:col-span-1 space-y-1.5">
                <Label>CAP</Label>
                <Input placeholder="20100" maxLength={5} {...form.register('cap')} />
                {form.formState.errors.cap && (
                  <p className="text-xs text-destructive">{form.formState.errors.cap.message}</p>
                )}
              </div>
              <div className="col-span-3 sm:col-span-1 space-y-1.5">
                <Label>Prov.</Label>
                <Input placeholder="MI" maxLength={2} {...form.register('provincia')} />
                {form.formState.errors.provincia && (
                  <p className="text-xs text-destructive">{form.formState.errors.provincia.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Regione</Label>
                <Input placeholder="Lombardia" {...form.register('regione')} />
              </div>
              <div className="space-y-1.5">
                <Label>Nazione</Label>
                <Input placeholder="Italia" {...form.register('nazione')} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Telefono sede</Label>
                <Input placeholder="+39 02 123456" {...form.register('telefono')} />
                {form.formState.errors.telefono && (
                  <p className="text-xs text-destructive">{form.formState.errors.telefono.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Email sede</Label>
                <Input placeholder="sede@azienda.it" {...form.register('email')} />
                {form.formState.errors.email && (
                  <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Responsabile sede</Label>
                <Input placeholder="Nome referente" {...form.register('responsabile_sede')} />
              </div>
              <div className="space-y-1.5">
                <Label>Orari apertura</Label>
                <Input placeholder="Lun-Ven 09:00-18:00" {...form.register('orari_apertura')} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Latitudine</Label>
                <Input placeholder="45.4642" inputMode="decimal" {...form.register('lat')} />
                {form.formState.errors.lat && (
                  <p className="text-xs text-destructive">{form.formState.errors.lat.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Longitudine</Label>
                <Input placeholder="9.1900" inputMode="decimal" {...form.register('lng')} />
                {form.formState.errors.lng && (
                  <p className="text-xs text-destructive">{form.formState.errors.lng.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Note interne</Label>
              <Textarea
                placeholder="Informazioni operative, riferimenti interni, note per appuntamenti o logistica..."
                {...form.register('note_interne')}
              />
            </div>

            {/* Colore */}
            <div className="space-y-1.5">
              <Label>Colore badge</Label>
              <div className="flex items-center gap-2 flex-wrap">
                {COLORI_PRESET.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${
                      form.watch('colore') === c ? 'border-gray-900 scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={() => form.setValue('colore', c)}
                  />
                ))}
                <input
                  type="color"
                  value={form.watch('colore')}
                  onChange={(e) => form.setValue('colore', e.target.value)}
                  className="w-7 h-7 rounded cursor-pointer border"
                  title="Scegli colore personalizzato"
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Annulla
              </Button>
              <Button
                type="submit"
                className=""
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? 'Salvataggio…' : editSede ? 'Salva modifiche' : 'Crea sede'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirm elimina */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questa sede?</AlertDialogTitle>
            <AlertDialogDescription>
              I preventivi e i record collegati a questa sede perderanno il riferimento.
              L'operazione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={!canEditSedi || deleteMutation.isPending}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
