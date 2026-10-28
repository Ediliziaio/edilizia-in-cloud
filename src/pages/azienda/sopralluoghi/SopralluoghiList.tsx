import { PipelineCardHeading } from "@/components/orders/PipelineDrag";
import { useOperationalViewMemory } from "@/hooks/useOperationalViewMemory";
import {
  useOperationalArchive,
  inOperationalScope,
} from "@/hooks/useOperationalArchive";
import { OperationalHelp } from "@/components/orders/OperationalHelp";
import { OperationalArchive } from "@/components/orders/OperationalArchive";
import { OperationalTable } from "@/components/orders/OperationalTable";
import { useMemo, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listaSopralluoghiBacheca } from "@/lib/api/surveysBoard";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ClipboardList,
  Plus,
  MapPin,
  Search,
  Calendar,
  CalendarClock,
  AlertCircle,
  Settings,
  Phone,
  User,
  ArrowRight,
  FileCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OperationalKpiCard } from "@/components/orders/OperationalKpiCard";
import { OperationalViewSwitch } from "@/components/orders/OperationalViewSwitch";
import { OperationalBoard } from "@/components/orders/OperationalBoard";
import { usePipelineTransition } from "@/hooks/usePipelineTransition";
import { PianificaSopralluogoDialog } from "@/components/sopralluoghi/PianificaSopralluogoDialog";
import {
  FASI,
  contaPerFase,
  cosaFareOra,
  fasePratica,
  filtraBacheca,
  ordinaBacheca,
  prossimaAzione,
  quando,
  type FasePratica,
  type FiltriBacheca,
  type PeriodoFiltro,
  type SopralluogoBacheca,
} from "@/lib/sopralluoghi/bacheca";
import {
  FILTRI_SOPRALLUOGHI,
  leggiFiltriBacheca,
  scriviFiltriBacheca,
} from "@/lib/sopralluoghi/filtriBacheca";

const COLORI: Record<
  FasePratica,
  { badge: string; bordo: string; descrizione: string }
> = {
  da_pianificare: {
    badge: "bg-slate-100 text-slate-700",
    bordo: "#64748b",
    descrizione: "Fissa data e tecnico",
  },
  pianificato: {
    badge: "bg-sky-50 text-sky-700",
    bordo: "#0284c7",
    descrizione: "Appuntamenti già fissati",
  },
  in_corso: {
    badge: "bg-amber-50 text-amber-700",
    bordo: "#d97706",
    descrizione: "Rilievi da completare",
  },
  completato: {
    badge: "bg-emerald-50 text-emerald-700",
    bordo: "#059669",
    descrizione: "In attesa della firma cliente",
  },
  firmato: {
    badge: "bg-violet-50 text-violet-700",
    bordo: "#7c3aed",
    descrizione: "Pronti per il preventivo",
  },
  preventivo: {
    badge: "bg-teal-50 text-teal-700",
    bordo: "#0d9488",
    descrizione: "Pratiche collegate a preventivo o commessa",
  },
};
const TONO = {
  normale: "text-slate-500",
  oggi: "font-medium text-orange-700",
  ritardo: "font-medium text-red-600",
  nessuna: "text-slate-500",
};
const PERIODI: { value: PeriodoFiltro; label: string }[] = [
  { value: "tutti", label: "Tutte le date" },
  { value: "oggi", label: "Oggi" },
  { value: "settimana", label: "Prossimi 7 giorni" },
  { value: "mese", label: "Prossimi 30 giorni" },
  { value: "in_ritardo", label: "In ritardo" },
  { value: "senza_data", label: "Senza data" },
];

function Scheda({ s, adesso }: { s: SopralluogoBacheca; adesso: Date }) {
  const fase = fasePratica(s);
  if (!fase) return null;
  const fatto = ["completato", "firmato", "preventivo"].includes(fase);
  const q = quando(s.scheduled_at, adesso, fatto);
  const azione = prossimaAzione(s, adesso);
  return (
    <Card className="min-w-0 rounded-lg border-slate-200  bg-white shadow-sm transition hover:border-orange-200 hover:shadow-sm">
      <CardContent className="flex flex-col gap-2 p-2">
        <div className="min-w-0 flex-1 space-y-1">
          <PipelineCardHeading>
            <Link
              to={`/azienda/sopralluoghi/${s.id}`}
              className="min-w-0 max-w-full truncate font-mono text-xs font-semibold text-primary hover:underline"
              title={s.code}
            >
              {s.code}
            </Link>
          </PipelineCardHeading>
          <Link
            to={`/azienda/sopralluoghi/${s.id}`}
            className="block truncate text-sm font-semibold text-slate-900 hover:text-primary"
            title={s.cliente_nome || "Cliente non indicato"}
          >
            {s.cliente_nome || "Cliente non indicato"}
          </Link>
          <p className={cn("flex items-start gap-1.5 text-xs", TONO[q.tono])}>
            <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {q.testo}
          </p>
          <p className="flex items-start gap-1.5 text-xs text-slate-500">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span
              className="line-clamp-2"
              title={[s.address, s.city].filter(Boolean).join(", ")}
            >
              {[s.address, s.city].filter(Boolean).join(", ") ||
                "Indirizzo da indicare"}
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <User className="h-3 w-3" />
              {s.tecnico_nome || "Tecnico da assegnare"}
            </span>
            {s.cliente_telefono && (
              <a
                href={`tel:${s.cliente_telefono}`}
                className="inline-flex items-center gap-1 text-sky-700 hover:underline"
              >
                <Phone className="h-3 w-3" />
                {s.cliente_telefono}
              </a>
            )}
          </div>
        </div>
        {azione && (
          <p className="border-t pt-2 text-xs text-slate-500">{azione}</p>
        )}
      </CardContent>
    </Card>
  );
}

function PipelineSopralluoghi({
  righe,
  adesso,
  puoCreare,
  pianifica,
  onMove,
  saving,
}: {
  righe: SopralluogoBacheca[];
  adesso: Date;
  puoCreare: boolean;
  pianifica: (s: SopralluogoBacheca) => void;
  onMove: (id: string, target: string) => void;
  saving: boolean;
}) {
  const navigate = useNavigate();
  const accent: Record<FasePratica, string> = {
    da_pianificare: "border-t-slate-500",
    pianificato: "border-t-sky-500",
    in_corso: "border-t-amber-500",
    completato: "border-t-emerald-500",
    firmato: "border-t-violet-500",
    preventivo: "border-t-teal-500",
  };
  return (
    <>
      <OperationalBoard
        label="Pipeline sopralluoghi"
        onOpen={(s) => navigate(`/azienda/sopralluoghi/${s.id}`)}
        renderActions={(s) =>
          puoCreare &&
          ["da_pianificare", "pianificato"].includes(fasePratica(s) ?? "") ? (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              aria-label="Pianifica"
              title="Pianifica sopralluogo"
              onClick={() => pianifica(s)}
            >
              <CalendarClock className="h-3.5 w-3.5" />
            </Button>
          ) : null
        }
        onMove={puoCreare ? onMove : undefined}
        disabled={saving}
        getLabel={(s) => s.code}
        columns={FASI.map(({ fase, etichetta }) => ({
          id: fase,
          label: etichetta,
          hint: COLORI[fase].descrizione,
          accent: accent[fase],
          items: righe
            .filter((s) => fasePratica(s) === fase)
            .sort((a, b) =>
              ["completato", "firmato", "preventivo"].includes(fase)
                ? (
                    b.scheduled_at ||
                    b.updated_at ||
                    b.created_at
                  ).localeCompare(
                    a.scheduled_at || a.updated_at || a.created_at,
                  )
                : 0,
            ),
        }))}
        renderCard={(s) => <Scheda s={s} adesso={adesso} />}
      />
    </>
  );
}

export default function SopralluoghiList() {
  const permessi = usePermissions();
  const puoCreare = !permessi.solaLettura;
  const companyId = useEffectiveCompanyId();
  const [params, setParams] = useSearchParams();
  useOperationalViewMemory("sop", [
    "sop_vista",
    "sop_ambito",
    "sop_cerca",
    "sop_fase",
    "sop_periodo",
    "sop_tecnico",
    "sop_senza_preventivo",
    "sop_ferme",
  ]);
  const filtri = useMemo(() => leggiFiltriBacheca(params), [params]);
  const vista = params.get("sop_vista") === "elenco" ? "elenco" : "pipeline";
  const [pagina, setPagina] = useState(1);
  const [daPianificare, setDaPianificare] = useState<SopralluogoBacheca | null>(
    null,
  );
  const {
    data: tutti = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["sopralluoghi-bacheca", companyId],
    enabled: !!companyId,
    queryFn: () => listaSopralluoghiBacheca(companyId as string),
  });
  const movement = usePipelineTransition({
    kind: "survey",
    enabled: puoCreare,
    onPlan: (id) => setDaPianificare(tutti.find((s) => s.id === id) ?? null),
  });
  const moveSurvey = (id: string, target: string) => {
    const s = tutti.find((s) => s.id === id);
    if (!s) return;
    movement.request(
      {
        id: s.id,
        label: s.code,
        status: s.status,
        stage: fasePratica(s) ?? "",
        href: `/azienda/sopralluoghi/${s.id}`,
        scheduled: s.scheduled_at,
        linked: !!(s.estimate_id || s.order_id),
      },
      target,
    );
  };

  const { data: staff = [] } = useCompanyStaffUsers(companyId);
  const adesso = useMemo(() => new Date(), [tutti]); // eslint-disable-line react-hooks/exhaustive-deps
  const ora = useMemo(() => cosaFareOra(tutti, adesso), [tutti, adesso]);
  const base = useMemo(
    () => filtraBacheca(tutti, { ...filtri, fase: "tutte" }, adesso),
    [tutti, filtri, adesso],
  );
  const conteggi = useMemo(() => contaPerFase(base), [base]);
  const archive = useOperationalArchive(
    "sop_ambito",
    filtri.fase !== "tutte" || vista === "elenco" ? "all" : "active",
  );
  const elencoCompleto = useMemo(
    () => ordinaBacheca(filtraBacheca(tutti, filtri, adesso), adesso),
    [tutti, filtri, adesso],
  );
  const elenco = elencoCompleto.filter((s) =>
    inOperationalScope(fasePratica(s) === "preventivo", archive.scope),
  );
  const totale = Object.values(contaPerFase(tutti)).reduce((a, b) => a + b, 0);
  const pagine = Math.max(1, Math.ceil(elenco.length / 24));
  const paginaAttuale = Math.min(pagina, pagine);
  const imposta = (p: Partial<FiltriBacheca>) => {
    setPagina(1);
    setParams(
      (prima) => {
        const next = scriviFiltriBacheca(prima, p);
        if (p.fase) next.set("sop_ambito", "all");
        return next;
      },
      { replace: true },
    );
  };
  const azzera = () => imposta(FILTRI_SOPRALLUOGHI);
  const attivi =
    Number(filtri.fase !== "tutte") +
    Number(filtri.periodo !== "tutti") +
    Number(filtri.tecnico !== "tutti") +
    Number(!!filtri.testo?.trim()) +
    Number(!!filtri.soloSenzaPreventivo) +
    Number(!!filtri.soloBozzeFerme);

  return (
    <div className="min-w-0 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Sopralluoghi
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Dalla pianificazione al preventivo: cliente, tecnico e prossima
            azione sempre visibili.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(permessi.isAdmin || permessi.canViewSettingsCustomization) && (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="gap-1.5 max-sm:hidden"
            >
              <Link to="/azienda/impostazioni/sopralluoghi">
                <Settings className="h-3.5 w-3.5" />
                Modelli e impostazioni
              </Link>
            </Button>
          )}
          {puoCreare && (
            <Button
              asChild
              size="sm"
              className="gap-1.5 bg-orange-600 hover:bg-orange-700"
            >
              <Link to="/azienda/sopralluoghi/nuovo">
                <Plus className="h-4 w-4" />
                Nuovo sopralluogo
              </Link>
            </Button>
          )}
        </div>
      </header>
      {!isError && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {isLoading ? (
            [0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))
          ) : (
            <>
              <OperationalKpiCard
                label="Oggi in agenda"
                value={ora.oggi.length}
                icon={Calendar}
                tone="blue"
                onClick={() =>
                  imposta({ ...FILTRI_SOPRALLUOGHI, periodo: "oggi" })
                }
                active={filtri.periodo === "oggi"}
              />
              <OperationalKpiCard
                label="Da pianificare"
                value={contaPerFase(tutti).da_pianificare}
                icon={CalendarClock}
                tone="amber"
                onClick={() =>
                  imposta({ ...FILTRI_SOPRALLUOGHI, fase: "da_pianificare" })
                }
                active={filtri.fase === "da_pianificare"}
              />
              <OperationalKpiCard
                label="In ritardo"
                value={ora.inRitardo.length}
                icon={AlertCircle}
                tone={ora.inRitardo.length > 0 ? "red" : "green"}
                onClick={() =>
                  imposta({ ...FILTRI_SOPRALLUOGHI, periodo: "in_ritardo" })
                }
                active={filtri.periodo === "in_ritardo"}
              />
              <OperationalKpiCard
                label="Da preventivare"
                value={ora.senzaPreventivo.length}
                icon={FileCheck}
                tone="green"
                hint="completati o firmati"
                onClick={() =>
                  imposta({ ...FILTRI_SOPRALLUOGHI, soloSenzaPreventivo: true })
                }
                active={filtri.soloSenzaPreventivo}
              />
            </>
          )}
        </div>
      )}
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <OperationalViewSwitch
            value={vista}
            label="Vista sopralluoghi"
            onChange={(v) =>
              setParams(
                (prima) => {
                  const p = new URLSearchParams(prima);
                  p.set("sop_ambito", archive.scope);
                  if (v === "pipeline") p.delete("sop_vista");
                  else p.set("sop_vista", v);
                  return p;
                },
                { replace: true },
              )
            }
          />
          <OperationalHelp>
            Trascina la scheda nella fase desiderata oppure usa l’icona con le
            frecce. Firma, preventivo e pianificazione aprono il passaggio
            dedicato.
          </OperationalHelp>
          <div className="relative min-w-52 flex-1">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
            <Input
              aria-label="Cerca per cliente, telefono, indirizzo o codice"
              placeholder="Cliente, indirizzo, codice o telefono…"
              className="h-8 pl-8 text-xs"
              value={filtri.testo}
              onChange={(e) => imposta({ testo: e.target.value })}
            />
          </div>
          <Select
            value={filtri.periodo}
            onValueChange={(v) => imposta({ periodo: v as PeriodoFiltro })}
          >
            <SelectTrigger
              aria-label="Periodo sopralluoghi"
              className="h-8 w-44 text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODI.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filtri.tecnico}
            onValueChange={(v) => imposta({ tecnico: v })}
          >
            <SelectTrigger aria-label="Tecnico" className="h-8 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutti i tecnici</SelectItem>
              <SelectItem value="nessuno">Senza tecnico</SelectItem>
              {staff.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {[u.first_name, u.last_name].filter(Boolean).join(" ") ||
                    "Utente"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!!attivi && (
            <Button
              size="sm"
              variant="ghost"
              className="h-9 gap-1 text-xs"
              onClick={azzera}
            >
              <X className="h-3.5 w-3.5" />
              Azzera filtri ({attivi})
            </Button>
          )}
        </div>
        <div
          className="flex gap-1 overflow-x-auto border-t border-slate-100 pt-2"
          role="group"
          aria-label="Fase dei sopralluoghi"
        >
          {[{ fase: "tutte", etichetta: "Tutti" }, ...FASI]
            .filter(
              (f) =>
                f.fase === "tutte" ||
                inOperationalScope(f.fase === "preventivo", archive.scope),
            )
            .map((f) => (
              <button
                key={f.fase}
                type="button"
                aria-pressed={filtri.fase === f.fase}
                onClick={() =>
                  imposta({ fase: f.fase as FasePratica | "tutte" })
                }
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium",
                  filtri.fase === f.fase
                    ? "bg-orange-50 text-orange-800 ring-1 ring-inset ring-orange-100"
                    : "text-slate-500 hover:bg-slate-50",
                )}
              >
                {f.etichetta}
                <span className="rounded-full bg-slate-100 px-1.5 text-[10px] tabular-nums text-slate-600">
                  {f.fase === "tutte"
                    ? base.filter((s) =>
                        inOperationalScope(
                          fasePratica(s) === "preventivo",
                          archive.scope,
                        ),
                      ).length
                    : conteggi[f.fase as FasePratica]}
                </span>
              </button>
            ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <OperationalArchive
            label="sopralluoghi"
            scope={archive.scope}
            onChange={(v) => archive.setScope(v, ["sop_fase", "sop_pagina"])}
            active={base.filter((s) => fasePratica(s) !== "preventivo").length}
            history={base.filter((s) => fasePratica(s) === "preventivo").length}
          />
          <span>
            {isLoading
              ? "Caricamento…"
              : isError
                ? "Dati non disponibili"
                : `${elenco.length} di ${totale} sopralluoghi`}
          </span>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              aria-pressed={!!filtri.soloSenzaPreventivo}
              onClick={() =>
                imposta({ soloSenzaPreventivo: !filtri.soloSenzaPreventivo })
              }
              className={cn(
                "hover:text-primary",
                filtri.soloSenzaPreventivo && "font-medium text-orange-700",
              )}
            >
              Solo completati senza preventivo
            </button>
            {ora.bozzeFerme.length > 0 && (
              <button
                type="button"
                aria-pressed={!!filtri.soloBozzeFerme}
                onClick={() =>
                  imposta({ soloBozzeFerme: !filtri.soloBozzeFerme })
                }
                className={cn(
                  "hover:text-primary",
                  filtri.soloBozzeFerme && "font-medium text-orange-700",
                )}
              >
                Bozze ferme da oltre 14 giorni ({ora.bozzeFerme.length})
              </button>
            )}
          </div>
        </div>
      </div>
      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <Card role="alert">
          <CardContent className="p-8 text-center">
            <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-500" />
            <p className="font-semibold">Impossibile caricare i sopralluoghi</p>
            <Button
              variant="outline"
              className="mt-3"
              onClick={() => refetch()}
            >
              Riprova
            </Button>
          </CardContent>
        </Card>
      ) : elenco.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <ClipboardList className="mx-auto mb-3 h-8 w-8 text-slate-300" />
            <p className="font-semibold">
              Nessun sopralluogo{attivi ? " per questi filtri" : ""}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {attivi
                ? "Modifica la ricerca o azzera i filtri per rivedere le pratiche."
                : "Crea il primo sopralluogo per iniziare a pianificare i rilievi."}
            </p>
            {!!attivi && (
              <Button variant="outline" className="mt-3" onClick={azzera}>
                Azzera filtri
              </Button>
            )}
          </CardContent>
        </Card>
      ) : vista === "pipeline" ? (
        <PipelineSopralluoghi
          key={companyId}
          righe={elenco}
          adesso={adesso}
          puoCreare={puoCreare}
          onMove={moveSurvey}
          saving={movement.saving}
          pianifica={setDaPianificare}
        />
      ) : (
        <>
          <OperationalTable label="Elenco sopralluoghi">
            <thead>
              <tr>
                {[
                  "Codice",
                  "Cliente",
                  "Fase",
                  "Data e ora",
                  "Tecnico",
                  "Indirizzo",
                  "Telefono",
                  "Azioni",
                ].map((label) => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {elenco
                .slice((paginaAttuale - 1) * 24, paginaAttuale * 24)
                .map((s) => {
                  const fase = fasePratica(s)!;
                  const data = quando(
                    s.scheduled_at,
                    adesso,
                    ["completato", "firmato", "preventivo"].includes(fase),
                  );
                  const href = `/azienda/sopralluoghi/${s.id}`;
                  const canPlan =
                    puoCreare &&
                    ["da_pianificare", "pianificato"].includes(fase);
                  return (
                    <tr key={s.id}>
                      <td>
                        <Link
                          to={href}
                          className="block max-w-44 truncate font-mono text-xs font-medium text-primary hover:underline"
                          title={s.code}
                        >
                          {s.code}
                        </Link>
                      </td>
                      <td>
                        <Link
                          to={href}
                          className="block min-w-36 max-w-48 truncate font-medium hover:text-primary hover:underline"
                          title={s.cliente_nome ?? undefined}
                        >
                          {s.cliente_nome || "Cliente non indicato"}
                        </Link>
                      </td>
                      <td>
                        <Badge
                          className={cn(
                            "whitespace-nowrap text-[10px]",
                            COLORI[fase].badge,
                          )}
                        >
                          {FASI.find((f) => f.fase === fase)?.etichetta}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap">
                        <span className={cn("text-xs", TONO[data.tono])}>
                          {data.testo}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-xs text-slate-500">
                        {s.tecnico_nome || "Da assegnare"}
                      </td>
                      <td>
                        <span
                          className="block min-w-48 max-w-72 truncate text-xs text-slate-500"
                          title={[s.address, s.city].filter(Boolean).join(", ")}
                        >
                          {[s.address, s.city].filter(Boolean).join(", ") ||
                            "Indirizzo da indicare"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-xs">
                        {s.cliente_telefono ? (
                          <a
                            href={`tel:${s.cliente_telefono}`}
                            className="text-primary hover:underline"
                          >
                            {s.cliente_telefono}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                          {canPlan && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => setDaPianificare(s)}
                            >
                              {fase === "da_pianificare"
                                ? "Pianifica"
                                : "Sposta data"}
                            </Button>
                          )}
                          <Button
                            asChild
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                          >
                            <Link to={href}>
                              Apri
                              <ArrowRight className="ml-1 h-3 w-3" />
                            </Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </OperationalTable>
          {pagine > 1 && (
            <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
              <span>
                Pagina {paginaAttuale} di {pagine} · {elenco.length}{" "}
                sopralluoghi
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={paginaAttuale === 1}
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                >
                  Precedenti
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={paginaAttuale === pagine}
                  onClick={() => setPagina((p) => p + 1)}
                >
                  Successivi
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      {movement.dialog}
      <PianificaSopralluogoDialog
        sopralluogo={daPianificare}
        onClose={() => setDaPianificare(null)}
      />
    </div>
  );
}
