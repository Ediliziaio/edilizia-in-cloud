import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertCircle, Ban, Building2, Calculator, ChevronRight, Clock, KeyRound,
  MoreHorizontal, Pencil, Play, RefreshCw, Search, Users, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AccessControlDialog } from "@/components/admin/AccessControlDialog";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { CommercialistiAnalytics } from "@/components/admin/commercialisti/CommercialistiAnalytics";
import { EditEntityDialog } from "@/components/admin/EditEntityDialog";
import { IntestazioneArea } from "@/components/admin/fatturato/AreaUI";
import { LastAccessBadge } from "@/components/admin/LastAccessBadge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { latestActivity, useAdminActivity, type ActivityEntry } from "@/hooks/useAdminActivity";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { ACCESS_MODE_OPTIONS } from "@/lib/commercialista/livelliAccesso";
import { companyStatusLabelIt } from "@/lib/companyStatusLabel";
import { retryAuthorizedRead } from "@/lib/retryAuthorizedRead";

const STUDIO_LABEL: Record<string, string> = {
  active: "Attivo", pending_contract: "Contratto in attesa", suspended: "Sospeso", archived: "Archiviato",
};
const DOCUMENTO_LABEL: Record<string, string> = {
  pending: "In attesa", sent: "Inviato", signed: "Firmato", approved: "Approvato",
  rejected: "Rifiutato", not_required: "Non richiesto",
};
const DELEGA_LABEL: Record<string, string> = {
  active: "Attiva", invited: "Invito in attesa", suspended: "Sospesa",
};
const MEMBRO_LABEL: Record<string, string> = { active: "Attivo", invited: "Invitato", suspended: "Sospeso" };
const RUOLO_LABEL: Record<string, string> = {
  owner: "Titolare", admin: "Amministratore", collaborator: "Collaboratore", viewer: "Solo lettura",
};
const MODALITA_LABEL = new Map<string, string>(ACCESS_MODE_OPTIONS.map(m => [m.value, m.label]));
const FILTRI_STUDIO = [["active", "Attivi"], ["pending_contract", "Contratto in attesa"], ["suspended", "Sospesi"], ["archived", "Archiviati"]];
const FILTRI_DELEGA = [["active", "Attive"], ["invited", "Inviti in attesa"], ["suspended", "Sospese"], ["none", "Senza deleghe"]];
const ORDINI = [["recenti", "Più recenti"], ["nome", "Nome A–Z"], ["deleghe", "Più deleghe attive"]];
const DATA_IT = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric" });
const GIORNO_MS = 86_400_000;
const CHIAVE_STUDI = ["admin-commercialisti"] as const;

type Membro = {
  user_id: string; name: string | null; email: string | null; role: string; status: string;
};
type Delega = {
  id: string; company_id: string; status: string; access_mode: string;
  company_name: string | null; company_status: string | null;
};

async function fetchStudi() {
  const { data: firms, error } = await supabase
    .from("accountant_firms")
    .select("id, name, status, owner_user_id, email, vat_number, fiscal_code, contract_status, dpa_status, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!firms?.length) return [];

  const firmIds = firms.map(firm => firm.id);
  const [membri, deleghe] = await Promise.all([
    supabase.from("accountant_firm_members").select("firm_id, user_id, role, status").in("firm_id", firmIds),
    supabase.from("accountant_company_access")
      .select("id, firm_id, company_id, status, access_mode, company:companies!inner(name, status)")
      .in("firm_id", firmIds).in("status", ["active", "invited", "suspended"]),
  ]);
  if (membri.error) throw membri.error;
  if (deleghe.error) throw deleghe.error;

  const userIds = [...new Set([
    ...membri.data.map(membro => membro.user_id),
    ...firms.map(firm => firm.owner_user_id).filter((id): id is string => !!id),
  ])];
  const profili = userIds.length
    ? await supabase.from("profiles").select("id, email, first_name, last_name").in("id", userIds)
    : null;
  if (profili?.error) throw profili.error;

  const profiloPerId = new Map((profili?.data ?? []).map(profilo => [profilo.id, profilo]));
  const nomeUtente = (id: string | null) => {
    const profilo = id ? profiloPerId.get(id) : undefined;
    return profilo ? [profilo.first_name, profilo.last_name].filter(Boolean).join(" ") || null : null;
  };
  const membriPerStudio = new Map<string, Membro[]>();
  for (const membro of membri.data) {
    const lista = membriPerStudio.get(membro.firm_id) ?? [];
    lista.push({
      user_id: membro.user_id, role: membro.role, status: membro.status,
      name: nomeUtente(membro.user_id), email: profiloPerId.get(membro.user_id)?.email ?? null,
    });
    membriPerStudio.set(membro.firm_id, lista);
  }

  const deleghePerStudio = new Map<string, Delega[]>();
  for (const delega of deleghe.data) {
    const lista = deleghePerStudio.get(delega.firm_id) ?? [];
    lista.push({
      id: delega.id, company_id: delega.company_id, status: delega.status, access_mode: delega.access_mode,
      company_name: delega.company?.name ?? null, company_status: delega.company?.status ?? null,
    });
    deleghePerStudio.set(delega.firm_id, lista);
  }

  return firms.map(firm => {
    const members = membriPerStudio.get(firm.id) ?? [];
    const companies = deleghePerStudio.get(firm.id) ?? [];
    return {
      ...firm,
      owner_email: firm.owner_user_id ? profiloPerId.get(firm.owner_user_id)?.email ?? null : null,
      owner_name: nomeUtente(firm.owner_user_id),
      members,
      members_count: members.filter(m => m.status === "active").length,
      companies,
      deleghe_attive: companies.filter(c => c.status === "active").length,
      inviti: companies.filter(c => c.status === "invited").length,
      deleghe_sospese: companies.filter(c => c.status === "suspended").length,
    };
  });
}

type Studio = Awaited<ReturnType<typeof fetchStudi>>[number];

function attivitaTitolare(studio: Studio, activity: Record<string, ActivityEntry>) {
  return studio.owner_user_id ? activity[studio.owner_user_id] : undefined;
}

function senzaAccessiRecenti(attivita: ActivityEntry | undefined, now: number) {
  if (!attivita) return false;
  const ultima = latestActivity(attivita);
  return ultima ? Date.parse(ultima) <= now - 30 * GIORNO_MS : !!attivita.created_at;
}

function Filtro({ label, value, options, onChange }: {
  label: string; value: string; options: string[][]; onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 min-w-0" aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map(([id, text]) => <SelectItem key={id} value={id}>{text}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

const COLONNE_STUDIO = "grid min-w-0 grid-cols-1 items-center gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(6.5rem,.65fr)] xl:grid-cols-[minmax(0,1.65fr)_minmax(6.5rem,.65fr)_minmax(8rem,.8fr)_minmax(8.25rem,.75fr)]";

function DatiStudio({ studio }: { studio: Studio }) {
  const dati = [
    ["Titolare", studio.owner_name ?? studio.owner_email],
    ["Email dello studio", studio.email],
    ["Partita IVA", studio.vat_number],
    ["Codice fiscale", studio.fiscal_code],
    ["Registrazione", DATA_IT.format(new Date(studio.created_at))],
    ["Contratto", DOCUMENTO_LABEL[studio.contract_status] ?? studio.contract_status],
    ["DPA", DOCUMENTO_LABEL[studio.dpa_status] ?? studio.dpa_status],
  ];
  const ordineDeleghe = ["active", "invited", "suspended"];
  const deleghe = [...studio.companies].sort((a, b) =>
    ordineDeleghe.indexOf(a.status) - ordineDeleghe.indexOf(b.status)
    || (a.company_name ?? "").localeCompare(b.company_name ?? "", "it"),
  );

  return (
    <div className="space-y-3 border-t bg-muted/25 p-3 sm:p-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border bg-card px-3 py-3 sm:grid-cols-3 lg:grid-cols-4">
        {dati.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 break-words text-sm font-medium">{value || "—"}</dd>
          </div>
        ))}
      </dl>
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <section className="min-w-0 rounded-lg border bg-card" aria-label="Deleghe aziendali">
          <h3 className="flex items-center gap-2 border-b px-3 py-2.5 text-sm font-semibold">
            <Building2 className="size-4 text-muted-foreground" aria-hidden="true" /> Deleghe aziendali
            <span className="text-xs font-normal text-muted-foreground">{deleghe.length}</span>
          </h3>
          {!deleghe.length ? <p className="px-3 py-4 text-sm text-muted-foreground">
            L’azienda può invitare lo studio da Impostazioni → Persone e accessi → Commercialista.
          </p> : (
            <ul className="divide-y">
              {deleghe.map(delega => (
                <li key={delega.id}>
                  <Link to={`/admin/aziende/${delega.company_id}`}
                    className="flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-muted/50">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium">{delega.company_name ?? "Azienda"}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {MODALITA_LABEL.get(delega.access_mode) ?? delega.access_mode} · Stato azienda {companyStatusLabelIt(delega.company_status)}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <Badge variant={delega.status === "active" ? "secondary" : "outline"}
                        className={delega.status === "invited" ? "text-amber-700 dark:text-amber-400" : undefined}>
                        {DELEGA_LABEL[delega.status] ?? delega.status}
                      </Badge>
                      <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="min-w-0 rounded-lg border bg-card" aria-label="Membri dello studio">
          <h3 className="flex items-center gap-2 border-b px-3 py-2.5 text-sm font-semibold">
            <Users className="size-4 text-muted-foreground" aria-hidden="true" /> Membri dello studio
            <span className="text-xs font-normal text-muted-foreground">{studio.members.length}</span>
          </h3>
          {!studio.members.length ? <p className="px-3 py-4 text-sm text-muted-foreground">Nessun membro associato.</p> : (
            <ul className="divide-y">
              {studio.members.map(membro => (
                <li key={membro.user_id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <div className="min-w-0 break-words">
                    <p className="text-sm font-medium">{membro.name ?? membro.email ?? "Membro"}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {RUOLO_LABEL[membro.role] ?? membro.role}{membro.name && membro.email ? ` · ${membro.email}` : ""}
                    </p>
                  </div>
                  <Badge variant={membro.status === "active" ? "secondary" : "outline"} className="shrink-0">
                    {MEMBRO_LABEL[membro.status] ?? membro.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export default function CommercialistiDashboard() {
  const { permissions } = useSuperAdminPermissions();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [statusTarget, setStatusTarget] = useState<Studio | null>(null);
  const [accessTarget, setAccessTarget] = useState<Studio | null>(null);
  const [editTarget, setEditTarget] = useState<Studio | null>(null);
  const [now] = useState(() => Date.now());
  const query = useQuery({
    queryKey: CHIAVE_STUDI,
    queryFn: fetchStudi,
    enabled: permissions.can_manage_companies,
    retry: retryAuthorizedRead,
    staleTime: 60_000,
  });
  const studi = query.data ?? [];
  const attivita = useAdminActivity(permissions.super_admin ? studi.map(studio => studio.owner_user_id) : []);
  const cerca = params.get("q") ?? "";
  const stato = params.get("stato") ?? "tutti";
  const delega = params.get("delega") ?? "tutte";
  const ordine = params.get("ordine") ?? "recenti";
  const inattivi = params.get("accessi") === "inattivi";
  const filtriAttivi = !!cerca || stato !== "tutti" || delega !== "tutte" || ordine !== "recenti" || inattivi;

  function impostaFiltro(chiave: string, valore: string, predefinito = "") {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      if (valore === predefinito) next.delete(chiave);
      else next.set(chiave, valore);
      return next;
    }, { replace: true });
  }

  function azzeraFiltri() {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      ["q", "stato", "delega", "ordine", "accessi"].forEach(chiave => next.delete(chiave));
      return next;
    }, { replace: true });
  }

  function aggiorna() {
    void query.refetch();
    if (permissions.super_admin && studi.some(s => s.owner_user_id)) void attivita.refetch();
  }

  const setFirmStatus = useMutation({
    mutationFn: async (studio: Studio) => {
      const status = studio.status === "suspended" ? "active" : "suspended";
      const { data, error } = await supabase.from("accountant_firms").update({ status })
        .eq("id", studio.id).eq("status", studio.status).select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Lo stato dello studio è cambiato o non è modificabile.");
      return status;
    },
    onSuccess: status => {
      toast.success(status === "suspended" ? "Studio sospeso" : "Studio riattivato");
      setStatusTarget(null);
      void qc.invalidateQueries({ queryKey: CHIAVE_STUDI });
    },
    onError: error => toast.error("Operazione fallita", { description: error.message }),
  });

  const termine = cerca.trim().toLocaleLowerCase("it");
  const filtrati = studi.filter(studio => {
    if (stato !== "tutti" && studio.status !== stato) return false;
    if (delega === "none" ? studio.companies.length > 0 : delega !== "tutte" && !studio.companies.some(c => c.status === delega)) return false;
    if (inattivi && !senzaAccessiRecenti(attivitaTitolare(studio, attivita.activity), now)) return false;
    return !termine || [
      studio.name, studio.owner_name, studio.owner_email, studio.email, studio.vat_number, studio.fiscal_code,
      ...studio.companies.map(c => c.company_name),
    ].some(value => value?.toLocaleLowerCase("it").includes(termine));
  }).sort((a, b) => {
    if (ordine === "nome") return a.name.localeCompare(b.name, "it");
    if (ordine === "deleghe") return b.deleghe_attive - a.deleghe_attive || a.name.localeCompare(b.name, "it");
    return b.created_at.localeCompare(a.created_at);
  });
  const quantiInattivi = studi.filter(studio => senzaAccessiRecenti(attivitaTitolare(studio, attivita.activity), now)).length;

  if (!permissions.can_manage_companies) return <AccessDenied />;

  return (
    <div className="max-w-[1600px] min-w-0 space-y-4">
      <IntestazioneArea icona={Calculator} titolo="Commercialisti" spiegazione="Studi, deleghe aziendali e accessi al portale."
        azioni={<Button variant="outline" size="sm" onClick={aggiorna} disabled={query.isFetching} aria-label="Aggiorna studi">
          <RefreshCw className={`size-4 ${query.isFetching ? "motion-safe:animate-spin" : ""}`} aria-hidden="true" />
          <span className="hidden sm:inline">Aggiorna</span>
        </Button>} />

      {query.isError && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>Impossibile aggiornare studi, deleghe e membri.</span>
            <Button variant="outline" size="sm" onClick={aggiorna}>Riprova</Button>
          </AlertDescription>
        </Alert>
      )}
      {query.isLoading && <Skeleton className="h-40 w-full" />}
      {query.isSuccess && !studi.length && (
        <Card className="p-8 text-center">
          <Calculator className="mx-auto mb-2 size-6 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">Nessuno studio registrato</p>
          <p className="mt-1 text-sm text-muted-foreground">Gli studi possono registrarsi o ricevere un invito da un’azienda.</p>
        </Card>
      )}

      {studi.length > 0 && <>
        <CommercialistiAnalytics studi={studi} filtri={{ attivi: stato === "active", inviti: delega === "invited" }}
          onAttivi={() => impostaFiltro("stato", stato === "active" ? "tutti" : "active", "tutti")}
          onInviti={() => impostaFiltro("delega", delega === "invited" ? "tutte" : "invited", "tutte")} />

        <Card className="min-w-0">
          <div className="space-y-3 p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <h2 className="font-semibold">Elenco studi</h2>
                <p className="text-xs text-muted-foreground" aria-live="polite">{filtrati.length} di {studi.length}</p>
              </div>
              {permissions.super_admin && (
                <Button variant={inattivi ? "secondary" : "outline"} size="sm" aria-pressed={inattivi}
                  disabled={attivita.isLoading || attivita.isError}
                  onClick={() => impostaFiltro("accessi", inattivi ? "" : "inattivi")}
                  title="Titolari senza accessi negli ultimi 30 giorni o mai entrati">
                  <Clock className="size-4" aria-hidden="true" /> Inattivi o mai entrati
                  {!attivita.isLoading && !attivita.isError && <span className="tabular-nums text-muted-foreground">{quantiInattivi}</span>}
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 items-center gap-2 lg:grid-cols-[minmax(12rem,1fr)_repeat(3,minmax(8rem,.42fr))_auto]">
              <div className="relative col-span-2 lg:col-span-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input type="search" aria-label="Cerca studi e aziende" value={cerca}
                  onChange={event => impostaFiltro("q", event.target.value)}
                  placeholder="Studio, email, P.IVA o azienda" className="h-9 pl-8" />
              </div>
              <Filtro label="Stato dello studio" value={stato} options={[["tutti", "Tutti gli studi"], ...FILTRI_STUDIO]}
                onChange={value => impostaFiltro("stato", value, "tutti")} />
              <Filtro label="Stato delle deleghe" value={delega} options={[["tutte", "Tutte le deleghe"], ...FILTRI_DELEGA]}
                onChange={value => impostaFiltro("delega", value, "tutte")} />
              <Filtro label="Ordina studi" value={ordine} options={ORDINI}
                onChange={value => impostaFiltro("ordine", value, "recenti")} />
              <Button variant="ghost" size="sm" className="justify-self-end" disabled={!filtriAttivi} onClick={azzeraFiltri}>
                <X className="size-4" aria-hidden="true" /> Azzera filtri
              </Button>
            </div>
            {attivita.isError && <p role="status" className="text-xs text-muted-foreground">Dati sull’ultimo accesso al momento indisponibili.</p>}
          </div>

          {!filtrati.length ? (
            <p className="border-t p-6 text-center text-sm text-muted-foreground">Nessuno studio corrisponde ai filtri.</p>
          ) : (
            <>
              <div aria-hidden="true" className={`${COLONNE_STUDIO} hidden border-y bg-muted/45 py-2 pl-8 pr-[3.25rem] text-xs font-medium text-muted-foreground xl:grid`}>
                <span>Studio e contatto</span><span>Stato</span><span>Deleghe</span><span>Ultimo accesso titolare</span>
              </div>
              <ul className="divide-y max-xl:border-t">
                {filtrati.map(studio => {
                  const aperto = expanded === studio.id;
                  const datoAttivita = attivitaTitolare(studio, attivita.activity);
                  const ultimoAccesso = latestActivity(datoAttivita);
                  const dettagliId = `studio-${studio.id}`;
                  const statoModificabile = studio.status === "active" || studio.status === "suspended";
                  return (
                    <li key={studio.id}>
                      <div className="flex items-center gap-1 px-2 hover:bg-muted/30 sm:px-3">
                        <button type="button" aria-expanded={aperto} aria-controls={dettagliId}
                          aria-label={`${aperto ? "Chiudi" : "Apri"} dettaglio ${studio.name}`}
                          onClick={() => setExpanded(aperto ? null : studio.id)}
                          className="flex min-w-0 flex-1 items-start gap-1.5 rounded-md py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:items-center">
                          <ChevronRight aria-hidden="true" className={`mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform sm:mt-0 ${aperto ? "rotate-90" : ""}`} />
                          <span className={`${COLONNE_STUDIO} flex-1`}>
                            <span className="min-w-0">
                              <span className="block break-words text-sm font-semibold">{studio.name}</span>
                              {(studio.email || studio.owner_email) && <span className="block truncate text-xs text-muted-foreground">{studio.email ?? studio.owner_email}</span>}
                            </span>
                            <Badge variant={studio.status === "suspended" ? "destructive" : studio.status === "active" ? "secondary" : "outline"}
                              className="w-fit whitespace-normal">{STUDIO_LABEL[studio.status] ?? studio.status}</Badge>
                            <span className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                              <span className="font-medium text-foreground">{studio.deleghe_attive} {studio.deleghe_attive === 1 ? "attiva" : "attive"}</span>
                              {studio.inviti > 0 && <span className="text-amber-700 dark:text-amber-400">{studio.inviti} {studio.inviti === 1 ? "invito" : "inviti"}</span>}
                              {studio.deleghe_sospese > 0 && <span>{studio.deleghe_sospese} {studio.deleghe_sospese === 1 ? "sospesa" : "sospese"}</span>}
                            </span>
                            <span className="min-w-0">
                              {ultimoAccesso || datoAttivita?.created_at || (studio.owner_user_id && attivita.isLoading)
                                ? <LastAccessBadge lastSeen={ultimoAccesso} nowMs={now} loading={attivita.isLoading} />
                                : <span className="text-xs text-muted-foreground">{studio.owner_user_id ? "Accesso non disponibile" : "Titolare non associato"}</span>}
                            </span>
                          </span>
                        </button>
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="size-9 shrink-0" aria-label={`Azioni per ${studio.name}`}>
                              <MoreHorizontal className="size-4" aria-hidden="true" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setEditTarget(studio)}>
                              <Pencil className="mr-2 size-4" /> Modifica anagrafica
                            </DropdownMenuItem>
                            {permissions.super_admin && (
                              <DropdownMenuItem disabled={!studio.owner_email} onSelect={() => setAccessTarget(studio)}>
                                <KeyRound className="mr-2 size-4" /> Gestisci accesso titolare
                              </DropdownMenuItem>
                            )}
                            {statoModificabile && <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => setStatusTarget(studio)} className={studio.status === "active" ? "text-destructive" : undefined}>
                                {studio.status === "active" ? <><Ban className="mr-2 size-4" /> Sospendi studio</> : <><Play className="mr-2 size-4" /> Riattiva studio</>}
                              </DropdownMenuItem>
                            </>}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div id={dettagliId} hidden={!aperto}>
                        {aperto && <DatiStudio studio={studio} />}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Card>
      </>}

      <AlertDialog open={!!statusTarget} onOpenChange={open => { if (!open && !setFirmStatus.isPending) setStatusTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{statusTarget?.status === "suspended" ? "Riattivare" : "Sospendere"} {statusTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Aggiorni lo stato dello studio. Per modificare una delega, apri la scheda della relativa azienda.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={setFirmStatus.isPending}>Annulla</AlertDialogCancel>
            <Button variant={statusTarget?.status === "active" ? "destructive" : "default"} disabled={!statusTarget || setFirmStatus.isPending}
              onClick={() => { if (statusTarget) setFirmStatus.mutate(statusTarget); }}>
              {statusTarget?.status === "suspended" ? "Riattiva studio" : "Sospendi studio"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AccessControlDialog open={!!accessTarget} onOpenChange={open => { if (!open) setAccessTarget(null); }}
        email={accessTarget?.owner_email ?? null} label={accessTarget?.name}
        onChanged={() => qc.invalidateQueries({ queryKey: CHIAVE_STUDI })} />

      <EditEntityDialog
        open={!!editTarget} onOpenChange={open => { if (!open) setEditTarget(null); }}
        title={editTarget ? `Anagrafica · ${editTarget.name}` : "Anagrafica studio"}
        fields={[
          { key: "name", label: "Ragione sociale", required: true, maxLength: 120 },
          { key: "email", label: "Email dello studio", type: "email", maxLength: 254 },
          { key: "vat_number", label: "Partita IVA", maxLength: 20 },
          { key: "fiscal_code", label: "Codice fiscale", maxLength: 16 },
        ]}
        initial={{
          name: editTarget?.name ?? "", email: editTarget?.email ?? "",
          vat_number: editTarget?.vat_number ?? "", fiscal_code: editTarget?.fiscal_code ?? "",
        }}
        onSave={async v => {
          if (!editTarget) return;
          const { data, error } = await supabase.from("accountant_firms").update({
            name: v.name.trim(),
            email: v.email.trim().toLowerCase() || null,
            vat_number: v.vat_number.trim() || null,
            fiscal_code: v.fiscal_code.trim().toUpperCase() || null,
          }).eq("id", editTarget.id).select("id").maybeSingle();
          if (error) throw error;
          if (!data) throw new Error("Lo studio non è più disponibile o non è modificabile.");
          toast.success("Anagrafica aggiornata");
          await qc.invalidateQueries({ queryKey: CHIAVE_STUDI });
        }}
      />
    </div>
  );
}
