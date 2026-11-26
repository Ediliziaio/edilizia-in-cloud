import { AccessoAppInScheda } from "@/components/manodopera/AccessoAppOperaio";
import { UniformSelect } from "@/components/ui/uniform-select";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CampoIndirizzo } from "@/components/shared/CampoIndirizzo";
import { riempiCampi } from "@/lib/indirizzi/ricercaIndirizzi";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { CostoPersonaHr } from "@/components/hr/CostoPersonaHr";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TesserinoQrUfficio } from "@/components/hr/TesserinoQrUfficio";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { accessoPiattaforma, ETICHETTA_ACCESSO, spiegazioneAccesso } from "@/lib/hr/accessoPiattaforma";
import { useUpdateHrProfilo } from "@/hooks/useOrganigramma";
import { useCreateHrProfilo } from "@/hooks/useCreateHrProfilo";
import { useHrMansioni } from "@/hooks/useHrMansioni";
import { useHrSedi } from "@/hooks/useHrSedi";
import type { HrProfilo } from "@/types/hr";
import { HrDocumentiSection } from "@/components/hr/HrDocumentiSection";
import { HrAssenzeSection } from "@/components/hr/HrAssenzeSection";
import { HrRuoloObiettiviTab } from "@/components/hr/HrRuoloObiettiviTab";
import { MezziInCaricoProfilo } from "@/components/mezzi/MezziInCaricoProfilo";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Save, Loader2, Info, User, Target, FileText, CalendarDays, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { normalizeHrNumbers } from "@/lib/personale/profileNumbers";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { LinguaAppDipendente } from "@/components/hr/LinguaAppDipendente";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profilo: HrProfilo | null;
  allProfili: HrProfilo[];
  onApriProfilo?: (persona: HrProfilo) => void;
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

export function HrProfiloSheet(props: Props) {
  const t = useT();
  const permissions = usePermissions();
  const canEdit = !permissions.isLoading && !permissions.solaLettura && (permissions.isAdmin || permissions.canViewPersone);
  if (canEdit) return <HrProfiloEditor {...props} />;
  return <Dialog open={props.open && !!props.profilo} onOpenChange={props.onOpenChange}>
    <DialogContent aria-describedby={undefined} className="top-1/2 w-[calc(100%-1.5rem)] rounded-xl sm:max-w-lg"><DialogHeader className="pr-8"><DialogTitle>{props.profilo?.nome} {props.profilo?.cognome}</DialogTitle></DialogHeader>
      {props.profilo?.lavora_in_cantiere && <AccessoAppInScheda profiloId={props.profilo.id} />}
      <p className="mt-2 text-sm text-muted-foreground">{t("Profilo organizzativo · sola lettura")}</p>
      <dl className="mt-6 space-y-4"><div><dt>{t("Ruolo")}</dt><dd>{props.profilo?.mansione || t("Da definire")}</dd></div>
        <div><dt>{t("Reparto")}</dt><dd>{props.profilo?.reparto || t("Da definire")}</dd></div></dl>
    </DialogContent>
  </Dialog>;
}

function HrProfiloEditor({ open, onOpenChange, profilo, allProfili, onApriProfilo }: Props) {
  const t = useT();
  const updateMutation = useUpdateHrProfilo();
  const createMutation = useCreateHrProfilo();
  const { data: sedi = [] } = useHrSedi();
  const isEditing = !!profilo;
  const [tab, setTab] = useState("anagrafica");

  const companyIdAttiva = useEffectiveCompanyId();
  const catalogo = useHrMansioni(open ? companyIdAttiva : null);
  const { data: utentiAzienda } = useCompanyStaffUsers(companyIdAttiva);
  const accesso = profilo ? accessoPiattaforma(profilo, utentiAzienda) : null;

  const { register, handleSubmit, reset, setValue, watch } = useForm<Partial<HrProfilo>>({
    defaultValues: profilo || {},
  });

  const mansione = watch("mansione") ?? "";
  const mansioneId = watch("mansione_id");
  const vociCatalogo = (catalogo.data ?? []).filter(m => m.attivo || m.id === mansioneId);
  const nomiCatalogo = new Set(vociCatalogo.map(m => m.nome.toLocaleLowerCase("it")));
  const storiche = Array.from(new Set(["Operaio", ...allProfili.map(p => p.mansione), mansione]))
    .filter((nome): nome is string => !!nome && !nomiCatalogo.has(nome.toLocaleLowerCase("it")))
    .sort((a, b) => a.localeCompare(b, "it"));
  const valoreMansione = mansioneId || vociCatalogo.find(m => m.nome === mansione)?.id || (mansione ? `testo:${mansione}` : "");

  const normalizza = (v?: string | null) => (v ?? "").trim().toLocaleLowerCase("it");
  const [nome, cognome, email, cf] = watch(["nome", "cognome", "email", "codice_fiscale"]).map(normalizza);
  const corrispondenze = isEditing ? [] : allProfili.filter(p =>
    (cf && normalizza(p.codice_fiscale) === cf) || (email && normalizza(p.email) === email) ||
    (nome && cognome && normalizza(p.nome) === nome && normalizza(p.cognome) === cognome));
  const stessoCf = corrispondenze.some(p => cf && normalizza(p.codice_fiscale) === cf);

  // Torna sempre alla scheda anagrafica quando si apre un profilo diverso.
  useEffect(() => { if (open) setTab("anagrafica"); }, [open, profilo?.id]);

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
    if (stessoCf) { toast.error(t("Esiste già un profilo con questo codice fiscale.")); return; }
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
      toast.error(t("Nome e cognome sono obbligatori"));
      return;
    }

    if (profilo?.id && sanitized.responsabile_id) {
      if (sanitized.responsabile_id === profilo.id) {
        toast.error(t("Un profilo non può essere responsabile di sé stesso"));
        return;
      }
      if (descendantIds.has(sanitized.responsabile_id)) {
        toast.error(t("Non puoi assegnare come responsabile un collaboratore già sotto questo profilo"));
        return;
      }
    }

    if (sanitized.sede_id && !sedi.some((s) => s.id === sanitized.sede_id)) {
      toast.error(t("La sede selezionata non è valida per questa azienda"));
      return;
    }

    try { Object.assign(sanitized, normalizeHrNumbers(sanitized)); }
    catch (error) { toast.error(error instanceof Error ? error.message : t("Controlla orario e saldi")); return; }

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="top-1/2 flex h-[min(88dvh,52rem)] w-[calc(100%-1.5rem)] max-w-4xl flex-col gap-0 overflow-hidden rounded-xl p-0 max-sm:top-0 max-sm:translate-y-0 max-sm:h-[100dvh] max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:rounded-none max-sm:border-0 max-sm:pt-[env(safe-area-inset-top)]">
        <DialogHeader className="shrink-0 border-b border-slate-100 px-6 pb-4 pt-6 max-sm:px-4 max-sm:pb-3 max-sm:pt-4">
          {isEditing && profilo ? (
            <div className="flex items-center gap-3.5 pr-8">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-base font-bold uppercase text-white shadow-sm ring-2 ring-white"
                style={{ backgroundColor: profilo.colore_avatar || "#0EA5E9" }}
              >
                {`${profilo.nome?.[0] ?? ""}${profilo.cognome?.[0] ?? ""}`}
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate text-left text-lg leading-tight">
                  {profilo.nome} {profilo.cognome}
                </DialogTitle>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  {profilo.mansione && (
                    <span className="inline-flex items-center gap-1 font-medium text-slate-600">
                      <Briefcase className="h-3 w-3 text-orange-500" />
                      {profilo.mansione}
                    </span>
                  )}
                  {profilo.reparto && <span className="text-slate-400">· {profilo.reparto}</span>}
                  <Badge
                    variant="outline"
                    className={cn(
                      "h-5 px-1.5 py-0 text-[11px] font-medium",
                      profilo.attivo
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-slate-50 text-slate-500",
                    )}
                  >
                    {profilo.attivo ? t("Attivo") : t("Cessato")}
                  </Badge>
                </div>
                {/* Una scheda del personale non è un accesso: qui si legge se
                    questa persona entra davvero nel gestionale. */}
                {profilo.lavora_in_cantiere && <AccessoAppInScheda profiloId={profilo.id} />}
                {!profilo.lavora_in_cantiere && accesso && (
                  <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
                    <span
                      className={cn(
                        "font-medium",
                        accesso.stato === "entra" ? "text-emerald-700" : "text-slate-600",
                      )}
                    >
                      {ETICHETTA_ACCESSO[accesso.stato]}
                    </span>{" "}
                    · {spiegazioneAccesso(accesso)}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <DialogTitle className="text-left">{t("Nuovo Profilo HR")}</DialogTitle>
          )}
        </DialogHeader>

        {/* Mobile: due schede su quattro (anagrafica e documenti); ruolo e
            assenze restano al computer. Su un profilo nuovo i documenti non si
            possono ancora caricare: niente schede, solo l'anagrafica. */}
        <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className={cn("mx-6 mt-4 grid h-auto w-auto grid-cols-4 gap-1 rounded-xl bg-slate-100/80 p-1 max-sm:mx-4 max-sm:mt-3 max-sm:grid-cols-2", !isEditing && "max-sm:hidden")}>
            {[
              { value: "anagrafica", label: t("Anagrafica"), icon: User, disabled: false },
              { value: "ruolo", label: t("Ruolo"), icon: Target, disabled: !isEditing },
              { value: "documenti", label: t("Documenti"), icon: FileText, disabled: !isEditing },
              { value: "assenze", label: t("Assenze"), icon: CalendarDays, disabled: !isEditing },
            ].map(({ value, label, icon: Icon, disabled }) => (
              <TabsTrigger
                key={value}
                value={value}
                disabled={disabled}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg py-2 text-xs font-medium text-slate-500 transition data-[state=active]:bg-white data-[state=active]:text-orange-700 data-[state=active]:shadow-sm sm:flex-row sm:gap-1.5",
                  "tap-compact max-sm:h-8 max-sm:py-0",
                  (value === "ruolo" || value === "assenze") && "max-sm:hidden",
                )}
              >
                <Icon className="h-4 w-4 max-sm:hidden" />
                <span>{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── ANAGRAFICA ──────────────────────────────────────────────── */}
          <TabsContent value="anagrafica" className="flex-1 min-h-0 m-0">
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col h-full">
              {/* Mobile: nome e cognome, email e telefono, mansione e reparto,
                  contratto e assunzione, profilo attivo. Gli altri campi restano
                  nel modulo (e si salvano com'erano) ma si modificano al computer. */}
              <ScrollArea className="min-h-0 flex-1 px-6 max-sm:px-4">
                <div className="space-y-6 py-4 max-sm:flex max-sm:flex-col max-sm:space-y-3 max-sm:py-3">
                  {corrispondenze.length > 0 && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                    <p className="font-medium">{stessoCf ? t("Codice fiscale già presente") : t("Verifica se la persona è già in azienda")}</p>
                    {corrispondenze.map(p => <div key={p.id} className="flex items-center justify-between gap-2">
                      <span>{p.nome} {p.cognome} · {p.mansione || t("Mansione da definire")}{!p.attivo && ` ${t("· Inattivo")}`}</span>
                      {onApriProfilo && <Button type="button" size="sm" variant="link" onClick={() => onApriProfilo(p)}>{t("Apri profilo")}</Button>}
                    </div>)}
                  </div>}
                  {/* Dati Personali */}
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-3 max-sm:hidden">{t("DATI PERSONALI")}</h4>
                    <div className="grid grid-cols-2 gap-3 max-sm:gap-2">
                      <div><Label>{t("Nome *")}</Label><Input {...register("nome")} required /></div>
                      <div><Label>{t("Cognome *")}</Label><Input {...register("cognome")} required /></div>
                      <div className="max-sm:hidden"><Label>{t("Codice Fiscale")}</Label><Input {...register("codice_fiscale")} /></div>
                      <div className="max-sm:hidden">
                        <Label>{t("Sesso")}</Label>
                        <UniformSelect className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" {...register("sesso")}>
                          <option value="">—</option><option value="M">M</option><option value="F">F</option><option value="Altro">{t("Altro")}</option>
                        </UniformSelect>
                      </div>
                      <div className="max-sm:hidden"><Label>{t("Data Nascita")}</Label><Input type="date" {...register("data_nascita")} /></div>
                      <div className="max-sm:hidden"><Label>{t("Luogo Nascita")}</Label><Input {...register("luogo_nascita")} /></div>
                      <div className="max-sm:hidden"><Label>{t("Nazionalità")}</Label><Input {...register("nazionalita")} /></div>
                      <div className="max-sm:hidden"><Label>{t("Stato civile")}</Label><Input {...register("stato_civile")} /></div>
                    </div>
                  </div>

                  <Separator className="max-sm:hidden" />

                  {/* Residenza & Recapiti */}
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-3 max-sm:hidden">{t("RESIDENZA & RECAPITI")}</h4>
                    <div className="grid grid-cols-2 gap-3 max-sm:gap-2">
                      <div className="col-span-2 max-sm:hidden">
                        <Label htmlFor="hr-indirizzo">{t("Indirizzo")}</Label>
                        <CampoIndirizzo
                          id="hr-indirizzo"
                          value={watch("indirizzo") ?? ""}
                          onChange={(v) => setValue("indirizzo", v, { shouldDirty: true })}
                          onScegli={(a) => riempiCampi(a, (campo, valore) => {
                            if (campo === "via") setValue("indirizzo", valore, { shouldDirty: true });
                            else if (campo === "citta") setValue("citta_residenza", valore, { shouldDirty: true });
                            else if (campo === "cap") setValue("cap_residenza", valore, { shouldDirty: true });
                          })}
                        />
                      </div>
                      <div className="max-sm:hidden"><Label>{t("Città")}</Label><Input {...register("citta_residenza")} /></div>
                      <div className="max-sm:hidden"><Label>CAP</Label><Input {...register("cap_residenza")} /></div>
                      <div><Label>Email</Label><Input type="email" {...register("email")} /></div>
                      <div><Label>{t("Telefono")}</Label><Input {...register("telefono")} /></div>
                      <div className="max-sm:hidden"><Label>{t("Email privata")}</Label><Input type="email" {...register("email_privata")} /></div>
                      <div className="max-sm:hidden"><Label>{t("Telefono privato")}</Label><Input {...register("telefono_privato")} /></div>
                    </div>
                  </div>

                  <Separator className="max-sm:hidden" />

                  {/* Organigramma — mobile: in fondo, così «Profilo attivo» chiude il modulo. */}
                  <div className="max-sm:order-1">
                    <h4 className="text-sm font-semibold text-muted-foreground mb-3 max-sm:hidden">{t("ORGANIGRAMMA")}</h4>
                    <div className="grid grid-cols-2 gap-3 max-sm:gap-2">
                      <div><Label htmlFor="hr-mansione">{t("Mansione")}</Label>
                        <UniformSelect id="hr-mansione" className="w-full" value={valoreMansione} onChange={e => {
                          const value = e.target.value;
                          const voce = vociCatalogo.find(m => m.id === value);
                          setValue("mansione_id", voce?.id ?? null, { shouldDirty: true });
                          setValue("mansione", voce?.nome ?? (value ? value.slice(6) : null), { shouldDirty: true });
                        }}>
                          <option value="">{t("Nessuna mansione")}</option>
                          {mansioneId && !vociCatalogo.some(m => m.id === mansioneId) && <option value={mansioneId}>{mansione || t("Mansione attuale")}</option>}
                          {vociCatalogo.map(m => <option key={m.id} value={m.id}>{m.nome}{m.area ? ` · ${m.area}` : ""}</option>)}
                          {storiche.map(nome => <option key={nome} value={`testo:${nome}`}>{nome}</option>)}
                        </UniformSelect>
                        {catalogo.isError && <button type="button" className="text-xs text-primary" onClick={() => catalogo.refetch()}>{t("Ricarica catalogo mansioni")}</button>}
                      </div>
                      <div><Label>{t("Reparto")}</Label><Input {...register("reparto")} /></div>
                      <div className="col-span-2 max-sm:hidden">
                        <Label>{t("Responsabile")}</Label>
                        <UniformSelect className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" {...register("responsabile_id")}>
                          <option value="">{t("Nessuno (root)")}</option>
                          {allProfili.filter((p) => p.id !== profilo?.id && !descendantIds.has(p.id)).map((p) => (
                            <option key={p.id} value={p.id}>{p.nome} {p.cognome} {p.mansione ? `(${p.mansione})` : ""}</option>
                          ))}
                        </UniformSelect>
                      </div>
                      <div className="max-sm:hidden">
                        <Label>{t("Sede HR")}</Label>
                        <UniformSelect className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" {...register("sede_id")}>
                          <option value="">{t("Nessuna sede")}</option>
                          {sedi.map((s) => (<option key={s.id} value={s.id}>{s.nome}{!s.attiva ? ` ${t("(inattiva)")}` : ""}</option>))}
                        </UniformSelect>
                      </div>
                      <div className="max-sm:hidden"><Label>{t("Colore Avatar")}</Label><Input type="color" {...register("colore_avatar")} className="h-10 p-1" /></div>
                      <div className="col-span-2 flex items-center justify-between rounded-md border px-3 py-2 max-sm:order-last">
                        <div>
                          <Label>{t("Profilo attivo")}</Label>
                          <p className="text-xs text-muted-foreground max-sm:hidden">{t("I profili inattivi restano nello storico ma non compaiono nei flussi operativi.")}</p>
                        </div>
                        <Switch checked={watch("attivo") ?? true} onCheckedChange={(checked) => setValue("attivo", checked)} />
                      </div>
                      <div className="col-span-2 flex items-center justify-between rounded-md border px-3 py-2 max-sm:order-last">
                        <div>
                          <Label htmlFor="hr-lavora-in-cantiere">{t("Lavora in cantiere")}</Label>
                          <p className="text-xs text-muted-foreground max-sm:hidden">{t("Usa questa stessa scheda in Manodopera e Mezzi per squadre e commesse. Puoi attivare l’app in seguito dalla scheda operaio.")}</p>
                        </div>
                        <Switch
                          id="hr-lavora-in-cantiere"
                          checked={watch("lavora_in_cantiere") ?? false}
                          onCheckedChange={(checked) => setValue("lavora_in_cantiere", checked)}
                        />
                      </div>
                      {watch("lavora_in_cantiere") && (
                        <div className="col-span-2 flex items-center justify-between rounded-md border px-3 py-2 max-sm:order-last">
                          <div>
                            <Label htmlFor="hr-timbra-dall-app">{t("Timbra dall'app")}</Label>
                            <p className="text-xs text-muted-foreground max-sm:hidden">{t("Spento: nell'app non vede la timbratura, le ore le segna il caposquadra o l'ufficio. Vale solo se la timbratura dall'app è accesa per l'azienda (Regole dell'area operai).")}</p>
                          </div>
                          <Switch
                            id="hr-timbra-dall-app"
                            checked={watch("timbra_dall_app") ?? true}
                            onCheckedChange={(checked) => setValue("timbra_dall_app", checked)}
                          />
                        </div>
                      )}
                      {profilo?.user_id && <LinguaAppDipendente userId={profilo.user_id} />}
                    </div>
                  </div>

                  <Separator className="max-sm:hidden" />

                  {/* Contratto */}
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-3 max-sm:hidden">{t("CONTRATTO")}</h4>
                    <div className="grid grid-cols-2 gap-3 max-sm:gap-2">
                      <div>
                        <Label>{t("Tipo Contratto")}</Label>
                        <UniformSelect className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" {...register("tipo_contratto")}>
                          {TIPO_CONTRATTO_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{t(o.label)}</option>))}
                        </UniformSelect>
                      </div>
                      <div className="max-sm:hidden"><Label>CCNL</Label><Input {...register("ccnl")} /></div>
                      <div className="max-sm:hidden"><Label>{t("Livello")}</Label><Input {...register("livello_ccnl")} /></div>
                      <div className="max-sm:hidden"><Label>{t("Matricola")}</Label><Input {...register("matricola")} /></div>
                      <div><Label>{t("Data Assunzione")}</Label><Input type="date" {...register("data_assunzione")} /></div>
                      <div className="max-sm:hidden"><Label>{t("Data Cessazione")}</Label><Input type="date" {...register("data_cessazione")} /></div>
                      <div className="col-span-2 max-sm:hidden"><Label>IBAN</Label><Input {...register("iban")} /></div>
                    </div>
                    {isEditing && (
                      <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1 max-sm:hidden">
                        <Info className="h-3 w-3" /> {t("Carica il contratto firmato nella scheda")} <b>{t("Documenti & Scadenze")}</b>.
                      </p>
                    )}
                    {isEditing && profilo && (
                      <div className="mt-3">
                        <CostoPersonaHr key={profilo.id} profiloId={profilo.id} />
                      </div>
                    )}
                  </div>

                  <Separator className="max-sm:hidden" />

                  {/* Orario */}
                  <div className="max-sm:hidden">
                    <h4 className="text-sm font-semibold text-muted-foreground mb-3">{t("ORARIO DI LAVORO")}</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>{t("Tipo Orario")}</Label>
                        <UniformSelect className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" {...register("orario_tipo")}>
                          {ORARIO_TIPO_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{t(o.label)}</option>))}
                        </UniformSelect>
                      </div>
                      <div><Label>{t("Ore Settimanali")}</Label><Input type="number" step="0.5" {...register("ore_settimanali", { valueAsNumber: true })} /></div>
                      <div><Label>{t("Ore Giornaliere")}</Label><Input type="number" step="0.5" {...register("ore_giornaliere", { valueAsNumber: true })} /></div>
                      <div><Label>{t("Pausa Pranzo (min)")}</Label><Input type="number" {...register("pausa_pranzo_minuti", { valueAsNumber: true })} /></div>
                      <div><Label>{t("Orario Inizio")}</Label><Input type="time" {...register("orario_inizio")} /></div>
                      <div><Label>{t("Orario Fine")}</Label><Input type="time" {...register("orario_fine")} /></div>
                    </div>
                  </div>

                  <Separator className="max-sm:hidden" />

                  {/* Ferie */}
                  <div className="max-sm:hidden">
                    <h4 className="text-sm font-semibold text-muted-foreground mb-3">{t("FERIE & PERMESSI")}</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>{t("Ferie Annuali (gg)")}</Label><Input type="number" step="0.5" {...register("ferie_anno_giorni", { valueAsNumber: true })} /></div>
                      <div><Label>{t("Ferie Residue (gg)")}</Label><Input type="number" step="0.5" {...register("ferie_residue", { valueAsNumber: true })} /></div>
                      <div><Label>{t("Permessi Annuali (ore)")}</Label><Input type="number" step="0.5" {...register("permessi_anno_ore", { valueAsNumber: true })} /></div>
                      <div><Label>{t("Permessi Residui (ore)")}</Label><Input type="number" step="0.5" {...register("permessi_residui_ore", { valueAsNumber: true })} /></div>
                      <div><Label>{t("ROL Annuali (ore)")}</Label><Input type="number" step="0.5" {...register("rol_anno_ore", { valueAsNumber: true })} /></div>
                      <div><Label>{t("ROL Residui (ore)")}</Label><Input type="number" step="0.5" {...register("rol_residuo_ore", { valueAsNumber: true })} /></div>
                    </div>
                  </div>

                  <Separator className="max-sm:hidden" />

                  {/* Contatto Emergenza */}
                  <div className="max-sm:hidden">
                    <h4 className="text-sm font-semibold text-muted-foreground mb-3">{t("CONTATTO EMERGENZA")}</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>{t("Nome")}</Label><Input {...register("contatto_emergenza_nome")} /></div>
                      <div><Label>{t("Telefono")}</Label><Input {...register("contatto_emergenza_telefono")} /></div>
                    </div>
                  </div>

                  <Separator className="max-sm:hidden" />

                  {/* Badge */}
                  <div className="max-sm:hidden">
                    <h4 className="text-sm font-semibold text-muted-foreground mb-3">{t("BADGE & ACCESSI")}</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>{t("Badge ID")}</Label><Input {...register("badge_id")} /></div>
                      <div><Label>{t("PIN Timbratura")}</Label><Input {...register("pin_timbratura")} type="password" /></div>
                    </div>
                  </div>

                  <Separator className="max-sm:hidden" />

                  {/* Mezzi e attrezzi in carico (solo lettura, si cambiano dalla scheda del mezzo) */}
                  {isEditing && profilo?.id && <MezziInCaricoProfilo hrProfiloId={profilo.id} />}

                  {/* Note */}
                  <div className="max-sm:hidden">
                    <Label>{t("Note Interne")}</Label>
                    <Textarea {...register("note_interne")} rows={3} />
                  </div>
                </div>
              </ScrollArea>

              <div className="shrink-0 border-t px-6 py-4 flex gap-2 justify-end max-sm:px-4 max-sm:py-3">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="max-sm:hidden">{t("Annulla")}</Button>
                <Button type="submit" disabled={isPending || stessoCf} className="max-sm:flex-1">
                  {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  {isEditing ? t("Salva") : t("Crea Profilo")}
                </Button>
              </div>
            </form>
          </TabsContent>

          {/* ── RUOLO & OBIETTIVI ───────────────────────────────────────── */}
          <TabsContent value="ruolo" className="flex-1 min-h-0 m-0">
            <ScrollArea className="h-full px-6"><div className="py-4">
              {isEditing && profilo
                ? <HrRuoloObiettiviTab profilo={profilo} />
                : <p className="text-sm text-muted-foreground py-8 text-center">{t("Salva prima il profilo per gestire ruolo e obiettivi.")}</p>}
            </div></ScrollArea>
          </TabsContent>

          {/* ── DOCUMENTI & SCADENZE ────────────────────────────────────── */}
          <TabsContent value="documenti" className="flex-1 min-h-0 m-0">
            <ScrollArea className="h-full px-6 max-sm:px-4"><div className="py-4 max-sm:py-3">
              {isEditing && profilo
                ? <>
                  {/* QR del tesserino: solo per chi lavora in cantiere (23/11/2026). */}
                  {profilo.lavora_in_cantiere && <TesserinoQrUfficio profiloId={profilo.id}
                    nome={[profilo.nome, profilo.cognome].filter(Boolean).join(" ")} puoModificare />}
                  <HrDocumentiSection profiloId={profilo.id} companyId={profilo.company_id} />
                </>
                : <p className="text-sm text-muted-foreground py-8 text-center">{t("Salva prima il profilo per gestire i documenti.")}</p>}
            </div></ScrollArea>
          </TabsContent>

          {/* ── ASSENZE & MALATTIE ──────────────────────────────────────── */}
          <TabsContent value="assenze" className="flex-1 min-h-0 m-0">
            <ScrollArea className="h-full px-6"><div className="py-4">
              {isEditing && profilo
                ? <HrAssenzeSection profiloId={profilo.id} companyId={profilo.company_id} />
                : <p className="text-sm text-muted-foreground py-8 text-center">{t("Salva prima il profilo per registrare le assenze.")}</p>}
            </div></ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
