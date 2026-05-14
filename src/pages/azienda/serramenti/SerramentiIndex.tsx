/**
 * SerramentiIndex — landing del modulo Preventivatore Serramenti.
 *
 * Layout V4 — pensato per scalare a migliaia di preventivi:
 *  - Hero header gradient navy + accent arancione brand
 *  - 6 KPI informativi (no più cliccabili — distrazione)
 *  - Search inline + bottone "Filtri" che apre Sheet laterale
 *  - Tutti i filtri avanzati (stato, periodo, importo, materiale, tipo
 *    intervento, sort) dentro lo Sheet
 *  - Tabella desktop + card view mobile, con paginazione client-side
 *    (50 per pagina) — riduce DOM e mantiene UI fluida su dataset grandi
 *  - Badge "n filtri attivi" sul bottone Filtri
 */
import { useMemo, useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { OnboardingCard } from "@/components/serramenti/OnboardingCard";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  RectangleVertical, Plus, Search, Trash2, ExternalLink, Loader2,
  ChevronRight, ChevronLeft, Settings, TrendingUp, FileText, Layers, Trophy,
  XCircle, Wallet, SlidersHorizontal, X, User, MapPin, Package2, Sparkles,
  Briefcase, ClipboardList, FileSignature,
  AlertTriangle, CheckCircle2,
} from "lucide-react";
import { useProgetti, useDeleteProgetto } from "@/lib/serramenti/queries";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { it } from "date-fns/locale";
import type { SrStatoProgetto } from "@/types/serramenti";
// Costanti UI condivise con SerramentiWizard (status badge azionabile).
import {
  STATI_LABEL, STATI_APERTI, STATI_VINTI, STATI_PERSI,
} from "@/lib/serramenti/statoLabels";

type PeriodKey = "all" | "7d" | "30d" | "90d" | "ytd";
const PERIOD_LABELS: Record<PeriodKey, string> = {
  all: "Sempre",
  "7d": "Ultimi 7 giorni",
  "30d": "Ultimi 30 giorni",
  "90d": "Ultimi 90 giorni",
  ytd: "Anno corrente",
};

const MATERIALI: Array<{ value: string; label: string }> = [
  { value: "alluminio", label: "Alluminio" },
  { value: "pvc", label: "PVC" },
  { value: "legno", label: "Legno" },
  { value: "legno_alluminio", label: "Legno-Alluminio" },
];

const TIPI_INTERVENTO: Array<{ value: string; label: string }> = [
  { value: "sostituzione", label: "Sostituzione" },
  { value: "nuova_costruzione", label: "Nuova costruzione" },
  { value: "ristrutturazione", label: "Ristrutturazione" },
  { value: "manutenzione", label: "Manutenzione" },
];

const SCHEMI_PAGAMENTO_LABELS: Record<string, string> = {
  tutto_finanziato: "Tutto finanziato",
  acconto_finanziato: "Acconto + finanziato",
  due_acconti_finanziato: "2 acconti + finanziato",
  due_acconti_saldo: "2 acconti + saldo",
  tre_step: "3 step (firma + merce + saldo)",
  personalizzato: "Personalizzato",
};

const BONUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "any", label: "Tutti" },
  { value: "50", label: "Ecobonus 50%" },
  { value: "65", label: "Ecobonus 65%" },
  { value: "none", label: "Senza bonus" },
];

const PROVINCE_IT: string[] = [
  "AG","AL","AN","AO","AP","AQ","AR","AT","AV","BA","BG","BI","BL","BN","BO","BR","BS","BT","BZ",
  "CA","CB","CE","CH","CL","CN","CO","CR","CS","CT","CZ","EN","FC","FE","FG","FI","FM","FR","GE","GO","GR",
  "IM","IS","KR","LC","LE","LI","LO","LT","LU","MB","MC","ME","MI","MN","MO","MS","MT","NA","NO","NU",
  "OR","PA","PC","PD","PE","PG","PI","PN","PO","PR","PT","PU","PV","PZ","RA","RC","RE","RG","RI","RM","RN","RO",
  "SA","SI","SO","SP","SR","SS","SU","SV","TA","TE","TN","TO","TP","TR","TS","TV","UD","VA","VB","VC","VE","VI","VR","VT","VV",
];

type TriState = "all" | "yes" | "no";

type SortKey = "recent" | "value_desc" | "value_asc" | "code_asc";
const SORT_LABELS: Record<SortKey, string> = {
  recent: "Più recenti",
  value_desc: "Importo (alto → basso)",
  value_asc: "Importo (basso → alto)",
  code_asc: "Codice (A → Z)",
};

const PAGE_SIZE = 50;

const fmtEur = (n: number) =>
  `€ ${Number(n).toLocaleString("it-IT", { maximumFractionDigits: 0 })}`;

const fmtEurRangeOrSingle = (min?: number | null, max?: number | null) => {
  const minN = Number(min ?? 0);
  const maxN = Number(max ?? 0);
  if (!minN && !maxN) return "—";
  if (!minN) return fmtEur(maxN);
  if (!maxN) return fmtEur(minN);
  if (Math.abs(minN - maxN) < 0.01) return fmtEur(maxN);
  return `${fmtEur(minN)} – ${fmtEur(maxN)}`;
};

export default function SerramentiIndex() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const companyId = useEffectiveCompanyId();
  const { data: progetti = [], isLoading, isError, refetch } = useProgetti();
  const deleteMut = useDeleteProgetto();

  // Lista commerciali/consulenti dal team aziendale (profiles).
  // Usata sia per il dropdown filtro sia per mostrare il nome nella tabella.
  const { data: teamMembers = [] } = useQuery({
    queryKey: ["sr-team-members", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .eq("company_id", companyId!)
        .order("first_name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }>;
    },
  });
  const teamById = useMemo(() => {
    const m = new Map<string, string>();
    teamMembers.forEach((t) => {
      const name = [t.first_name, t.last_name].filter(Boolean).join(" ") || t.email || t.id.slice(0, 6);
      m.set(t.id, name);
    });
    return m;
  }, [teamMembers]);

  // Filtri base
  const [search, setSearch] = useState("");
  const [statoGroup, setStatoGroup] = useState<string>(searchParams.get("gruppo") ?? "all");
  const [filtroStato, setFiltroStato] = useState<string>("all");
  const [periodo, setPeriodo] = useState<PeriodKey>("all");
  const [sortBy, setSortBy] = useState<SortKey>("recent");
  const [importoMin, setImportoMin] = useState<string>("");
  const [importoMax, setImportoMax] = useState<string>("");
  const [materialeFiltro, setMaterialeFiltro] = useState<string>("all");
  const [tipoInterventoFiltro, setTipoInterventoFiltro] = useState<string>("all");

  // Filtri commerciali avanzati
  const [consulenteFiltro, setConsulenteFiltro] = useState<string>("all");
  const [provinciaFiltro, setProvinciaFiltro] = useState<string>("all");
  const [pezziMin, setPezziMin] = useState<string>("");
  const [pezziMax, setPezziMax] = useState<string>("");
  const [mqMin, setMqMin] = useState<string>("");
  const [mqMax, setMqMax] = useState<string>("");
  const [bonusFiltro, setBonusFiltro] = useState<string>("any");
  const [schemaFiltro, setSchemaFiltro] = useState<string>("all");
  const [opportunitaFiltro, setOpportunitaFiltro] = useState<TriState>("all");
  const [convertitoFiltro, setConvertitoFiltro] = useState<TriState>("all");
  const [pdfFiltro, setPdfFiltro] = useState<TriState>("all");
  const [firmatoFiltro, setFirmatoFiltro] = useState<TriState>("all");
  const [sopralluogoFiltro, setSopralluogoFiltro] = useState<TriState>("all");

  const [page, setPage] = useState<number>(1);

  // Sheet filtri aperto/chiuso
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [toDelete, setToDelete] = useState<{ id: string; code: string } | null>(null);

  // Cutoff date in base al periodo
  const cutoff = useMemo(() => {
    const now = new Date();
    switch (periodo) {
      case "7d": return subDays(now, 7);
      case "30d": return subDays(now, 30);
      case "90d": return subDays(now, 90);
      case "ytd": return new Date(now.getFullYear(), 0, 1);
      default: return null;
    }
  }, [periodo]);

  // Conta filtri attivi (search escluso — è inline)
  const activeFiltersCount = useMemo(() => {
    let n = 0;
    if (statoGroup !== "all") n++;
    if (filtroStato !== "all") n++;
    if (periodo !== "all") n++;
    if (sortBy !== "recent") n++;
    if (importoMin.trim() !== "") n++;
    if (importoMax.trim() !== "") n++;
    if (materialeFiltro !== "all") n++;
    if (tipoInterventoFiltro !== "all") n++;
    if (consulenteFiltro !== "all") n++;
    if (provinciaFiltro !== "all") n++;
    if (pezziMin.trim() !== "") n++;
    if (pezziMax.trim() !== "") n++;
    if (mqMin.trim() !== "") n++;
    if (mqMax.trim() !== "") n++;
    if (bonusFiltro !== "any") n++;
    if (schemaFiltro !== "all") n++;
    if (opportunitaFiltro !== "all") n++;
    if (convertitoFiltro !== "all") n++;
    if (pdfFiltro !== "all") n++;
    if (firmatoFiltro !== "all") n++;
    if (sopralluogoFiltro !== "all") n++;
    return n;
  }, [statoGroup, filtroStato, periodo, sortBy, importoMin, importoMax, materialeFiltro, tipoInterventoFiltro,
    consulenteFiltro, provinciaFiltro, pezziMin, pezziMax, mqMin, mqMax, bonusFiltro, schemaFiltro,
    opportunitaFiltro, convertitoFiltro, pdfFiltro, firmatoFiltro, sopralluogoFiltro]);

  // Lista filtrata + sortata
  const progettiFiltrati = useMemo(() => {
    const s = search.trim().toLowerCase();
    const min = importoMin.trim() === "" ? null : Number(importoMin);
    const max = importoMax.trim() === "" ? null : Number(importoMax);
    const pMin = pezziMin.trim() === "" ? null : Number(pezziMin);
    const pMax = pezziMax.trim() === "" ? null : Number(pezziMax);
    const mMin = mqMin.trim() === "" ? null : Number(mqMin);
    const mMax = mqMax.trim() === "" ? null : Number(mqMax);

    let out = progetti.filter((p) => {
      // Gruppo stato
      if (statoGroup === "aperti" && !STATI_APERTI.includes(p.stato as SrStatoProgetto)) return false;
      if (statoGroup === "vinti" && !STATI_VINTI.includes(p.stato as SrStatoProgetto)) return false;
      if (statoGroup === "persi" && !STATI_PERSI.includes(p.stato as SrStatoProgetto)) return false;
      // Stato specifico
      if (filtroStato !== "all" && p.stato !== filtroStato) return false;
      // Periodo
      if (cutoff && p.updated_at && new Date(p.updated_at) < cutoff) return false;
      // Importo: usiamo totale_max come riferimento
      const importoRef = Number(p.totale_max ?? p.totale_min ?? 0);
      if (min != null && Number.isFinite(min) && importoRef < min) return false;
      if (max != null && Number.isFinite(max) && importoRef > max) return false;
      // Materiale
      if (materialeFiltro !== "all" && p.materiale_principale !== materialeFiltro) return false;
      // Tipo intervento
      if (tipoInterventoFiltro !== "all" && p.tipo_intervento !== tipoInterventoFiltro) return false;
      // Commerciale / Consulente
      if (consulenteFiltro !== "all") {
        if (consulenteFiltro === "none") {
          if (p.consulente_id) return false;
        } else if (p.consulente_id !== consulenteFiltro) return false;
      }
      // Provincia cantiere
      if (provinciaFiltro !== "all" && p.cantiere_provincia !== provinciaFiltro) return false;
      // N° pezzi
      const pezzi = Number(p.totale_serramenti ?? 0);
      if (pMin != null && Number.isFinite(pMin) && pezzi < pMin) return false;
      if (pMax != null && Number.isFinite(pMax) && pezzi > pMax) return false;
      // m²
      const mq = Number(p.metri_quadri_totali ?? 0);
      if (mMin != null && Number.isFinite(mMin) && mq < mMin) return false;
      if (mMax != null && Number.isFinite(mMax) && mq > mMax) return false;
      // Bonus Ecobonus
      if (bonusFiltro === "50" && p.detrazione_aliquota !== 50) return false;
      if (bonusFiltro === "65" && p.detrazione_aliquota !== 65) return false;
      if (bonusFiltro === "none" && p.detrazione_aliquota != null) return false;
      // Schema pagamento
      if (schemaFiltro !== "all" && p.schema_pagamento !== schemaFiltro) return false;
      // Linking CRM / Ordini / Documenti (TriState)
      if (opportunitaFiltro === "yes" && !p.opportunita_id) return false;
      if (opportunitaFiltro === "no" && p.opportunita_id) return false;
      if (convertitoFiltro === "yes" && !p.ordine_id) return false;
      if (convertitoFiltro === "no" && p.ordine_id) return false;
      if (pdfFiltro === "yes" && !p.pdf_url) return false;
      if (pdfFiltro === "no" && p.pdf_url) return false;
      if (firmatoFiltro === "yes" && !p.firmato_il) return false;
      if (firmatoFiltro === "no" && p.firmato_il) return false;
      if (sopralluogoFiltro === "yes" && !p.sopralluogo_id) return false;
      if (sopralluogoFiltro === "no" && p.sopralluogo_id) return false;
      // Search
      if (s) {
        const blob = `${p.code ?? ""} ${p.cliente_nome ?? ""} ${p.cliente_cognome ?? ""} ${p.cantiere_citta ?? ""} ${p.cantiere_provincia ?? ""}`.toLowerCase();
        if (!blob.includes(s)) return false;
      }
      return true;
    });

    out = [...out].sort((a, b) => {
      if (sortBy === "value_desc") return Number(b.totale_max ?? 0) - Number(a.totale_max ?? 0);
      if (sortBy === "value_asc") return Number(a.totale_max ?? 0) - Number(b.totale_max ?? 0);
      if (sortBy === "code_asc") return (a.code ?? "").localeCompare(b.code ?? "");
      const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return tb - ta;
    });
    return out;
  }, [progetti, search, statoGroup, filtroStato, cutoff, sortBy, importoMin, importoMax,
    materialeFiltro, tipoInterventoFiltro, consulenteFiltro, provinciaFiltro,
    pezziMin, pezziMax, mqMin, mqMax, bonusFiltro, schemaFiltro,
    opportunitaFiltro, convertitoFiltro, pdfFiltro, firmatoFiltro, sopralluogoFiltro]);

  // Reset pagina quando cambiano i filtri o la ricerca (no jumping su pagine
  // inesistenti dopo restringimento dataset). Eseguito come effect: side
  // effect setState dentro useMemo violava le regole di purity di React.
  useEffect(() => {
    setPage(1);
  }, [search, statoGroup, filtroStato, periodo, sortBy, importoMin, importoMax,
    materialeFiltro, tipoInterventoFiltro, consulenteFiltro, provinciaFiltro,
    pezziMin, pezziMax, mqMin, mqMax, bonusFiltro, schemaFiltro,
    opportunitaFiltro, convertitoFiltro, pdfFiltro, firmatoFiltro, sopralluogoFiltro]);

  // Paginazione
  const totalPages = Math.max(1, Math.ceil(progettiFiltrati.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginaCorrente = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return progettiFiltrati.slice(start, start + PAGE_SIZE);
  }, [progettiFiltrati, currentPage]);

  // KPI globali (sempre sul dataset completo + filtro periodo)
  const stats = useMemo(() => {
    const inPeriod = cutoff
      ? progetti.filter((p) => p.updated_at && new Date(p.updated_at) >= cutoff)
      : progetti;
    const aperti = inPeriod.filter((p) => STATI_APERTI.includes(p.stato as SrStatoProgetto));
    const vinti = inPeriod.filter((p) => STATI_VINTI.includes(p.stato as SrStatoProgetto));
    const persi = inPeriod.filter((p) => STATI_PERSI.includes(p.stato as SrStatoProgetto));
    const decisi = vinti.length + persi.length;
    const conv = decisi > 0 ? Math.round((vinti.length / decisi) * 100) : null;
    const valorePipeline = aperti.reduce(
      (acc, p) => acc + (Number(p.totale_min ?? 0) + Number(p.totale_max ?? 0)) / 2,
      0,
    );
    const valoreVinti = vinti.reduce(
      (acc, p) => acc + (Number(p.totale_min ?? 0) + Number(p.totale_max ?? 0)) / 2,
      0,
    );
    const ticketMedio = vinti.length > 0 ? valoreVinti / vinti.length : null;

    // ─── Dashboard "Azioni del giorno" ──────────────────────────────────
    // Preventivi consegnati/in_valutazione la cui validità scade entro 7
    // giorni (o già scaduta) → il commerciale deve richiamare il cliente.
    // Calcolato SU TUTTO il dataset (no filtro periodo) perché sono richiami
    // operativi non analitici.
    const now = Date.now();
    const SETTE_GIORNI_MS = 7 * 24 * 60 * 60 * 1000;
    const scadenzaUrgente = progetti.filter((p) => {
      if (p.stato !== "consegnato" && p.stato !== "in_valutazione") return false;
      if (!p.valido_fino_data) return false;
      const giornoScadenza = new Date(p.valido_fino_data).getTime();
      return giornoScadenza - now <= SETTE_GIORNI_MS; // include già scadute
    });
    const scaduti = scadenzaUrgente.filter((p) => {
      if (!p.valido_fino_data) return false;
      return new Date(p.valido_fino_data).getTime() < now;
    });
    const inScadenzaProssimi = scadenzaUrgente.filter((p) => {
      if (!p.valido_fino_data) return false;
      return new Date(p.valido_fino_data).getTime() >= now;
    });

    // Preventivi accettati ancora non convertiti in ordine (revenue da
    // sbloccare). Filtro su ordine_id IS NULL e stato='accettato'.
    const accettatiDaConvertire = progetti.filter((p) =>
      p.stato === "accettato" && !p.ordine_id,
    );

    // ─── Performance per commerciale (multi-comm dashboard) ─────────────
    // Aggrega in-period per consulente_id: count tot/vinti/persi + conversion.
    // Mostrato solo se >1 commerciale per evitare leaderboard mono-attore.
    type CommStat = {
      id: string;
      totale: number;
      vinti: number;
      persi: number;
      valoreVinti: number;
      conv: number | null;
    };
    const byComm = new Map<string, CommStat>();
    inPeriod.forEach((p) => {
      const id = p.consulente_id ?? "_unassigned";
      if (!byComm.has(id)) {
        byComm.set(id, { id, totale: 0, vinti: 0, persi: 0, valoreVinti: 0, conv: null });
      }
      const c = byComm.get(id)!;
      c.totale += 1;
      const isVinto = STATI_VINTI.includes(p.stato as SrStatoProgetto);
      const isPerso = STATI_PERSI.includes(p.stato as SrStatoProgetto);
      if (isVinto) {
        c.vinti += 1;
        c.valoreVinti += (Number(p.totale_min ?? 0) + Number(p.totale_max ?? 0)) / 2;
      }
      if (isPerso) c.persi += 1;
    });
    // Calcola conversion per ciascuno
    byComm.forEach((c) => {
      const decisi = c.vinti + c.persi;
      c.conv = decisi > 0 ? Math.round((c.vinti / decisi) * 100) : null;
    });
    const performanceByComm = Array.from(byComm.values())
      .sort((a, b) => b.valoreVinti - a.valoreVinti);

    return {
      totale: inPeriod.length,
      aperti: aperti.length,
      vinti: vinti.length,
      persi: persi.length,
      conv,
      valorePipeline,
      valoreVinti,
      ticketMedio,
      // Azioni del giorno
      scadenzaUrgente: scadenzaUrgente.length,
      scaduti,
      inScadenzaProssimi,
      accettatiDaConvertire,
      // Multi-comm leaderboard
      performanceByComm,
    };
  }, [progetti, cutoff]);

  const resetFiltri = () => {
    setSearch("");
    setStatoGroup("all");
    setFiltroStato("all");
    setPeriodo("all");
    setSortBy("recent");
    setImportoMin("");
    setImportoMax("");
    setMaterialeFiltro("all");
    setTipoInterventoFiltro("all");
    setConsulenteFiltro("all");
    setProvinciaFiltro("all");
    setPezziMin("");
    setPezziMax("");
    setMqMin("");
    setMqMax("");
    setBonusFiltro("any");
    setSchemaFiltro("all");
    setOpportunitaFiltro("all");
    setConvertitoFiltro("all");
    setPdfFiltro("all");
    setFirmatoFiltro("all");
    setSopralluogoFiltro("all");
    const next = new URLSearchParams(searchParams);
    next.delete("gruppo");
    setSearchParams(next, { replace: true });
  };

  return (
    <TooltipProvider delayDuration={200}>
    <div className="min-h-screen bg-slate-50">
      {/* HERO HEADER */}
      <div
        className="relative overflow-hidden text-white"
        style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #2C5184 100%)" }}
      >
        <div
          className="absolute -top-1/3 -right-10 w-2/5 h-[160%] pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(249,115,22,0.20) 0%, transparent 60%)" }}
        />
        <div className="absolute right-8 top-6 opacity-10 select-none" aria-hidden>
          <RectangleVertical className="h-28 w-28" strokeWidth={1.5} />
        </div>
        <div className="relative max-w-[1400px] mx-auto px-4 sm:px-8 py-6 sm:py-8 flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-widest font-semibold mb-1 text-orange-200">
              ★ MARKETING & VENDITA
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
              <RectangleVertical className="h-7 w-7 text-orange-400" />
              Preventivatore Serramenti
            </h1>
            <p className="text-sm text-blue-100 mt-1">
              I tuoi preventivi di finestre, porte e persiane sotto controllo.
            </p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              onClick={() => navigate("/azienda/impostazioni/template-preventivi?tab=moduli-vendita&modulo=serramenti")}
              size="lg" variant="outline"
              className="bg-white/10 backdrop-blur border-white/20 text-white hover:bg-white/20 flex-1 sm:flex-initial"
            >
              <Settings className="h-4 w-4 mr-1.5" />
              Impostazioni
            </Button>
            <Button
              onClick={() => navigate("/azienda/serramenti/nuovo")}
              size="lg"
              className="bg-gradient-to-br from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500 text-white shadow-lg border-0 flex-1 sm:flex-initial"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Nuovo preventivo
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-5 sm:py-6 space-y-4 sm:space-y-5">
        {/* Onboarding card — checklist setup (visibile solo se incompleto +
            non dismissato). Si auto-nasconde quando l'azienda raggiunge 4/4. */}
        <OnboardingCard />

        {/* KPI Dashboard — informativi, non cliccabili */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Totale preventivi" value={stats.totale} icon={<FileText className="h-4 w-4" />} tone="slate" />
          <KpiCard
            label="Aperte (pipeline)"
            value={stats.aperti}
            icon={<Layers className="h-4 w-4" />}
            tone="navy"
            hint={stats.valorePipeline > 0 ? fmtEur(stats.valorePipeline) : undefined}
          />
          <KpiCard
            label="Vinte (contratti)"
            value={stats.vinti}
            icon={<Trophy className="h-4 w-4" />}
            tone="orange"
            hint={stats.valoreVinti > 0 ? fmtEur(stats.valoreVinti) : undefined}
          />
          <KpiCard label="Perse" value={stats.persi} icon={<XCircle className="h-4 w-4" />} tone="rose" />
          <KpiCard
            label="Tasso conversione"
            value={stats.conv != null ? `${stats.conv}` : "—"}
            unit={stats.conv != null ? "%" : undefined}
            icon={<TrendingUp className="h-4 w-4" />}
            tone="emerald"
            hint={stats.vinti + stats.persi > 0 ? `su ${stats.vinti + stats.persi} decise` : "no dati"}
          />
          <KpiCard
            label="Ticket medio"
            value={stats.ticketMedio != null ? Math.round(stats.ticketMedio).toLocaleString("it-IT") : "—"}
            unit={stats.ticketMedio != null ? "€" : undefined}
            icon={<Wallet className="h-4 w-4" />}
            tone="slate"
            hint={stats.vinti > 0 ? `su ${stats.vinti} vint${stats.vinti === 1 ? "a" : "e"}` : undefined}
          />
        </div>

        {/* ─── Dashboard "Azioni del giorno" ─────────────────────────────
            Sezione actionable: liste compatte di preventivi che richiedono
            attenzione immediata. Si nasconde automaticamente se 0 item. */}
        {(stats.scadenzaUrgente > 0 || stats.accettatiDaConvertire.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Box "In scadenza / scaduti" */}
            {stats.scadenzaUrgente > 0 && (
              <Card className="border-amber-200 bg-amber-50/40">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 text-amber-700" />
                      <span className="text-sm font-semibold text-amber-900">
                        {stats.scadenzaUrgente} preventiv{stats.scadenzaUrgente === 1 ? "o" : "i"} in scadenza
                      </span>
                    </div>
                    {stats.scaduti.length > 0 && (
                      <Badge variant="outline" className="text-[10px] border-rose-300 text-rose-700 bg-white">
                        {stats.scaduti.length} già scadut{stats.scaduti.length === 1 ? "o" : "i"}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-amber-900/80 leading-tight">
                    Validità in scadenza entro 7 giorni. Richiama il cliente o estendi la scadenza prima che vadano persi.
                  </p>
                  <ul className="space-y-1 max-h-32 overflow-y-auto">
                    {[...stats.scaduti, ...stats.inScadenzaProssimi].slice(0, 5).map((p) => {
                      const scaduto = p.valido_fino_data && new Date(p.valido_fino_data).getTime() < Date.now();
                      const giorni = p.valido_fino_data
                        ? Math.round((new Date(p.valido_fino_data).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
                        : null;
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => navigate(`/azienda/serramenti/${p.id}/modifica`)}
                            className="w-full text-left text-[11px] flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-white transition-colors"
                          >
                            <span className="truncate flex-1">
                              <strong>{p.code}</strong>{" "}
                              <span className="text-muted-foreground">
                                {[p.cliente_nome, p.cliente_cognome].filter(Boolean).join(" ") || "—"}
                              </span>
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[9px] shrink-0 ${
                                scaduto ? "border-rose-300 text-rose-700" : "border-amber-300 text-amber-700"
                              }`}
                            >
                              {scaduto
                                ? `scaduto ${Math.abs(giorni ?? 0)}g fa`
                                : giorni === 0
                                ? "oggi"
                                : `tra ${giorni}g`}
                            </Badge>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Box "Accettati da convertire in ordine" */}
            {stats.accettatiDaConvertire.length > 0 && (
              <Card className="border-emerald-200 bg-emerald-50/40">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                    <span className="text-sm font-semibold text-emerald-900">
                      {stats.accettatiDaConvertire.length} accettat{stats.accettatiDaConvertire.length === 1 ? "o" : "i"} da convertire
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-900/80 leading-tight">
                    Preventivi accettati dal cliente ma non ancora trasformati in ordine. Sblocca la produzione.
                  </p>
                  <ul className="space-y-1 max-h-32 overflow-y-auto">
                    {stats.accettatiDaConvertire.slice(0, 5).map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => navigate(`/azienda/serramenti/${p.id}/modifica`)}
                          className="w-full text-left text-[11px] flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-white transition-colors"
                        >
                          <span className="truncate flex-1">
                            <strong>{p.code}</strong>{" "}
                            <span className="text-muted-foreground">
                              {[p.cliente_nome, p.cliente_cognome].filter(Boolean).join(" ") || "—"}
                            </span>
                          </span>
                          <Badge variant="outline" className="text-[9px] shrink-0 border-emerald-300 text-emerald-700">
                            converti →
                          </Badge>
                        </button>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ─── Performance per commerciale (multi-comm leaderboard) ─────
            Visibile solo se >1 commerciale ha preventivi nel periodo. Mostra
            ranking per valore vinto + conversion rate per identificare
            top-performer e team-member da supportare. */}
        {stats.performanceByComm.length > 1 && (
          <Card className="border-slate-200">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Trophy className="h-4 w-4 text-slate-700" />
                  <span className="text-sm font-semibold">Performance commerciali</span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {stats.performanceByComm.length} commerciali · ordinati per valore vinto
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b">
                      <th className="text-left py-1 px-2 font-medium">Commerciale</th>
                      <th className="text-right py-1 px-2 font-medium">Totale</th>
                      <th className="text-right py-1 px-2 font-medium">Vinti</th>
                      <th className="text-right py-1 px-2 font-medium">Persi</th>
                      <th className="text-right py-1 px-2 font-medium">Conv.</th>
                      <th className="text-right py-1 px-2 font-medium">Valore vinto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.performanceByComm.map((c, idx) => {
                      const nome = c.id === "_unassigned"
                        ? <span className="text-muted-foreground italic">Non assegnato</span>
                        : teamById.get(c.id) ?? <span className="text-muted-foreground">—</span>;
                      const isTop = idx === 0 && c.valoreVinti > 0;
                      return (
                        <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50/60">
                          <td className="py-1.5 px-2">
                            <span className="flex items-center gap-1.5">
                              {isTop && <Trophy className="h-3 w-3 text-amber-500" />}
                              {nome}
                            </span>
                          </td>
                          <td className="text-right py-1.5 px-2 tabular-nums">{c.totale}</td>
                          <td className="text-right py-1.5 px-2 tabular-nums text-emerald-700 font-medium">{c.vinti}</td>
                          <td className="text-right py-1.5 px-2 tabular-nums text-rose-700">{c.persi}</td>
                          <td className="text-right py-1.5 px-2 tabular-nums">
                            {c.conv != null ? `${c.conv}%` : "—"}
                          </td>
                          <td className="text-right py-1.5 px-2 tabular-nums font-semibold">
                            {c.valoreVinti > 0 ? fmtEur(c.valoreVinti) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Toolbar: Search inline + Filtri sheet trigger */}
        <Card>
          <CardContent className="p-3 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Cerca per codice, cliente o città…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => setFiltersOpen(true)}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filtri
              {activeFiltersCount > 0 && (
                <Badge className="ml-1 h-5 px-1.5 bg-orange-500 hover:bg-orange-500 text-[10px]">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
            {(search || activeFiltersCount > 0) && (
              <Button variant="ghost" size="sm" onClick={resetFiltri} className="h-9 text-xs gap-1">
                <X className="h-3.5 w-3.5" />
                Azzera
              </Button>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {progettiFiltrati.length} di {progetti.length}
              {totalPages > 1 && ` · pag ${currentPage}/${totalPages}`}
            </span>
          </CardContent>
        </Card>

        {/* Chip filtri attivi (visibili anche fuori sheet) */}
        {activeFiltersCount > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {statoGroup !== "all" && (
              <FilterChip label={`Gruppo: ${statoGroup}`} onClear={() => setStatoGroup("all")} />
            )}
            {filtroStato !== "all" && (
              <FilterChip
                label={`Stato: ${STATI_LABEL[filtroStato as SrStatoProgetto]?.label ?? filtroStato}`}
                onClear={() => setFiltroStato("all")}
              />
            )}
            {periodo !== "all" && (
              <FilterChip label={`Periodo: ${PERIOD_LABELS[periodo]}`} onClear={() => setPeriodo("all")} />
            )}
            {sortBy !== "recent" && (
              <FilterChip label={`Ordina: ${SORT_LABELS[sortBy]}`} onClear={() => setSortBy("recent")} />
            )}
            {importoMin.trim() !== "" && (
              <FilterChip label={`Min: €${importoMin}`} onClear={() => setImportoMin("")} />
            )}
            {importoMax.trim() !== "" && (
              <FilterChip label={`Max: €${importoMax}`} onClear={() => setImportoMax("")} />
            )}
            {materialeFiltro !== "all" && (
              <FilterChip
                label={`Materiale: ${MATERIALI.find((m) => m.value === materialeFiltro)?.label ?? materialeFiltro}`}
                onClear={() => setMaterialeFiltro("all")}
              />
            )}
            {tipoInterventoFiltro !== "all" && (
              <FilterChip
                label={`Tipo: ${TIPI_INTERVENTO.find((t) => t.value === tipoInterventoFiltro)?.label ?? tipoInterventoFiltro}`}
                onClear={() => setTipoInterventoFiltro("all")}
              />
            )}
            {consulenteFiltro !== "all" && (
              <FilterChip
                label={`Commerciale: ${consulenteFiltro === "none" ? "non assegnato" : (teamById.get(consulenteFiltro) ?? "—")}`}
                onClear={() => setConsulenteFiltro("all")}
              />
            )}
            {provinciaFiltro !== "all" && (
              <FilterChip label={`Provincia: ${provinciaFiltro}`} onClear={() => setProvinciaFiltro("all")} />
            )}
            {pezziMin.trim() !== "" && (
              <FilterChip label={`Pezzi ≥ ${pezziMin}`} onClear={() => setPezziMin("")} />
            )}
            {pezziMax.trim() !== "" && (
              <FilterChip label={`Pezzi ≤ ${pezziMax}`} onClear={() => setPezziMax("")} />
            )}
            {mqMin.trim() !== "" && (
              <FilterChip label={`m² ≥ ${mqMin}`} onClear={() => setMqMin("")} />
            )}
            {mqMax.trim() !== "" && (
              <FilterChip label={`m² ≤ ${mqMax}`} onClear={() => setMqMax("")} />
            )}
            {bonusFiltro !== "any" && (
              <FilterChip
                label={`Bonus: ${BONUS_OPTIONS.find((b) => b.value === bonusFiltro)?.label ?? bonusFiltro}`}
                onClear={() => setBonusFiltro("any")}
              />
            )}
            {schemaFiltro !== "all" && (
              <FilterChip
                label={`Pagamento: ${SCHEMI_PAGAMENTO_LABELS[schemaFiltro] ?? schemaFiltro}`}
                onClear={() => setSchemaFiltro("all")}
              />
            )}
            {opportunitaFiltro !== "all" && (
              <FilterChip
                label={opportunitaFiltro === "yes" ? "Con opportunità" : "Senza opportunità"}
                onClear={() => setOpportunitaFiltro("all")}
              />
            )}
            {convertitoFiltro !== "all" && (
              <FilterChip
                label={convertitoFiltro === "yes" ? "Convertito in commessa" : "Non convertito"}
                onClear={() => setConvertitoFiltro("all")}
              />
            )}
            {pdfFiltro !== "all" && (
              <FilterChip
                label={pdfFiltro === "yes" ? "Con PDF" : "Senza PDF"}
                onClear={() => setPdfFiltro("all")}
              />
            )}
            {firmatoFiltro !== "all" && (
              <FilterChip
                label={firmatoFiltro === "yes" ? "Firmato" : "Non firmato"}
                onClear={() => setFirmatoFiltro("all")}
              />
            )}
            {sopralluogoFiltro !== "all" && (
              <FilterChip
                label={sopralluogoFiltro === "yes" ? "Da sopralluogo" : "Senza sopralluogo"}
                onClear={() => setSopralluogoFiltro("all")}
              />
            )}
          </div>
        )}

        {/* Tabella / Lista */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-2">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            ) : isError ? (
              <div className="p-8 text-center space-y-3">
                <p className="text-sm text-rose-700 font-medium">Impossibile caricare i preventivi.</p>
                <Button size="sm" variant="outline" onClick={() => refetch()} className="gap-1">
                  <Loader2 className="h-3.5 w-3.5" /> Riprova
                </Button>
              </div>
            ) : progetti.length === 0 ? (
              <EmptyStateFirstTime onCreate={() => navigate("/azienda/serramenti/nuovo")} onConfig={() => navigate("/azienda/impostazioni/template-preventivi?tab=moduli-vendita&modulo=serramenti")} />
            ) : progettiFiltrati.length === 0 ? (
              <EmptyStateNoMatches onReset={resetFiltri} onOpenFilters={() => setFiltersOpen(true)} />
            ) : (
              <>
                {/* Desktop tabella */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/60 hover:bg-slate-50/60">
                        <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-slate-600">Codice</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-slate-600">Cliente</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-slate-600 hidden lg:table-cell">Commerciale</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-slate-600">Cantiere</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-slate-600 text-right">N° pezzi</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-slate-600 text-right">Importo</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-slate-600">Stato</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-slate-600">Aggiornato</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginaCorrente.map((p) => {
                        const statoCfg = STATI_LABEL[p.stato as SrStatoProgetto] ?? STATI_LABEL.bozza;
                        const cliente = [p.cliente_nome, p.cliente_cognome].filter(Boolean).join(" ");
                        const isAperto = STATI_APERTI.includes(p.stato as SrStatoProgetto);
                        return (
                          <TableRow
                            key={p.id}
                            className="cursor-pointer hover:bg-orange-50/40 transition-colors"
                            onClick={() => navigate(`/azienda/serramenti/${p.id}/modifica`)}
                          >
                            <TableCell className="font-mono text-xs font-semibold text-orange-600">
                              {p.code}
                            </TableCell>
                            <TableCell className="text-xs">
                              <div className="font-medium text-slate-900">
                                {cliente || <span className="text-muted-foreground">—</span>}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-slate-600 hidden lg:table-cell">
                              {p.consulente_id
                                ? <span className="truncate inline-block max-w-[140px]">{teamById.get(p.consulente_id) ?? "—"}</span>
                                : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-xs text-slate-600">
                              {p.cantiere_citta ?? <span className="text-muted-foreground">—</span>}
                              {p.cantiere_provincia && (
                                <span className="text-muted-foreground"> ({p.cantiere_provincia})</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-right tabular-nums">{p.totale_serramenti ?? 0}</TableCell>
                            <TableCell className="text-xs text-right tabular-nums font-medium">
                              {fmtEurRangeOrSingle(p.totale_min, p.totale_max) !== "—" ? (
                                <span>{fmtEurRangeOrSingle(p.totale_min, p.totale_max)}</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={cn("text-[10px] font-medium", statoCfg.className)}>
                                {isAperto && <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1 animate-pulse" />}
                                {statoCfg.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-[11px] text-muted-foreground">
                              {p.updated_at
                                ? format(new Date(p.updated_at), "d MMM yyyy", { locale: it })
                                : "—"}
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-1 justify-end">
                                {p.pdf_url && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button asChild size="icon" variant="ghost" className="h-7 w-7" aria-label="Apri PDF">
                                        <a href={p.pdf_url} target="_blank" rel="noopener noreferrer">
                                          <ExternalLink className="h-3.5 w-3.5 text-orange-600" />
                                        </a>
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Apri PDF</TooltipContent>
                                  </Tooltip>
                                )}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon" variant="ghost" className="h-7 w-7"
                                      onClick={() => setToDelete({ id: p.id, code: p.code })}
                                      aria-label="Elimina"
                                    >
                                      <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Elimina</TooltipContent>
                                </Tooltip>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile card list */}
                <div className="md:hidden p-2 space-y-2">
                  {paginaCorrente.map((p) => {
                    const statoCfg = STATI_LABEL[p.stato as SrStatoProgetto] ?? STATI_LABEL.bozza;
                    const cliente = [p.cliente_nome, p.cliente_cognome].filter(Boolean).join(" ");
                    const isAperto = STATI_APERTI.includes(p.stato as SrStatoProgetto);
                    return (
                      <div
                        key={p.id}
                        className="rounded-lg border bg-card p-3 space-y-2 cursor-pointer hover:bg-orange-50/30"
                        onClick={() => navigate(`/azienda/serramenti/${p.id}/modifica`)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-mono text-xs font-semibold text-orange-600">{p.code}</span>
                              <Badge variant="outline" className={cn("text-[10px] font-medium", statoCfg.className)}>
                                {isAperto && <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1 animate-pulse" />}
                                {statoCfg.label}
                              </Badge>
                            </div>
                            <p className="text-sm font-medium truncate">{cliente || "—"}</p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {p.cantiere_citta ?? "—"} · {p.totale_serramenti ?? 0} pezzi
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium tabular-nums">
                            {fmtEurRangeOrSingle(p.totale_min, p.totale_max) !== "—" ? (
                              <>{fmtEurRangeOrSingle(p.totale_min, p.totale_max)}</>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {p.updated_at ? format(new Date(p.updated_at), "d MMM yyyy", { locale: it }) : "—"}
                          </span>
                        </div>
                        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                          {p.pdf_url && (
                            <Button asChild size="sm" variant="outline" className="flex-1 h-8 text-xs">
                              <a href={p.pdf_url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-3.5 w-3.5 mr-1.5 text-orange-600" /> PDF
                              </a>
                            </Button>
                          )}
                          <Button
                            size="sm" variant="outline" className="h-8 text-xs"
                            onClick={() => setToDelete({ id: p.id, code: p.code })}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Paginazione */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between gap-2 p-3 border-t bg-slate-50/40">
                    <span className="text-xs text-muted-foreground">
                      {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, progettiFiltrati.length)} di {progettiFiltrati.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline" size="sm" className="h-8 w-8 p-0"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        aria-label="Pagina precedente"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-xs px-2 tabular-nums">
                        Pag {currentPage} / {totalPages}
                      </span>
                      <Button
                        variant="outline" size="sm" className="h-8 w-8 p-0"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        aria-label="Pagina successiva"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sheet Filtri laterale */}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-orange-600" />
              Filtri avanzati
              {activeFiltersCount > 0 && (
                <Badge className="bg-orange-500 hover:bg-orange-500 text-[10px]">
                  {activeFiltersCount} attivi
                </Badge>
              )}
            </SheetTitle>
            <SheetDescription>
              Affina la lista per stato, periodo, importo, materiale e tipo di intervento.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 py-5">
            {/* ─── STATO & TEMPO ─── */}
            <FilterSection icon={<Layers className="h-3.5 w-3.5" />} title="Stato & Tempo">
              <div className="space-y-2">
                <Label className="text-[11px] font-medium text-muted-foreground">Gruppo</Label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "all", label: "Tutti", tone: "" },
                    { value: "aperti", label: "Aperti", tone: "border-[#173b67] text-[#173b67] bg-blue-50" },
                    { value: "vinti", label: "Vinti", tone: "border-orange-500 text-orange-600 bg-orange-50" },
                    { value: "persi", label: "Persi", tone: "border-rose-400 text-rose-700 bg-rose-50" },
                  ].map((g) => (
                    <Button
                      key={g.value}
                      variant={statoGroup === g.value ? "default" : "outline"}
                      size="sm"
                      className={cn("h-9 text-xs", statoGroup === g.value && g.tone)}
                      onClick={() => setStatoGroup(g.value)}
                    >
                      {g.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[11px] font-medium text-muted-foreground">Stato specifico</Label>
                <Select value={filtroStato} onValueChange={setFiltroStato}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti gli stati</SelectItem>
                    {(Object.keys(STATI_LABEL) as SrStatoProgetto[]).map((k) => (
                      <SelectItem key={k} value={k}>{STATI_LABEL[k].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[11px] font-medium text-muted-foreground">Periodo aggiornamento</Label>
                <Select value={periodo} onValueChange={(v) => setPeriodo(v as PeriodKey)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((k) => (
                      <SelectItem key={k} value={k}>{PERIOD_LABELS[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </FilterSection>

            {/* ─── COMMERCIALI ─── */}
            <FilterSection icon={<User className="h-3.5 w-3.5" />} title="Commerciali">
              <div className="space-y-2">
                <Label className="text-[11px] font-medium text-muted-foreground">Consulente / commerciale</Label>
                <Select value={consulenteFiltro} onValueChange={setConsulenteFiltro}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti i commerciali</SelectItem>
                    <SelectItem value="none">Non assegnato</SelectItem>
                    {teamMembers.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {[m.first_name, m.last_name].filter(Boolean).join(" ") || m.email || m.id.slice(0, 6)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Provincia cantiere
                </Label>
                <Select value={provinciaFiltro} onValueChange={setProvinciaFiltro}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="all">Tutte le province</SelectItem>
                    {PROVINCE_IT.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </FilterSection>

            {/* ─── PRODOTTI & TECNICO ─── */}
            <FilterSection icon={<Package2 className="h-3.5 w-3.5" />} title="Prodotti & Tecnico">
              <div className="space-y-2">
                <Label className="text-[11px] font-medium text-muted-foreground">Materiale principale</Label>
                <Select value={materialeFiltro} onValueChange={setMaterialeFiltro}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti i materiali</SelectItem>
                    {MATERIALI.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[11px] font-medium text-muted-foreground">Tipo intervento</Label>
                <Select value={tipoInterventoFiltro} onValueChange={setTipoInterventoFiltro}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti i tipi</SelectItem>
                    {TIPI_INTERVENTO.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[11px] font-medium text-muted-foreground">N° pezzi</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" placeholder="Min" inputMode="numeric" min="0"
                    value={pezziMin} onChange={(e) => setPezziMin(e.target.value)} className="h-9" />
                  <Input type="number" placeholder="Max" inputMode="numeric" min="0"
                    value={pezziMax} onChange={(e) => setPezziMax(e.target.value)} className="h-9" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[11px] font-medium text-muted-foreground">m² totali</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" placeholder="Min" inputMode="decimal" min="0" step="0.1"
                    value={mqMin} onChange={(e) => setMqMin(e.target.value)} className="h-9" />
                  <Input type="number" placeholder="Max" inputMode="decimal" min="0" step="0.1"
                    value={mqMax} onChange={(e) => setMqMax(e.target.value)} className="h-9" />
                </div>
              </div>
            </FilterSection>

            {/* ─── ECONOMIA ─── */}
            <FilterSection icon={<Wallet className="h-3.5 w-3.5" />} title="Economia">
              <div className="space-y-2">
                <Label className="text-[11px] font-medium text-muted-foreground">Importo totale (€)</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" placeholder="Min" inputMode="decimal"
                    value={importoMin} onChange={(e) => setImportoMin(e.target.value)} className="h-9" />
                  <Input type="number" placeholder="Max" inputMode="decimal"
                    value={importoMax} onChange={(e) => setImportoMax(e.target.value)} className="h-9" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Ecobonus
                </Label>
                <Select value={bonusFiltro} onValueChange={setBonusFiltro}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BONUS_OPTIONS.map((b) => (
                      <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[11px] font-medium text-muted-foreground">Schema pagamento</Label>
                <Select value={schemaFiltro} onValueChange={setSchemaFiltro}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti gli schemi</SelectItem>
                    {Object.entries(SCHEMI_PAGAMENTO_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </FilterSection>

            {/* ─── LINKING / WORKFLOW ─── */}
            <FilterSection icon={<Briefcase className="h-3.5 w-3.5" />} title="Workflow & Linking">
              <TriStateRow label="Opportunità CRM" icon={<Briefcase className="h-3 w-3" />} value={opportunitaFiltro} onChange={setOpportunitaFiltro} />
              <TriStateRow label="Sopralluogo collegato" icon={<ClipboardList className="h-3 w-3" />} value={sopralluogoFiltro} onChange={setSopralluogoFiltro} />
              <TriStateRow label="Convertito in commessa" icon={<ClipboardList className="h-3 w-3" />} value={convertitoFiltro} onChange={setConvertitoFiltro} />
              <TriStateRow label="PDF generato" icon={<FileText className="h-3 w-3" />} value={pdfFiltro} onChange={setPdfFiltro} />
              <TriStateRow label="Firmato dal cliente" icon={<FileSignature className="h-3 w-3" />} value={firmatoFiltro} onChange={setFirmatoFiltro} />
            </FilterSection>

            {/* ─── ORDINAMENTO ─── */}
            <FilterSection icon={<TrendingUp className="h-3.5 w-3.5" />} title="Ordinamento">
              <div className="space-y-2">
                <Label className="text-[11px] font-medium text-muted-foreground">Ordina per</Label>
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                      <SelectItem key={k} value={k}>{SORT_LABELS[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </FilterSection>
          </div>

          <SheetFooter className="gap-2 sm:gap-0 border-t pt-4">
            <Button variant="ghost" onClick={resetFiltri} className="text-xs gap-1">
              <X className="h-3.5 w-3.5" /> Azzera tutti
            </Button>
            <Button onClick={() => setFiltersOpen(false)} className="bg-orange-500 hover:bg-orange-600">
              Mostra {progettiFiltrati.length} risultat{progettiFiltrati.length === 1 ? "o" : "i"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Confirm delete */}
      <AlertDialog
        open={!!toDelete}
        onOpenChange={(o) => { if (!o && !deleteMut.isPending) setToDelete(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il preventivo {toDelete?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              Verranno eliminati anche serramenti, accessori e foto associati. L'azione non è reversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              disabled={deleteMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!toDelete) return;
                deleteMut.mutate(toDelete.id, { onSettled: () => setToDelete(null) });
              }}
            >
              {deleteMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TooltipProvider>
  );
}

/* ─── Componenti interni ──────────────────────────────────────────────── */

type KpiTone = "slate" | "navy" | "orange" | "rose" | "emerald";

const TONE_CLASS: Record<KpiTone, { border: string; iconBg: string; iconText: string; valueText: string }> = {
  slate:   { border: "border-l-slate-400",         iconBg: "bg-slate-100",         iconText: "text-slate-600",         valueText: "text-slate-900" },
  navy:    { border: "border-l-[#173b67]",         iconBg: "bg-blue-50",           iconText: "text-[#173b67]",         valueText: "text-[#173b67]" },
  orange:  { border: "border-l-orange-500",        iconBg: "bg-orange-100",        iconText: "text-orange-600",        valueText: "text-orange-600" },
  rose:    { border: "border-l-rose-400",          iconBg: "bg-rose-100",          iconText: "text-rose-600",          valueText: "text-rose-700" },
  emerald: { border: "border-l-emerald-500",       iconBg: "bg-emerald-100",       iconText: "text-emerald-600",       valueText: "text-emerald-700" },
};

function KpiCard({
  label, value, unit, icon, tone = "slate", hint,
}: {
  label: string;
  value: string | number;
  unit?: string;
  icon: React.ReactNode;
  tone?: KpiTone;
  hint?: string;
}) {
  const c = TONE_CLASS[tone];
  return (
    <div className={cn("bg-white border-l-4 rounded-lg shadow-sm p-3 sm:p-4", c.border)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] sm:text-[11px] font-medium text-muted-foreground uppercase tracking-wide truncate">
          {label}
        </p>
        <span className={cn("h-7 w-7 rounded-md flex items-center justify-center shrink-0", c.iconBg, c.iconText)}>
          {icon}
        </span>
      </div>
      <p className={cn("text-2xl font-bold mt-1 tabular-nums", c.valueText)}>
        {value}
        {unit && <span className="text-base font-normal ml-0.5">{unit}</span>}
      </p>
      {hint && (
        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{hint}</p>
      )}
    </div>
  );
}

function FilterSection({
  icon, title, children,
}: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 pb-1.5 border-b border-slate-100">
        <span className="text-orange-600">{icon}</span>
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">{title}</h4>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function TriStateRow({
  label, icon, value, onChange,
}: {
  label: string;
  icon?: React.ReactNode;
  value: TriState;
  onChange: (v: TriState) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1 truncate">
        {icon}
        {label}
      </Label>
      <div className="flex gap-1 shrink-0">
        {(["all", "yes", "no"] as TriState[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={cn(
              "h-7 px-2.5 text-[10px] font-medium rounded transition-colors",
              value === v
                ? v === "yes" ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
                : v === "no" ? "bg-rose-100 text-rose-700 border border-rose-300"
                : "bg-slate-200 text-slate-700 border border-slate-300"
                : "bg-white text-muted-foreground border border-slate-200 hover:bg-slate-50"
            )}
          >
            {v === "all" ? "Tutti" : v === "yes" ? "Sì" : "No"}
          </button>
        ))}
      </div>
    </div>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex items-center gap-1 rounded-full bg-orange-100 hover:bg-orange-200 text-orange-700 text-[11px] px-2.5 py-1 transition-colors"
    >
      {label}
      <X className="h-3 w-3" />
    </button>
  );
}

function EmptyStateFirstTime({
  onCreate, onConfig,
}: { onCreate: () => void; onConfig: () => void }) {
  return (
    <div className="p-8 md:p-12 text-center">
      <div className="relative inline-block mb-4">
        <div className="h-20 w-20 rounded-full bg-orange-50 flex items-center justify-center">
          <RectangleVertical className="h-10 w-10 text-orange-600" />
        </div>
        <div className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-amber-100 border-2 border-white flex items-center justify-center">
          <Plus className="h-4 w-4 text-amber-700" />
        </div>
      </div>
      <h3 className="text-lg font-bold text-slate-900 mb-1">
        Crea il tuo primo preventivo Serramenti
      </h3>
      <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
        Preventivo professionale con BOM, Ecobonus, ROI 10 anni e firma digitale. Il cliente firma dal cellulare.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-w-md mx-auto mb-5 text-[11px] text-slate-600">
        <div className="rounded-md bg-orange-50/50 border border-orange-100 p-2">
          📋 BOM completo
          <p className="text-[10px] text-muted-foreground mt-0.5">Tipologia, vetro, misure</p>
        </div>
        <div className="rounded-md bg-orange-50/50 border border-orange-100 p-2">
          💰 ROI 10 anni
          <p className="text-[10px] text-muted-foreground mt-0.5">Risparmio + Ecobonus</p>
        </div>
        <div className="rounded-md bg-orange-50/50 border border-orange-100 p-2">
          ✍️ Firma digitale
          <p className="text-[10px] text-muted-foreground mt-0.5">Cliente firma online</p>
        </div>
      </div>
      <div className="flex gap-2 justify-center flex-wrap">
        <Button onClick={onCreate} className="bg-orange-500 hover:bg-orange-600 gap-2">
          <Plus className="h-4 w-4" /> Crea il primo preventivo
        </Button>
        <Button variant="outline" onClick={onConfig} className="gap-2">
          <Settings className="h-4 w-4" /> Configura template
        </Button>
      </div>
    </div>
  );
}

function EmptyStateNoMatches({
  onReset, onOpenFilters,
}: { onReset: () => void; onOpenFilters: () => void }) {
  return (
    <div className="p-10 text-center">
      <Search className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
      <p className="text-sm font-medium">Nessun risultato con i filtri attuali</p>
      <p className="text-xs text-muted-foreground mt-1">Prova a modificare i criteri o azzera i filtri.</p>
      <div className="flex gap-2 justify-center mt-3">
        <Button variant="outline" size="sm" onClick={onOpenFilters} className="text-xs gap-1">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Modifica filtri
        </Button>
        <Button variant="ghost" size="sm" onClick={onReset} className="text-xs gap-1">
          <X className="h-3.5 w-3.5" />
          Azzera tutto
        </Button>
      </div>
    </div>
  );
}
