/**
 * Pagina lista progetti FV — landing del modulo Fotovoltaico.
 * §52 — Dashboard analytics impresa con KPI principali + tabella progetti.
 * Layout v2 — replica mockup HTML con hero gradient navy + KPI a colori.
 */

import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sun,
  Plus,
  Search,
  TrendingUp,
  FileText,
  Trash2,
  ExternalLink,
  Settings,
  Boxes,
  ArrowLeft,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useProgetti,
  useStatsAzienda,
  useEliminaProgetto,
} from "@/lib/fotovoltaico/queries";
import { importoPreventivoFv, type ImportoPreventivoFvInput } from "@/lib/fotovoltaico/importoPreventivo";

/** Una bozza col prezzo a corpo mostrava 0 € finché non si ricalcolava. */
const importoFv = (p: unknown) => importoPreventivoFv(p as ImportoPreventivoFvInput);
import { FvCard, FvKpi, FvChip, FvCallout } from "@/lib/fotovoltaico/wizardUI";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useTableSelection } from "@/hooks/useTableSelection";
import { ModuloBulkToolbar } from "@/components/moduli/ModuloBulkToolbar";
import { FV_ARCHETIPI_LABEL } from "@/lib/fotovoltaico/tipi";
import { CercaConFiltri, PannelloFiltri, PilloleFiltro, RigaMobile } from "@/components/mobile/FiltriMobile";

const STATI_LABEL = {
  bozza: { label: "Bozza", variant: "default" as const },
  configurato: { label: "Configurato", variant: "navy" as const },
  emesso: { label: "Emesso", variant: "orange" as const },
  firmato: { label: "Firmato", variant: "green" as const },
  annullato: { label: "Annullato", variant: "red" as const },
};

const ARCHETIPI_LABEL = FV_ARCHETIPI_LABEL;

export default function FotovoltaicoIndex() {
  const navigate = useNavigate();
  const permissions = usePermissions();
  // Dato "impresa" (margine medio): visibile solo con permesso margini/costi
  // NELL'AZIENDA SELEZIONATA. Azioni gestione preventivo (crea/annulla progetto):
  // canEditPreventivi, così la staff marketing può creare preventivi FV in
  // un'azienda pur senza vedere i margini. Prima usava il ruolo GLOBALE.
  const canManagePreventivo = permissions.canEditPreventivi;
  const canViewImpresa = permissions.canViewMargins || permissions.canViewCosts;
  // Selezione multipla + azioni bulk (feature origin/main) — indipendente dai permessi.
  const companyId = useEffectiveCompanyId();
  const selBulk = useTableSelection();

  // Chi può usare il modulo lo decide UNA cosa sola: la funzione di piano
  // `modulo_fotovoltaico_attivo`, controllata dalla rotta (FeatureRoute in
  // companyRoutes.tsx) — la stessa che guardano il menu, la scheda nei moduli
  // di vendita, i preventivi dell'opportunità e il salvataggio del progetto.
  // Fino al 21/09/2026 questa pagina guardava ANCHE due colonne vecchie
  // dell'azienda, che nessuna schermata accende più: `fv_modulo_attivo`
  // bloccava con «contatta il team» chi aveva il modulo nel piano (Renova,
  // Best Infissi, Bagni Milano), e `fv_setup_completato` mostrava il
  // benvenuto AL POSTO dell'elenco a chi di progetti ne aveva già (Green
  // Energy 18, Suntech 7). Il caso «nessun progetto ancora» lo gestisce
  // l'elenco qui sotto.
  const progettiQuery = useProgetti();
  const progetti = useMemo(() => progettiQuery.data ?? [], [progettiQuery.data]);
  const { data: stats } = useStatsAzienda();
  const eliminaProgetto = useEliminaProgetto();

  const [search, setSearch] = useState("");
  const [filtroStato, setFiltroStato] = useState<string>("all");
  const [filtroArchetipo, setFiltroArchetipo] = useState<string>("all");
  const [filtriMobiliAperti, setFiltriMobiliAperti] = useState(false);

  const progettiFiltrati = useMemo(() => {
    const s = search.trim().toLowerCase();
    return progetti.filter((p) => {
      if (filtroStato !== "all" && p.stato !== filtroStato) return false;
      if (filtroArchetipo !== "all" && p.archetipo !== filtroArchetipo) return false;
      if (s) {
        const blob = `${p.numero ?? ""} ${p.titolo ?? ""} ${p.indirizzo ?? ""} ${p.cliente_nome ?? ""}`.toLowerCase();
        if (!blob.includes(s)) return false;
      }
      return true;
    });
  }, [progetti, search, filtroStato, filtroArchetipo]);

  const handleDelete = async (id: string, titolo: string) => {
    if (!confirm(`Annullare il progetto "${titolo}"? Sarà spostato in archivio.`)) return;
    try {
      await eliminaProgetto.mutateAsync(id);
      toast.success("Progetto annullato");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* HERO HEADER gradient navy */}
      <div
        className="relative overflow-hidden text-white"
        style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #2C5184 100%)" }}
      >
        <div
          className="absolute -top-1/3 -right-10 w-2/5 h-[160%] pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(249,115,22,0.18) 0%, transparent 60%)",
          }}
        />
        <div
          className="absolute right-8 top-6 text-7xl opacity-10 select-none max-sm:hidden"
          aria-hidden
        >
          ☀
        </div>
        {/* Telefono: titolo e «Nuovo» su una riga; impostazioni e componenti si curano dal computer. */}
        <div className="relative max-w-[1400px] mx-auto px-3 sm:px-8 py-4 sm:py-8 flex items-center justify-between flex-wrap gap-3 sm:gap-4 max-sm:flex-nowrap max-sm:py-3">
          <div className="min-w-0 flex-1">
            <Link
              to="/azienda/marketing/preventivi"
              className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-medium text-blue-100/90 hover:text-white mb-2 transition-colors max-sm:mb-1"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="max-sm:hidden">Torna ai Preventivi</span><span className="sm:hidden">Preventivi</span>
            </Link>
            <div className="text-[10px] sm:text-xs uppercase tracking-widest font-semibold mb-1 text-orange-200 max-sm:hidden">
              ★ MARKETING & VENDITA
            </div>
            <h1 className="text-xl sm:text-3xl font-bold tracking-tight max-sm:text-lg">Fotovoltaico</h1>
            <p className="hidden sm:block text-sm text-blue-100 mt-1">
              I tuoi preventivi fotovoltaici, sempre sotto controllo.
            </p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto max-sm:w-auto max-sm:shrink-0">
            {canManagePreventivo && (
              <>
                <Button
                  asChild
                  size="default"
                  variant="outline"
                  className="bg-white/10 backdrop-blur border-white/20 text-white hover:bg-white/20 flex-1 sm:flex-initial sm:size-lg h-10 sm:h-11 text-xs sm:text-sm max-sm:hidden"
                >
                  <Link to="/azienda/impostazioni/template-preventivi?tab=moduli-vendita&modulo=fotovoltaico" aria-label="Impostazioni modulo fotovoltaico">
                    <Settings className="h-4 w-4 sm:mr-1.5" />
                    <span className="hidden sm:inline">Impostazioni</span>
                  </Link>
                </Button>
                <Button
                  asChild
                  size="default"
                  variant="outline"
                  className="bg-white/10 backdrop-blur border-white/20 text-white hover:bg-white/20 flex-1 sm:flex-initial sm:size-lg h-10 sm:h-11 text-xs sm:text-sm max-sm:hidden"
                >
                  <Link to="/azienda/marketing/fotovoltaico/componenti" aria-label="Componenti FV (pannelli, inverter, accumuli)">
                    <Boxes className="h-4 w-4 sm:mr-1.5" />
                    <span className="hidden sm:inline">Componenti</span>
                  </Link>
                </Button>
                <Button
                  asChild
                  size="default"
                  className="bg-gradient-to-br from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500 text-white shadow-lg border-0 flex-1 sm:flex-initial sm:size-lg h-10 sm:h-11 text-xs sm:text-sm max-sm:h-9 max-sm:px-3"
                >
                  <Link to="/azienda/marketing/fotovoltaico/nuovo">
                    <Plus className="h-4 w-4 mr-1.5" />
                    <span className="sm:hidden">Nuovo</span>
                    <span className="hidden sm:inline">Nuovo progetto</span>
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-3 sm:px-8 py-4 sm:py-6 space-y-4 sm:space-y-5 max-sm:space-y-3 max-sm:py-3">
        {/* KPI Dashboard — telefono: quattro numeri, 2 per riga (il margine resta al computer) */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 sm:gap-3 max-sm:gap-2">
          <FvKpi
            label="Progetti totali"
            value={stats?.progetti_totali ?? 0}
          />
          <FvKpi
            label="Mese corrente"
            value={stats?.progetti_mese_corrente ?? 0}
            trend={
              stats?.firmati_mese_corrente
                ? { dir: "up", text: `${stats.firmati_mese_corrente} firmati` }
                : undefined
            }
            variant="green"
          />
          <FvKpi
            label="Tasso conversione"
            value={
              stats?.tasso_conversione != null
                ? `${(Number(stats.tasso_conversione) * 100).toFixed(0)}`
                : "—"
            }
            unit="%"
            variant="orange"
          />
          <FvKpi
            label="Ticket medio"
            value={
              stats?.ticket_medio != null
                ? Number(stats.ticket_medio).toLocaleString("it-IT", {
                    maximumFractionDigits: 0,
                  })
                : "—"
            }
            unit="€"
          />
          {canViewImpresa && (
            <FvKpi
              className="max-sm:hidden"
              label="Margine medio"
              value={
                stats?.margine_medio != null
                  ? `${(Number(stats.margine_medio) * 100).toFixed(1)}`
                  : "—"
              }
              unit="%"
              variant="green"
            />
          )}
        </div>

        {/* Telefono: ricerca e filtri in un foglio (stato, archetipo). */}
        <CercaConFiltri
          className="sm:hidden"
          valore={search}
          onCambia={setSearch}
          segnaposto="Cerca progetto"
          filtriAttivi={(filtroStato !== "all" ? 1 : 0) + (filtroArchetipo !== "all" ? 1 : 0)}
          onApriFiltri={() => setFiltriMobiliAperti(true)}
        />
        <PannelloFiltri
          aperto={filtriMobiliAperti}
          onAperto={setFiltriMobiliAperti}
          attivi={(filtroStato !== "all" ? 1 : 0) + (filtroArchetipo !== "all" ? 1 : 0)}
          onAzzera={() => { setFiltroStato("all"); setFiltroArchetipo("all"); }}
          risultati={progettiFiltrati.length}
        >
          <PilloleFiltro
            titolo="Stato"
            valore={filtroStato}
            onScegli={setFiltroStato}
            scelte={[
              { value: "all", label: "Tutti" },
              ...Object.entries(STATI_LABEL)
                .filter(([k]) => k !== "annullato")
                .map(([k, v]) => ({ value: k, label: v.label, n: progetti.filter((p) => p.stato === k).length })),
            ]}
          />
          <PilloleFiltro
            titolo="Archetipo"
            valore={filtroArchetipo}
            onScegli={setFiltroArchetipo}
            scelte={[
              { value: "all", label: "Tutti" },
              ...Object.entries(ARCHETIPI_LABEL).map(([k, v]) => ({ value: k, label: v })),
            ]}
          />
        </PannelloFiltri>

        {/* Filtri */}
        <FvCard className="max-sm:hidden">
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-3 sm:items-center">
            <div className="relative w-full sm:flex-1 sm:min-w-64 sm:max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <Input
                placeholder="Cerca per numero, cliente, indirizzo…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-10 sm:h-10"
                aria-label="Cerca progetto fotovoltaico"
              />
            </div>
            <div className="grid grid-cols-2 sm:flex sm:flex-row gap-2 sm:gap-3">
              <Select value={filtroStato} onValueChange={setFiltroStato}>
                <SelectTrigger className="w-full sm:w-44 h-10">
                  <SelectValue placeholder="Stato" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli stati</SelectItem>
                  {/* "annullato" escluso: la view dashboard filtra annullato=false,
                      quindi quel filtro darebbe sempre lista vuota. */}
                  {Object.entries(STATI_LABEL)
                    .filter(([k]) => k !== "annullato")
                    .map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Select value={filtroArchetipo} onValueChange={setFiltroArchetipo}>
                <SelectTrigger className="w-full sm:w-52 h-10">
                  <SelectValue placeholder="Archetipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli archetipi</SelectItem>
                  {Object.entries(ARCHETIPI_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <span className="text-xs text-slate-500 sm:ml-auto">
              {progettiFiltrati.length} di {progetti.length}
            </span>
          </div>
        </FvCard>

        {/* Errore di caricamento — distinto dallo stato vuoto reale */}
        {progettiQuery.isError && (
          <FvCallout
            variant="error"
            title="Impossibile caricare i progetti"
            icon={<AlertTriangle className="h-4 w-4" />}
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => progettiQuery.refetch()}
                disabled={progettiQuery.isFetching}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-1.5 ${progettiQuery.isFetching ? "animate-spin" : ""}`}
                />
                Riprova
              </Button>
            }
          >
            Si è verificato un errore nel recupero dell'elenco progetti. Controlla la connessione e
            riprova.
          </FvCallout>
        )}

        {/* Tabella o empty state */}
        {progettiQuery.isSuccess && progetti.length === 0 && (
          <FvCard>
            <div className="py-16 text-center space-y-4">
              <div className="relative w-fit mx-auto">
                <Sun className="h-20 w-20 text-amber-300/60" />
                <FileText className="absolute -bottom-2 -right-2 h-10 w-10 text-slate-300 bg-white rounded-full p-1.5 border border-slate-200" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Nessun progetto ancora</h3>
                <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                  Crea il tuo primo progetto fotovoltaico in 15 minuti — analisi tetto, calcolo
                  finanziario, PDF Vendita personalizzato.
                </p>
              </div>
              {canManagePreventivo ? (
                <Button
                  asChild
                  size="lg"
                  className="bg-gradient-to-br from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500 shadow-lg"
                >
                  <Link to="/azienda/marketing/fotovoltaico/nuovo">
                    <Plus className="h-4 w-4 mr-2" />
                    Crea il tuo primo progetto
                  </Link>
                </Button>
              ) : (
                <p className="text-sm text-slate-500">
                  Chiedi a un admin aziendale di creare il primo progetto.
                </p>
              )}
              <FvCallout variant="tip" title="Per ottenere il massimo dal modulo" >
                <ul className="space-y-1.5 text-left">
                  <li>
                    Aggiungi pannelli, inverter e accumuli in{" "}
                    <Link to="/azienda/marketing/fotovoltaico/componenti" className="text-orange-600 underline">
                      Componenti FV
                    </Link>{" "}
                    (puoi precompilarli dal listino già caricato).
                  </li>
                  <li>
                    Aggiungi le voci di manodopera in{" "}
                    <Link to="/azienda/impostazioni/tariffe" className="text-orange-600 underline">
                      Listino → Manodopera e servizi
                    </Link>.
                  </li>
                  <li>
                    Parti da un cliente del CRM: il modulo precompila contatti, indirizzo e consumi
                    se disponibili.
                  </li>
                </ul>
              </FvCallout>
            </div>
          </FvCard>
        )}

        {progetti.length > 0 && (
          <>
          {/* ── MOBILE: card list ── */}
          <div className="sm:hidden space-y-2">
            {progettiFiltrati.length === 0 ? (
              <FvCard compact>
                <div className="text-center py-8 text-sm text-slate-500">
                  Nessun progetto trovato con i filtri attuali.
                  <Button
                    variant="link"
                    size="sm"
                    className="ml-1 h-auto px-1 text-orange-600"
                    onClick={() => {
                      setSearch("");
                      setFiltroStato("all");
                      setFiltroArchetipo("all");
                    }}
                  >
                    Azzera filtri
                  </Button>
                </div>
              </FvCard>
            ) : (
              <div className="divide-y divide-border overflow-hidden rounded-xl border bg-white">
                {progettiFiltrati.map((p) => {
                  const stato = STATI_LABEL[p.stato as keyof typeof STATI_LABEL] ?? STATI_LABEL.bozza;
                  const importo = importoFv(p);
                  return (
                    <RigaMobile
                      key={p.id}
                      to={`/azienda/marketing/fotovoltaico/${p.id}`}
                      titolo={p.cliente_nome || p.titolo || "—"}
                      sottotitolo={[p.numero, p.potenza_kwp != null ? `${Number(p.potenza_kwp).toFixed(2)} kWp` : null].filter(Boolean).join(" · ")}
                      valore={importo != null ? `€ ${Number(importo).toLocaleString("it-IT", { maximumFractionDigits: 0 })}` : "—"}
                      stato={<FvChip variant={stato.variant}>{stato.label}</FvChip>}
                    />
                  );
                })}
              </div>
            )}
          </div>

          <ModuloBulkToolbar
            tableName="fv_progetti"
            companyId={companyId}
            selectedIds={selBulk.selected}
            statoOptions={(Object.keys(STATI_LABEL) as (keyof typeof STATI_LABEL)[]).map((k) => ({ value: k as string, label: STATI_LABEL[k].label }))}
            onClear={selBulk.clear}
            onDone={() => { selBulk.clear(); void progettiQuery.refetch(); }}
          />
          {/* ── DESKTOP: tabella ── */}
          <FvCard compact className="hidden sm:block">
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableHead className="w-10">
                      <Checkbox
                        checked={progettiFiltrati.length > 0 && progettiFiltrati.every((p) => selBulk.isSelected(p.id))}
                        onCheckedChange={() => selBulk.toggleAll(progettiFiltrati.map((p) => p.id))}
                        aria-label="Seleziona tutti"
                      />
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                      Numero
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                      Cliente / Titolo
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                      Archetipo
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 text-right">
                      Potenza
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 text-right">
                      Importo
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 text-right">
                      Payback
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                      Stato
                    </TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {progettiFiltrati.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-slate-500">
                        Nessun progetto trovato con i filtri attuali.
                        <Button
                          variant="link"
                          size="sm"
                          className="ml-1 h-auto px-1 text-orange-600"
                          onClick={() => {
                            setSearch("");
                            setFiltroStato("all");
                            setFiltroArchetipo("all");
                          }}
                        >
                          Azzera filtri
                        </Button>
                      </TableCell>
                    </TableRow>
                  )}
                  {progettiFiltrati.map((p) => {
                    const stato =
                      STATI_LABEL[p.stato as keyof typeof STATI_LABEL] ?? STATI_LABEL.bozza;
                    return (
                      <TableRow
                        key={p.id}
                        className="cursor-pointer hover:bg-orange-50/50 transition-colors"
                        onClick={() => navigate(`/azienda/marketing/fotovoltaico/${p.id}`)}
                      >
                        <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selBulk.isSelected(p.id)}
                            onCheckedChange={() => selBulk.toggle(p.id)}
                            aria-label="Seleziona riga"
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs font-semibold text-slate-900">
                          {p.numero}
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold text-slate-900">
                            {p.cliente_nome ?? "—"}
                          </div>
                          <div className="text-xs text-slate-500 truncate max-w-xs">
                            {p.titolo}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {ARCHETIPI_LABEL[p.archetipo as keyof typeof ARCHETIPI_LABEL] ??
                            p.archetipo}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {p.potenza_kwp != null
                            ? `${Number(p.potenza_kwp).toFixed(2)} kWp`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {importoFv(p) != null
                            ? `€ ${Number(importoFv(p)).toLocaleString("it-IT", { maximumFractionDigits: 0 })}`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {p.payback_anni != null ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                              <TrendingUp className="h-3 w-3" />
                              {p.payback_anni}a
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          <FvChip variant={stato.variant}>{stato.label}</FvChip>
                        </TableCell>
                        <TableCell
                          className="text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" asChild aria-label="Apri progetto">
                              <Link to={`/azienda/marketing/fotovoltaico/${p.id}`}>
                                <ExternalLink className="h-4 w-4" />
                              </Link>
                            </Button>
                            {canManagePreventivo && p.stato !== "firmato" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(p.id, p.titolo)}
                                aria-label="Annulla progetto"
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </FvCard>
          </>
        )}
      </div>
    </div>
  );
}
