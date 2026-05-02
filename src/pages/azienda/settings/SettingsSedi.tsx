import { useState } from 'react'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus, Pencil, MapPin, Building2, Trash2, Star } from 'lucide-react'

import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useSediList } from '@/hooks/useSediAnalytics'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  tipo:      z.enum(['showroom', 'magazzino', 'cantiere', 'ufficio', 'altro']),
  indirizzo: z.preprocess(emptyToUndefined, z.string().optional()),
  citta:     z.preprocess(emptyToUndefined, z.string().optional()),
  cap:       z.preprocess(emptyToUndefined, z.string().regex(/^\d{5}$/, 'CAP non valido').optional()),
  provincia: z.preprocess(emptyToUndefined, z.string().length(2, 'Inserisci 2 lettere').optional()),
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
  colore: string | null
  attiva: boolean | null
  principale: boolean | null
}

const TIPO_LABELS: Record<string, string> = {
  showroom: 'Showroom',
  magazzino: 'Magazzino',
  cantiere: 'Cantiere',
  ufficio: 'Ufficio',
  altro: 'Altro',
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
  const company_id = effectiveCompany?.id
  const qc = useQueryClient()
  const { data: sedi = [], isLoading } = useSediList()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editSede, setEditSede] = useState<Sede | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const form = useForm<SedeFormData>({
    resolver: zodResolver(sedeSchema),
    defaultValues: { nome: '', tipo: 'showroom', colore: '#1E3A5F' },
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
    setEditSede(null)
    form.reset({ nome: '', tipo: 'showroom', colore: '#1E3A5F' })
    setDialogOpen(true)
  }

  function openEdit(sede: Sede) {
    setEditSede(sede)
    form.reset({
      nome:      sede.nome,
      tipo:      sede.tipo,
      indirizzo: sede.indirizzo ?? '',
      citta:     sede.citta ?? '',
      cap:       sede.cap ?? '',
      provincia: sede.provincia ?? '',
      colore:    sede.colore ?? '#1E3A5F',
    })
    setDialogOpen(true)
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header pattern h-10 w-10 bg-primary/10 — bug fix: rimosso colore
          hardcoded #1E3A5F che non rispettava il white-label per i clienti
          con brand personalizzato. */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <MapPin className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">Sedi Aziendali</h1>
            <p className="text-sm text-muted-foreground">
              Showroom, cantieri, magazzini. Usa le sedi per analytics disaggregati su
              dashboard, ordini e fatturazione. {sedi.length} {sedi.length === 1 ? "sede" : "sedi"} configurate.
            </p>
          </div>
        </div>
        <Button onClick={openCreate} size="sm" className="shrink-0">
          <Plus className="h-4 w-4 mr-1.5" />
          Nuova Sede
        </Button>
      </div>

      {/* Lista sedi */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse bg-muted rounded-lg" />
          ))}
        </div>
      ) : sedi.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <MapPin className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">
              Nessuna sede configurata
            </p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Aggiungi le sedi della tua azienda (showroom, cantieri, magazzini) per
              visualizzare analytics disaggregati in ogni dashboard.
            </p>
            <Button onClick={openCreate} size="sm" className="mt-2 gap-2 ">
              <Plus className="h-4 w-4" />
              Aggiungi la prima sede
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sedi.map((sede) => (
            <Card key={sede.id} className={`transition-opacity ${!sede.attiva ? 'opacity-60' : ''}`}>
              <CardContent className="flex items-center gap-4 py-4">
                {/* Colore badge */}
                <span
                  className="w-4 h-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: sede.colore ?? '#1E3A5F' }}
                />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold truncate">{sede.nome}</span>
                    <Badge variant="outline" className="capitalize text-xs">
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
                  {sede.citta && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <Building2 className="inline h-3 w-3 mr-1" />
                      {sede.citta}
                    </p>
                  )}
                </div>

                {/* Azioni */}
                <div className="flex items-center gap-2 flex-shrink-0">
                    {!sede.principale && sede.attiva && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                      aria-label={`Imposta ${sede.nome} come sede principale`}
                      onClick={() => setPrincipaleMutation.mutate(sede.id)}
                    >
                      <Star className="h-3 w-3 mr-1" />
                      Principale
                    </Button>
                  )}
                  <Switch
                    checked={Boolean(sede.attiva)}
                    aria-label={`${sede.attiva ? 'Disattiva' : 'Attiva'} sede ${sede.nome}`}
                    onCheckedChange={(v) => toggleMutation.mutate({ id: sede.id, attiva: v })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={`Modifica sede ${sede.nome}`}
                    onClick={() => openEdit(sede)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    aria-label={`Elimina sede ${sede.nome}`}
                    onClick={() => setDeleteId(sede.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog crea/modifica */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) { setDialogOpen(false); setEditSede(null) } }}>
        <DialogContent className="max-w-md">
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
              <div className="col-span-1 space-y-1.5">
                <Label>Città</Label>
                <Input placeholder="Milano" {...form.register('citta')} />
              </div>
              <div className="col-span-1 space-y-1.5">
                <Label>CAP</Label>
                <Input placeholder="20100" maxLength={5} {...form.register('cap')} />
                {form.formState.errors.cap && (
                  <p className="text-xs text-destructive">{form.formState.errors.cap.message}</p>
                )}
              </div>
              <div className="col-span-1 space-y-1.5">
                <Label>Prov.</Label>
                <Input placeholder="MI" maxLength={2} {...form.register('provincia')} />
              </div>
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
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
