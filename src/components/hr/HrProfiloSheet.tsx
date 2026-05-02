import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { useUpdateHrProfilo } from "@/hooks/useOrganigramma";
import { useCreateHrProfilo } from "@/hooks/useCreateHrProfilo";
import { useHrSedi } from "@/hooks/useHrSedi";
import type { HrProfilo } from "@/types/hr";
import { Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profilo: HrProfilo | null;
  allProfili: HrProfilo[];
}

const TIPO_CONTRATTO_OPTIONS = [
  { value: "indeterminato", label: "Indeterminato" },
  { value: "determinato", label: "Determinato" },
  { value: "apprendistato", label: "Apprendistato" },
  { value: "tirocinio", label: "Tirocinio" },
  { value: "consulenza", label: "Consulenza" },
  { value: "part_time", label: "Part Time" },
  { value: "interinale", label: "Interinale" },
  { value: "collaborazione", label: "Collaborazione" },
  { value: "partita_iva", label: "Partita IVA" },
  { value: "stagionale", label: "Stagionale" },
];

const ORARIO_TIPO_OPTIONS = [
  { value: "standard", label: "Standard" },
  { value: "fisso", label: "Fisso" },
  { value: "flessibile", label: "Flessibile" },
  { value: "turni", label: "Turni" },
  { value: "turnista", label: "Turnista" },
  { value: "part_time", label: "Part Time" },
];

const NUMERIC_DEFAULTS: Record<string, number> = {
  ore_settimanali: 40,
  ore_giornaliere: 8,
  pausa_pranzo_minuti: 60,
  ferie_anno_giorni: 26,
  ferie_residue: 26,
  permessi_anno_ore: 32,
  permessi_residui_ore: 32,
  rol_anno_ore: 0,
  rol_residuo_ore: 0,
  posizione_organigramma: 0,
};

export function HrProfiloSheet({ open, onOpenChange, profilo, allProfili }: Props) {
  const updateMutation = useUpdateHrProfilo();
  const createMutation = useCreateHrProfilo();
  const { data: sedi = [] } = useHrSedi();
  const isEditing = !!profilo;

  const { register, handleSubmit, reset, setValue, watch } = useForm<Partial<HrProfilo>>({
    defaultValues: profilo || {},
  });

  const descendantIds = useMemo(() => {
    if (!profilo?.id) return new Set<string>();
    const descendants = new Set<string>();
    let changed = true;

    while (changed) {
      changed = false;
      for (const candidate of allProfili) {
        const parentId = candidate.responsabile_id;
        if (parentId && (parentId === profilo.id || descendants.has(parentId)) && !descendants.has(candidate.id)) {
          descendants.add(candidate.id);
          changed = true;
        }
      }
    }

    return descendants;
  }, [allProfili, profilo?.id]);

  useEffect(() => {
    if (profilo) {
      reset(profilo);
    } else {
      reset({
        nome: "",
        cognome: "",
        tipo_contratto: "indeterminato" as any,
        orario_tipo: "standard" as any,
        ore_settimanali: 40,
        ore_giornaliere: 8,
        pausa_pranzo_minuti: 60,
        ferie_anno_giorni: 26,
        permessi_anno_ore: 32,
        ferie_residue: 26,
        permessi_residui_ore: 32,
        ccnl: "Edilizia",
        colore_avatar: "#0EA5E9",
        attivo: true,
      });
    }
  }, [profilo, reset]);

  const onSubmit = async (data: Partial<HrProfilo>) => {
    // Remove non-DB fields that come from OrgTreeNode or joined data
    const {
      children, depth, sede, responsabile,
      employee_first_name, employee_last_name, employee_email, employee_phone,
      ...sanitized
    } = data as any;

    // Convert empty strings to null for nullable fields (prevents FK/date/UUID errors)
    const NULLABLE_FIELDS = [
      "responsabile_id", "sede_id", "data_nascita", "data_assunzione", "data_cessazione",
      "codice_fiscale", "email", "telefono", "telefono_privato", "email_privata",
      "indirizzo", "iban", "foto_url", "matricola", "livello_ccnl", "note", "note_interne",
      "badge_id", "pin_timbratura", "luogo_nascita", "citta_residenza", "cap_residenza",
      "contatto_emergenza_nome", "contatto_emergenza_telefono", "stato_civile",
      "orario_inizio", "orario_fine", "mansione", "reparto", "sesso",
    ];
    for (const field of NULLABLE_FIELDS) {
      if (field in sanitized && sanitized[field] === "") {
        sanitized[field] = null;
      }
    }

    sanitized.nome = sanitized.nome?.trim();
    sanitized.cognome = sanitized.cognome?.trim();

    if (!sanitized.nome || !sanitized.cognome) {
      toast.error("Nome e cognome sono obbligatori");
      return;
    }

    if (profilo?.id && sanitized.responsabile_id) {
      if (sanitized.responsabile_id === profilo.id) {
        toast.error("Un profilo non può essere responsabile di sé stesso");
        return;
      }
      if (descendantIds.has(sanitized.responsabile_id)) {
        toast.error("Non puoi assegnare come responsabile un collaboratore già sotto questo profilo");
        return;
      }
    }

    if (sanitized.sede_id && !sedi.some((s) => s.id === sanitized.sede_id)) {
      toast.error("La sede selezionata non è valida per questa azienda");
      return;
    }

    for (const [field, defaultValue] of Object.entries(NUMERIC_DEFAULTS)) {
      const value = sanitized[field];
      if (value === "" || value == null || !Number.isFinite(Number(value)) || Number(value) < 0) {
        sanitized[field] = defaultValue;
      } else {
        sanitized[field] = Number(value);
      }
    }

    if (sanitized.data_cessazione && sanitized.attivo !== false) {
      sanitized.attivo = false;
    }

    if (isEditing && profilo) {
      await updateMutation.mutateAsync({ id: profilo.id, ...sanitized });
    } else {
      await createMutation.mutateAsync(sanitized);
    }
    onOpenChange(false);
  };

  const isPending = updateMutation.isPending || createMutation.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg p-0">
        <SheetHeader className="px-6 pt-6 pb-2">
          <SheetTitle>{isEditing ? "Modifica Profilo HR" : "Nuovo Profilo HR"}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col h-[calc(100%-80px)]">
          <ScrollArea className="flex-1 px-6">
            <div className="space-y-6 pb-6">
              {/* Dati Personali */}
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">DATI PERSONALI</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Nome *</Label>
                    <Input {...register("nome")} required />
                  </div>
                  <div>
                    <Label>Cognome *</Label>
                    <Input {...register("cognome")} required />
                  </div>
                  <div>
                    <Label>Codice Fiscale</Label>
                    <Input {...register("codice_fiscale")} />
                  </div>
                  <div>
                    <Label>Data Nascita</Label>
                    <Input type="date" {...register("data_nascita")} />
                  </div>
                  <div>
                    <Label>Luogo Nascita</Label>
                    <Input {...register("luogo_nascita")} />
                  </div>
                  <div>
                    <Label>Nazionalità</Label>
                    <Input {...register("nazionalita")} />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input type="email" {...register("email")} />
                  </div>
                  <div>
                    <Label>Telefono</Label>
                    <Input {...register("telefono")} />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Organigramma */}
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">ORGANIGRAMMA</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Mansione</Label>
                    <Input {...register("mansione")} />
                  </div>
                  <div>
                    <Label>Reparto</Label>
                    <Input {...register("reparto")} />
                  </div>
                  <div className="col-span-2">
                    <Label>Responsabile</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      {...register("responsabile_id")}
                    >
                      <option value="">Nessuno (root)</option>
                      {allProfili
                        .filter((p) => p.id !== profilo?.id && !descendantIds.has(p.id))
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nome} {p.cognome} {p.mansione ? `(${p.mansione})` : ""}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <Label>Sede HR</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      {...register("sede_id")}
                    >
                      <option value="">Nessuna sede</option>
                      {sedi.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nome}{!s.attiva ? " (inattiva)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Colore Avatar</Label>
                    <Input type="color" {...register("colore_avatar")} className="h-10 p-1" />
                  </div>
                  <div className="col-span-2 flex items-center justify-between rounded-md border px-3 py-2">
                    <div>
                      <Label>Profilo attivo</Label>
                      <p className="text-xs text-muted-foreground">I profili inattivi restano nello storico ma non compaiono nei flussi operativi.</p>
                    </div>
                    <Switch checked={watch("attivo") ?? true} onCheckedChange={(checked) => setValue("attivo", checked)} />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Contratto */}
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">CONTRATTO</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Tipo Contratto</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      {...register("tipo_contratto")}
                    >
                      {TIPO_CONTRATTO_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>CCNL</Label>
                    <Input {...register("ccnl")} />
                  </div>
                  <div>
                    <Label>Livello</Label>
                    <Input {...register("livello_ccnl")} />
                  </div>
                  <div>
                    <Label>Matricola</Label>
                    <Input {...register("matricola")} />
                  </div>
                  <div>
                    <Label>Data Assunzione</Label>
                    <Input type="date" {...register("data_assunzione")} />
                  </div>
                  <div>
                    <Label>Data Cessazione</Label>
                    <Input type="date" {...register("data_cessazione")} />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Orario */}
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">ORARIO DI LAVORO</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Tipo Orario</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      {...register("orario_tipo")}
                    >
                      {ORARIO_TIPO_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Ore Settimanali</Label>
                    <Input type="number" step="0.5" {...register("ore_settimanali", { valueAsNumber: true })} />
                  </div>
                  <div>
                    <Label>Ore Giornaliere</Label>
                    <Input type="number" step="0.5" {...register("ore_giornaliere", { valueAsNumber: true })} />
                  </div>
                  <div>
                    <Label>Pausa Pranzo (min)</Label>
                    <Input type="number" {...register("pausa_pranzo_minuti", { valueAsNumber: true })} />
                  </div>
                  <div>
                    <Label>Orario Inizio</Label>
                    <Input type="time" {...register("orario_inizio")} />
                  </div>
                  <div>
                    <Label>Orario Fine</Label>
                    <Input type="time" {...register("orario_fine")} />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Ferie */}
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">FERIE & PERMESSI</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Ferie Annuali (gg)</Label>
                    <Input type="number" step="0.5" {...register("ferie_anno_giorni", { valueAsNumber: true })} />
                  </div>
                  <div>
                    <Label>Ferie Residue (gg)</Label>
                    <Input type="number" step="0.5" {...register("ferie_residue", { valueAsNumber: true })} />
                  </div>
                  <div>
                    <Label>Permessi Annuali (ore)</Label>
                    <Input type="number" step="0.5" {...register("permessi_anno_ore", { valueAsNumber: true })} />
                  </div>
                  <div>
                    <Label>Permessi Residui (ore)</Label>
                    <Input type="number" step="0.5" {...register("permessi_residui_ore", { valueAsNumber: true })} />
                  </div>
                  <div>
                    <Label>ROL Annuali (ore)</Label>
                    <Input type="number" step="0.5" {...register("rol_anno_ore", { valueAsNumber: true })} />
                  </div>
                  <div>
                    <Label>ROL Residui (ore)</Label>
                    <Input type="number" step="0.5" {...register("rol_residuo_ore", { valueAsNumber: true })} />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Contatto Emergenza */}
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">CONTATTO EMERGENZA</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Nome</Label>
                    <Input {...register("contatto_emergenza_nome")} />
                  </div>
                  <div>
                    <Label>Telefono</Label>
                    <Input {...register("contatto_emergenza_telefono")} />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Badge */}
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">BADGE & ACCESSI</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Badge ID</Label>
                    <Input {...register("badge_id")} />
                  </div>
                  <div>
                    <Label>PIN Timbratura</Label>
                    <Input {...register("pin_timbratura")} type="password" />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Note */}
              <div>
                <Label>Note Interne</Label>
                <Textarea {...register("note_interne")} rows={3} />
              </div>
            </div>
          </ScrollArea>

          <div className="border-t px-6 py-4 flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {isEditing ? "Salva" : "Crea Profilo"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
