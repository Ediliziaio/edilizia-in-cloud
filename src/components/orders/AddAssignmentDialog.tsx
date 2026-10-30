import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, Plus, User, Users, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useAssignmentHourlyCost } from "@/hooks/useAssignmentHourlyCost";
import { useAssignmentCompanies } from "@/hooks/useAssignmentCompanies";
import { parseAssignmentAmount, formatAssignmentAmount } from "@/lib/orders/assignmentAmounts";
import { plannedLaborCost } from "@/lib/orders/laborEconomics";
import type { ExecutorOption, ExecutorType, PhaseAssignment, AddAssignmentPayload } from "@/hooks/useOrderWorkPhases";
import { oggiRoma, useSquadre, useSquadreCommessa, useSquadraSuCommessa, messaggioErroreOperai } from "@/hooks/useOperai";
import { costoTariffa, unitaTariffa } from "@/lib/listino/costoTariffa";
import { conIva, costoDaVoci, ivaDitta, quantitaDellaTariffa, testoIvaDitta, type OrigineCostoDitta } from "@/lib/orders/costoDitta";
import { useVociPrevisteFasi } from "@/hooks/useVociPrevisteFasi";
import { validWorkDates as validCrewDates } from "@/lib/orders/workPlanning";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: true });

interface AddAssignmentDialogProps {
  orderId: string;
  /** null = manodopera senza fase: il caso semplice (lavoro breve, subappalto
      a corpo). In produzione e' l'88% della manodopera reale (138 assegnazioni
      su 156 sono senza fase): non un residuo, il modo normale di lavorare di
      un serramentista con pose da 1-3 giorni. */
  phaseId: string | null;
  employees: ExecutorOption[];
  externalTeams: ExecutorOption[];
  phases: { id: string; name: string }[];
  existingAssignments?: PhaseAssignment[];
  /** Etichetta del bottone che apre il dialog (default "Aggiungi esecutore"). */
  triggerLabel?: string;
  triggerAriaLabel?: string;
  /** Variante del bottone trigger (default "outline"). */
  triggerVariant?: "default" | "outline";
  /** Colore del bottone (vedi lib/manodopera/colori). */
  triggerClassName?: string;
  /** Aperto da fuori (es. dal menu «Aggiungi»): senza bottone proprio. */
  aperto?: boolean;
  onAperto?: (o: boolean) => void;
  onAdd: (
    payload: AddAssignmentPayload,
    opts?: { onSuccess?: () => void; onError?: () => void }
  ) => void;
}

// Voce del listino manodopera aziendale (tariffe_aziendali): costo sostenuto
// (prezzo_costo) + prezzo di vendita → il ricarico è visibile al volo.
// prezzo_costo e unita arrivano già normalizzati dalla query (costoTariffa,
// unitaTariffa), non sono le colonne grezze.
interface TariffaManodopera {
  id: string;
  nome: string;
  unita: string | null;
  prezzo_costo: number | null;
  prezzo_vendita: number | null;
  attiva: boolean | null;
  attivo: boolean | null;
  /** Listino della singola squadra (null = listino aziendale generico). */
  external_team_id: string | null;
}

export function AddAssignmentDialog({
  orderId,
  phaseId,
  employees,
  externalTeams: _externalTeams,
  phases,
  existingAssignments = [],
  triggerLabel = "Assegna",
  triggerAriaLabel,
  triggerVariant = "outline",
  triggerClassName,
  aperto,
  onAperto,
  onAdd,
}: AddAssignmentDialogProps) {
  const { canViewCosts, canViewMargins, canEditOrders, canEditOperai, canViewPersone, solaLettura } = usePermissions();
  const puoPersona = !!canEditOrders && !solaLettura;
  const puoSquadra = (!!canEditOrders || !!canEditOperai) && !solaLettura;
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const context = useRef({ companyId, orderId });

  const [openInterno, setOpenInterno] = useState(false);
  const controllato = aperto !== undefined;
  const open = controllato ? aperto : openInterno;
  const setOpen = (o: boolean) => (controllato ? onAperto?.(o) : setOpenInterno(o));
  const contextChanged = context.current.companyId !== companyId || context.current.orderId !== orderId;
  const [tipo, setTipo] = useState<ExecutorType | "squadra">(puoPersona ? "interno" : "squadra");
  const [executorId, setExecutorId] = useState<string>("");
  const [selectedPhase, setSelectedPhase] = useState(phaseId ?? "");
  const [prev, setPrev] = useState("0");
  const [cons, setCons] = useState("0");
  const [plannedHours, setPlannedHours] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [costsOpen, setCostsOpen] = useState(false);
  const [dal, setDal] = useState(oggiRoma);
  const [al, setAl] = useState("");
  const [capo, setCapo] = useState(false);
  const squadreQuery = useSquadre(open && tipo === "squadra" && puoSquadra);
  const squadreAssegnate = useSquadreCommessa(open && tipo === "squadra" ? orderId : undefined);
  const mettiSquadra = useSquadraSuCommessa();
  const squadra = squadreQuery.data?.find(s => s.id === executorId);
  const rate = useAssignmentHourlyCost(open && tipo === "interno" && executorId ? executorId : undefined);
  const currentRate = rate.allowed && !rate.isError && !rate.isLoading ? rate.data?.amount : null;
  const hoursPlan = parseAssignmentAmount(plannedHours, 6);
  const plannedCost = plannedHours.trim() && hoursPlan != null && currentRate != null
    ? plannedLaborCost(hoursPlan, currentRate) : null;
  // Prefill dal listino manodopera (facoltativo)
  const [tariffaId, setTariffaId] = useState("");
  const [tariffaQty, setTariffaQty] = useState("1");
  const [appliedUnitCost, setAppliedUnitCost] = useState<number | null>(null);
  /** Da dove viene il costo previsto proposto, e quale importo era: se lo si riscrive diventa «a mano». */
  const [origine, setOrigine] = useState<{ tipo: Exclude<OrigineCostoDitta, "manuale">; importo: number } | null>(null);
  // Le voci del preventivo della lavorazione scelta: quantità e costo da proporre.
  const vociQuery = useVociPrevisteFasi(orderId, open && tipo === "esterno" && canViewCosts);
  const vociFase = selectedPhase ? (vociQuery.data ?? []).filter((v) => v.phase_id === selectedPhase) : [];
  const ditteQuery = useAssignmentCompanies(companyId, open && tipo === 'esterno' && puoPersona && !contextChanged);

  // Listino manodopera aziendale — caricato solo a dialog aperto.
  const { data: tariffe = [], isError: tariffeError, isFetching: tariffeFetching, refetch: refetchTariffe } = useQuery({
    queryKey: ["tariffe-manodopera", companyId],
    enabled: open && tipo === "esterno" && canViewCosts && !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<TariffaManodopera[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("tariffe_aziendali")
        .select("id, nome, unita, unita_fatturazione, prezzo_costo, costo_interno, costo_default, prezzo_vendita, attiva, attivo, external_team_id")
        .eq("company_id", companyId)
        .order("nome");
      if (error) throw error;
      // Costo e unità si normalizzano qui, una volta: tutto il dialog legge
      // prezzo_costo e unita. Prima valeva il solo prezzo_costo, che può
      // essere lo 0 di default quando il costo sta in costo_interno; e la
      // `unita` legacy dice «h» anche per le tariffe a giornata (05/10/2026).
      type Riga = TariffaManodopera & { costo_interno: number | null; costo_default: number | null; unita_fatturazione: string | null };
      return ((data ?? []) as Riga[])
        .map((t) => ({ ...t, prezzo_costo: costoTariffa(t), unita: unitaTariffa(t, "") || null }));
    },
  });
  // Ogni squadra puo' avere il SUO listino ("piu' squadre con listini
  // diversi"): con l'esecutore esterno scelto si vedono le sue voci (prima)
  // e quelle aziendali generiche — mai i prezzi delle altre squadre, che
  // suggerirebbero il costo sbagliato.
  const squadraSelezionata = tipo === "esterno" ? executorId : "";
  /** Varianti di costo per squadra: "questa lavorazione, fatta da questa
      squadra, costa X". Una sola query per company: la tabella e' piccola. */
  const { data: varianti = [], isError: variantiError, isFetching: variantiFetching, refetch: refetchVarianti } = useQuery({
    queryKey: ["tariffa-costi-varianti", companyId],
    enabled: open && tipo === "esterno" && canViewCosts && !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Array<{ id: string; tariffa_id: string; external_team_id: string | null; nome: string; costo: number | null; is_default: boolean | null; attivo: boolean | null; sort_order: number | null }>> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("tariffa_costi_varianti")
        .select("id, tariffa_id, external_team_id, nome, costo, is_default, attivo, sort_order")
        .eq("company_id", companyId);
      if (error) throw error;
      return data ?? [];
    },
  });
  /** Variante scelta a mano quando la squadra ne ha piu' d'una. */
  const [varianteId, setVarianteId] = useState("");

  const tariffeAttive = tariffe
    .filter((t) => t.attiva ?? t.attivo ?? true)
    .filter((t) => !t.external_team_id || t.external_team_id === squadraSelezionata)
    .sort((a, b) => {
      const pa = a.external_team_id ? 0 : 1;
      const pb = b.external_team_id ? 0 : 1;
      return pa !== pb ? pa - pb : a.nome.localeCompare(b.nome);
    });
  const tariffaSel = tariffeAttive.find((t) => t.id === tariffaId) ?? null;

  /** Varianti valide per la tariffa scelta e la squadra scelta. */
  const variantiSquadra = tariffaSel && squadraSelezionata
    ? varianti
        .filter((v) => v.tariffa_id === tariffaSel.id && v.external_team_id === squadraSelezionata && v.attivo !== false)
        .sort((a, b) => Number(b.is_default ?? false) - Number(a.is_default ?? false) || (a.sort_order ?? 0) - (b.sort_order ?? 0))
    : [];
  const varianteSel = variantiSquadra.find((v) => v.id === varianteId) ?? variantiSquadra[0] ?? null;
  /** Il costo che vale davvero: variante della squadra se c'e', altrimenti base. */
  const costoUnitarioEffettivo = varianteSel?.costo ?? tariffaSel?.prezzo_costo ?? null;
  const listinoBusy = !!tariffeFetching || !!variantiFetching;
  const tariffaAggiornata = !!tariffaSel && appliedUnitCost !== Number(costoUnitarioEffettivo ?? 0);
  const listinoIncompleto = tipo === 'esterno' && canViewCosts && !!tariffaId &&
    (listinoBusy || !!tariffeError || !!variantiError || !tariffaSel || tariffaAggiornata);

  // Applica costo (e nota, se vuota) da tariffa × quantità. Il campo resta
  // modificabile: il listino è un prefill, non un vincolo.
  const applyTariffa = (t: TariffaManodopera | null, qtyRaw: string, costoUnit?: number | null) => {
    if (!t || listinoBusy || tariffeError || variantiError) return;
    const qty = parseAssignmentAmount(qtyRaw, 6);
    if (qty == null || !qtyRaw.trim()) return;
    const unit = costoUnit ?? (Number(t.prezzo_costo) || 0);
    // Il listino è senza IVA; il previsto della ditta si scrive con l'IVA della sua fattura (0 in reverse charge).
    const costo = conIva((Number(unit) || 0) * qty, ivaSel);
    setAppliedUnitCost(Number(unit) || 0);
    setOrigine({ tipo: "listino", importo: costo });
    setPrev(formatAssignmentAmount(costo.toFixed(2)));
    setNotes((n) =>
      n.trim() === "" || /^(Listino|Dal preventivo): /.test(n)
        ? `Listino: ${t.nome} × ${qtyRaw || "1"}${t.unita ? ` ${t.unita}` : ""}`
        : n,
    );
  };

  /** Il lavoro delle voci della lavorazione, al costo di questa ditta quando il listino ne ha uno suo. */
  const daPreventivo = costoDaVoci(vociFase, varianti, tipo === "esterno" && executorId ? executorId : null);
  const applyPreventivo = () => {
    if (daPreventivo.netto <= 0 || listinoBusy || variantiError) return;
    const costo = conIva(daPreventivo.netto, ivaSel);
    setTariffaId(""); setVarianteId(""); setAppliedUnitCost(null);
    setOrigine({ tipo: "preventivo", importo: costo });
    setPrev(formatAssignmentAmount(costo.toFixed(2)));
    setNotes((n) => (n.trim() === "" || /^(Listino|Dal preventivo): /.test(n) ? `Dal preventivo: ${daPreventivo.voci === 1 ? "1 voce" : `${daPreventivo.voci} voci`} della lavorazione` : n));
  };
  // Ditta su una lavorazione nata dal preventivo: il previsto si compila da solo, si può cambiare.
  const propostoPer = useRef("");
  // Cambiando ditta o lavorazione, il costo già preso dal preventivo si rifà (o si toglie).
  useEffect(() => {
    if (!open || tipo !== "esterno" || !executorId) return;
    const chiave = `${executorId}|${selectedPhase}`;
    if (propostoPer.current === chiave || vociQuery.isLoading || listinoBusy) return;
    propostoPer.current = chiave;
    const dalPreventivo = origine?.tipo === "preventivo";
    if (daPreventivo.netto <= 0) {
      if (dalPreventivo) { setPrev("0"); setOrigine(null); setNotes((n) => (/^Dal preventivo: /.test(n) ? "" : n)); }
      return;
    }
    if (tariffaId || ((parseAssignmentAmount(prev) ?? 0) > 0 && !dalPreventivo)) return;
    applyPreventivo();
    setCostsOpen(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tipo, executorId, selectedPhase, vociQuery.isLoading, listinoBusy, daPreventivo.netto]);

  const options = tipo === "squadra" ? (squadreQuery.data ?? []).map(s => ({id: s.id, label: `${s.nome} · ${s.componenti.length} componenti`})) : tipo === "interno" ? employees : ditteQuery.data ?? [];
  const selectedCompany = tipo === 'esterno' ? ditteQuery.data?.find(option => option.id === executorId) : undefined;
  // IVA della ditta scelta: 0 in reverse charge (subappalto edile), come nasce una ditta nuova.
  const ivaSel = ivaDitta(selectedCompany?.vat_rate);
  const piuIva = ivaSel === 0 ? "senza IVA (reverse charge)" : `+ IVA ${ivaSel}%`;
  const companiesUnavailable = tipo === 'esterno' && (ditteQuery.isLoading || ditteQuery.isFetching || ditteQuery.isError);
  const invalidQuantity = !!tariffaSel && (!tariffaQty.trim() || parseAssignmentAmount(tariffaQty, 6) == null);

  const reset = useCallback(() => {
    setTipo(puoPersona ? "interno" : "squadra");
    setExecutorId("");
    setPrev("0");
    setCons("0");
    setPlannedHours("");
    setNotes("");
    setSubmitting(false);
    submittingRef.current = false;
    setCostsOpen(false);
    setTariffaId("");
    setTariffaQty("1");
    setAppliedUnitCost(null);
    setOrigine(null);
    propostoPer.current = "";
    setVarianteId("");
    setSelectedPhase(phaseId ?? "");
    setDal(oggiRoma()); setAl(""); setCapo(false);
  }, [puoPersona, phaseId]);
  // A controlled parent can close or change the target while this component
  // stays mounted. Never carry an old executor/cost/phase into the next opening.
  useEffect(() => {
    if (!open && !submittingRef.current) {
      context.current = { companyId, orderId };
      reset();
    }
  }, [open, companyId, orderId, reset]);

  const num = (raw: string) => {
    return parseAssignmentAmount(raw) ?? 0;
  };

  /** Da dove viene il previsto che si salva: se l'importo non è più quello proposto, è scritto a mano. */
  const origineDelCosto = (budget: number): NonNullable<AddAssignmentPayload["origine_costo"]> => {
    const proposto = origine && Math.abs(origine.importo - budget) < 0.005 ? origine.tipo : null;
    if (proposto === "listino" && tariffaSel) {
      return { costo_origine: "listino", tariffa_id: tariffaSel.id, quantita: parseAssignmentAmount(tariffaQty, 6), costo_unitario: appliedUnitCost };
    }
    if (proposto === "preventivo") return { costo_origine: "preventivo", tariffa_id: null, quantita: null, costo_unitario: null };
    return { costo_origine: "manuale", tariffa_id: tariffaSel?.id ?? null, quantita: null, costo_unitario: null };
  };

  const handleSubmit = () => {
    if (submittingRef.current || submitting || contextChanged || companiesUnavailable || listinoIncompleto || selectedCompany?.unavailableReason || (tipo === "squadra" ? !puoSquadra : !puoPersona)) return;
    if (selectedPhase && !phases.some(p => p.id === selectedPhase)) { toast.error("La lavorazione non è più disponibile. Ricontrolla la selezione."); return; }
    if (!executorId) {
      toast.error("Seleziona un esecutore");
      return;
    }
    if (!options.some(option => option.id === executorId)) {
      toast.error("Esecutore non più disponibile. Ricontrolla la selezione.");
      return;
    }
    if (tipo === "squadra") {
      if (squadreQuery.isLoading || squadreQuery.isError || squadreAssegnate.isLoading || squadreAssegnate.isError) return;
      if (squadreAssegnate.data?.some(s => s.squadra_id === executorId && s.phase_id === (selectedPhase || null))) {
        toast.error("Squadra già assegnata qui. Modifica l'assegnazione esistente."); return;
      }
      if (!selectedPhase && !validCrewDates(dal, al)) { toast.error("Controlla le date della squadra."); return; }
      submittingRef.current = true; setSubmitting(true);
      mettiSquadra.mutate({orderId, squadraId: executorId, phaseId: selectedPhase || null, dal: selectedPhase ? null : dal || null, al: selectedPhase ? null : al || null, capocantiere: !!squadra?.responsabile && capo}, {
        onSuccess: () => { toast.success("Squadra assegnata"); reset(); setOpen(false); },
        onError: err => { submittingRef.current = false; setSubmitting(false); toast.error(messaggioErroreOperai(err, "Assegnazione non riuscita. Riprova.")); },
      });
      return;
    }
    if (existingAssignments.some(a => a.phase_id === (selectedPhase || null) &&
      (tipo === "interno" ? a.employee_id === executorId : a.external_team_id === executorId))) {
      toast.error("Esecutore già assegnato a questa lavorazione. Modifica la riga esistente.");
      return;
    }
    const budget = !canViewCosts ? 0 : tipo === "interno" ? (plannedHours.trim() ? plannedCost : 0) : parseAssignmentAmount(prev);
    const cost = tipo === "esterno" && canViewCosts ? parseAssignmentAmount(cons) : 0;
    if (budget === null || cost === null || invalidQuantity) {
      toast.error("Importi e ore devono essere numeri validi, maggiori o uguali a zero.");
      return;
    }
    const payload: AddAssignmentPayload = {
      phase_id: selectedPhase || null,
      executor_type: tipo,
      planned_hours: tipo === "interno" && plannedHours.trim() ? hoursPlan : null,
      planned_hourly_rate: tipo === "interno" && plannedHours.trim() ? currentRate : null,
      employee_id: tipo === "interno" ? executorId : null,
      external_team_id: tipo === "esterno" && !selectedCompany?.subappaltatoreId ? executorId : null,
      ...(selectedCompany?.subappaltatoreId ? { subappaltatore_id: selectedCompany.subappaltatoreId } : {}),
      cost_preventivo: budget,
      cost_consuntivo: cost,
      hours: null,
      is_paid: false,
      paid_date: null,
      notes: notes.trim() === "" ? null : notes.trim(),
      ...(tipo === "esterno" && canViewCosts && budget > 0 ? { origine_costo: origineDelCosto(budget) } : {}),
    };
    submittingRef.current = true; setSubmitting(true);
    try { onAdd(payload, {
      onSuccess: () => {
        reset();
        setOpen(false);
      },
      // Senza questo, un errore lasciava il bottone in spinner per sempre.
      onError: () => { submittingRef.current = false; setSubmitting(false); },
    }); } catch (error) {
      submittingRef.current = false; setSubmitting(false);
      toast.error(messaggioErroreOperai(error, 'Assegnazione non riuscita. Riprova.'));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (submittingRef.current) return;
        setOpen(o);
        if (!o) reset();
      }}
    >
      {!controllato && <DialogTrigger asChild>
        <Button aria-label={triggerAriaLabel} variant={triggerVariant} size="sm" className={triggerClassName} disabled={!puoSquadra && !puoPersona}>
          <Plus className="mr-1 h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>}
      <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-xl">
        <DialogHeader className="shrink-0">
          <DialogTitle className="pr-6">Assegna chi lavora</DialogTitle>
          <DialogDescription>Scegli chi e dove. I dettagli facoltativi restano in fondo.</DialogDescription>
        </DialogHeader>

        <div data-testid="assignment-dialog-scroll" role="region" aria-label="Dati assegnazione" className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pr-1" style={{ WebkitOverflowScrolling: 'touch' }}>
        <fieldset disabled={submitting || contextChanged} className="min-w-0 space-y-4">
          {contextChanged && <p role="alert" className="text-sm text-rose-700">Azienda o commessa cambiata. Chiudi e riapri questa finestra prima di assegnare.</p>}
          {/* Tipo toggle */}
          <div className="space-y-1.5">
            <Label>Chi assegni</Label>
            <div className="grid grid-cols-3 gap-2">
              {([
                {type: "interno", label: "Persona", icon: User, allowed: puoPersona},
                {type: "squadra", label: "Squadra interna", icon: UsersRound, allowed: puoSquadra},
                {type: "esterno", label: "Ditta", icon: Users, allowed: puoPersona},
              ] as const).filter(choice => choice.allowed).map(choice => <Button
                key={choice.type} type="button" variant={tipo === choice.type ? "default" : "outline"} aria-pressed={tipo === choice.type}
                onClick={() => { if (tipo === choice.type) return; setTipo(choice.type); setExecutorId(""); setTariffaId(""); setVarianteId(""); setPrev("0"); setCons("0"); setPlannedHours(""); setNotes(""); setCapo(false); setCostsOpen(false); }}
                className="h-auto min-h-11 whitespace-normal px-2 py-2 text-xs sm:text-sm"
              ><choice.icon className="mr-1 h-4 w-4 shrink-0" />{choice.label}</Button>)}
            </div>
          </div>

          {/* Executor picker */}
          <div className="space-y-1.5">
            <Label>{tipo === "squadra" ? "Squadra interna" : tipo === "interno" ? "Persona" : "Ditta / subappaltatore"}</Label>
            <Select value={executorId} disabled={!!companiesUnavailable} onValueChange={(v) => {
              if (v === executorId) return;
              if (executorId) {
                setPrev("0"); setCons("0"); setNotes("");
                if (!tariffaSel) setTariffaId("");
              }
              setExecutorId(v);
              setPlannedHours("");
              setCapo(false);
              setVarianteId("");
              if (tariffaSel) {
                if (tariffaSel.external_team_id && tariffaSel.external_team_id !== v) {
                  setTariffaId(""); setPrev("0");
                  setNotes(n => /^Listino: /.test(n) ? "" : n);
                  return;
                }
                const squadra = tipo === "esterno" ? v : "";
                const vs = squadra
                  ? varianti.filter((x) => x.tariffa_id === tariffaSel.id && x.external_team_id === squadra && x.attivo !== false)
                      .sort((a, b) => Number(b.is_default ?? false) - Number(a.is_default ?? false) || (a.sort_order ?? 0) - (b.sort_order ?? 0))
                  : [];
                applyTariffa(tariffaSel, tariffaQty, vs[0]?.costo ?? tariffaSel.prezzo_costo ?? null);
              }
            }}>
              <SelectTrigger aria-label="Scegli chi">
                <SelectValue
                  placeholder={
                    companiesUnavailable ? ditteQuery.isError ? 'Elenco ditte non disponibile' : 'Caricamento ditte…' : options.length === 0
                      ? tipo === "interno"
                        ? "Nessun operaio disponibile"
                        : tipo === "squadra" ? "Nessuna squadra disponibile" : "Nessuna ditta disponibile"
                      : "Seleziona…"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.id} value={o.id} disabled={'unavailableReason' in o && !!o.unavailableReason}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {tipo === 'esterno' && (ditteQuery.isError ? <div role="alert" className="text-sm text-rose-700">Non riesco a caricare ditte e subappaltatori. Non è un elenco vuoto. <Button type="button" size="sm" variant="outline" onClick={() => void ditteQuery.refetch()}>Riprova ditte</Button></div>
              : ditteQuery.isLoading || ditteQuery.isFetching ? <p role="status" className="text-xs text-muted-foreground">Caricamento ditte e subappaltatori…</p>
              : options.length === 0 ? <p className="text-xs text-muted-foreground">Non risultano ditte o subappaltatori attivi per questa azienda.</p> : <p className="text-xs text-muted-foreground">Ditte e subappaltatori della tua azienda. I collegamenti già presenti non vengono duplicati.</p>)}
            {selectedCompany?.unavailableReason && <p role="alert" className="text-sm text-amber-800">{selectedCompany.unavailableReason}</p>}
          </div>
          <label className="block space-y-1.5 text-sm font-medium">Dove lavora
            <select aria-label="Fase" value={selectedPhase} onChange={e => setSelectedPhase(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">Tutta la commessa</option>
              {phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <p className="text-xs text-muted-foreground" aria-live="polite">{selectedPhase
            ? "Incarico aggiuntivo su questa lavorazione: non rimuove la squadra generale né gli altri assegnati."
            : "Incarico generale della commessa. Le assegnazioni già presenti nelle singole lavorazioni restano invariate."}</p>
          {tipo === "squadra" && <>
            {squadreQuery.isLoading || squadreAssegnate.isLoading ? <p role="status" className="text-xs text-muted-foreground">Caricamento squadre…</p> : squadreQuery.isError || squadreAssegnate.isError ? <div role="alert" className="text-sm text-rose-700">Squadre non disponibili. <Button variant="outline" size="sm" onClick={() => {void squadreQuery.refetch(); void squadreAssegnate.refetch();}}>Riprova squadre</Button></div> : options.length === 0 && <a className="text-sm underline" href="/azienda/manodopera?tab=operai&vista=squadre">Crea una squadra in Manodopera</a>}
            {squadra && <div className="rounded-lg border bg-slate-50 p-3 text-sm"><p className="font-medium">Caposquadra: {squadra.responsabile ? `${squadra.responsabile.nome} ${squadra.responsabile.cognome}` : "da impostare nella squadra"}</p><p className="mt-1 text-xs text-muted-foreground">{squadra.componenti.map(p => `${p.nome} ${p.cognome}`).join(", ") || "Squadra senza componenti"}</p></div>}
            {selectedPhase ? <p className="text-xs text-muted-foreground">La squadra segue le date della lavorazione. Le modifichi nella fase.</p> : <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="assignment-crew-start">Dal</Label><Input id="assignment-crew-start" type="date" value={dal} onChange={e => setDal(e.target.value)} /></div><div><Label htmlFor="assignment-crew-end">Al</Label><Input id="assignment-crew-end" type="date" min={dal || undefined} value={al} onChange={e => setAl(e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">Vuoto: finché non la togli.</p></div></div>}
            {squadra?.responsabile && <label className="flex items-start gap-2 rounded-lg border p-3 text-sm"><Checkbox checked={capo} onCheckedChange={v => setCapo(v === true)} /><span>Usa il caposquadra come capocantiere<span className="block text-xs text-muted-foreground">Solo se ha l'app e la commessa non ha già un capocantiere.</span></span></label>}
            <p className="text-xs text-muted-foreground">I componenti con account Campo ricevono l'assegnazione. Il consuntivo arriva dai rapportini approvati: ore di ciascuno × il suo costo orario, senza contare la squadra una seconda volta.</p>
          </>}

          {/* Chi lavora vede la commessa nell'app: si dice prima di salvare. */}
          {(() => {
            if (tipo === "squadra") return null;
            const scelto = tipo === "interno" ? employees.find(e => e.id === executorId) : undefined;
            const quando = selectedPhase ? "nei giorni della fase" : "per tutta la durata dei lavori";
            if (scelto && !scelto.campoUserId) {
              return <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{scelto.label} non ha l'app: lavorerà qui ma non vedrà la commessa sul telefono. Puoi dargli l'app dalla sua scheda in Manodopera.</p>;
            }
            return <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">{scelto
              ? `${scelto.label} vedrà la commessa nell'app ${quando}.`
              : tipo === "interno"
                ? `Chi metti qui vede la commessa nell'app ${quando}, se ha l'app.`
                : `Se la ditta ha l'app, vede la commessa ${quando}.`}</p>;
          })()}

          {tipo === "interno" && <div className="space-y-2 rounded-lg border bg-slate-50 p-3 text-sm">
            <p className="font-medium">Il costo segue le ore lavorate</p>
            <p className="text-xs text-muted-foreground">Assegnare non registra una spesa. I rapportini approvati aggiornano ore e costo della commessa. La timbratura da sola non è un costo definitivo.</p>
            {canViewCosts && executorId && (rate.isLoading ? <p role="status">Caricamento costo orario…</p> : rate.isError ? <p role="alert">Costo orario non disponibile. <Button size="sm" variant="outline" onClick={() => void rate.refetch()}>Riprova costo orario</Button></p> : rate.allowed ? <p className="text-xs">Costo orario attuale: <strong>{currentRate == null ? "da impostare" : `${eur.format(currentRate)} / h`}</strong>{currentRate == null ? ". Le ore senza tariffa richiedono verifica." : ". Vale per i prossimi rapportini; lo storico non viene ricalcolato."}</p> : <p className="text-xs text-muted-foreground">La tariffa personale è riservata al tuo ruolo.</p>)}
            {canViewPersone && <a href="/azienda/personale?tab=profili" className="text-xs underline">Gestisci costi in Personale e HR</a>}
          </div>}
          {tipo === "interno" && canViewCosts && <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Prevedi le ore (facoltativo)</summary>
            <div className="mt-3 space-y-2"><Label htmlFor="assign-planned-hours">Ore previste</Label><Input id="assign-planned-hours" type="text" inputMode="decimal" autoComplete="off" value={plannedHours} disabled={currentRate == null} onChange={e => setPlannedHours(e.target.value)} placeholder="Es. 16 oppure 1,5" />
              <p className="text-xs text-muted-foreground">{currentRate == null ? "Imposta prima il costo orario. Puoi comunque assegnare senza budget." : `Budget previsto: ${plannedCost == null ? "—" : eur.format(plannedCost)}. Non aggiunge ore al consuntivo.`}</p>
            </div>
          </details>}
          {tipo === "esterno" && <p className="text-xs text-muted-foreground">La ditta non usa il costo orario dei dipendenti. Qui registri l'assegnazione; contratto, SAL e pagamenti si gestiscono nel subappalto.</p>}
          {tipo === "esterno" && canViewCosts && <details open={costsOpen} onToggle={e => setCostsOpen(e.currentTarget.open)} className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Budget ditta e listino (facoltativo)</summary>
            <div className="mt-3 space-y-3">
          {(tariffeError || variantiError) && <p role="alert" className="text-xs text-amber-800">Listino non disponibile. Puoi inserire manualmente il costo; non applico tariffe incomplete.</p>}
          {listinoBusy && <p role="status" className="text-xs text-muted-foreground">Caricamento listino e varianti… Puoi intanto compilare gli importi manuali.</p>}
          {listinoIncompleto && <p role="alert" className="text-xs text-amber-800">La tariffa selezionata non è verificata o non è più disponibile. Attendi il caricamento, riprova il listino oppure conferma l’uso di importi manuali.</p>}
          {tariffaAggiornata && !listinoBusy && !tariffeError && !variantiError && <Button type="button" size="sm" variant="outline" onClick={() => applyTariffa(tariffaSel, tariffaQty, costoUnitarioEffettivo)}>Aggiorna da listino</Button>}
          {(tariffeError || variantiError) && <Button type="button" size="sm" variant="outline" onClick={() => { void refetchTariffe(); void refetchVarianti(); }}>Riprova listino</Button>}
          {tariffaId && <Button type="button" size="sm" variant="outline" onClick={() => { setTariffaId(""); setVarianteId(""); setNotes(n => /^Listino: /.test(n) ? "" : n); }}>Usa importi manuali</Button>}
          {daPreventivo.netto > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-900">
              <span className="min-w-0 flex-1">
                Dal preventivo: {daPreventivo.voci === 1 ? "1 voce" : `${daPreventivo.voci} voci`} di questa lavorazione,{" "}
                <strong>{eur.format(daPreventivo.netto)}</strong>{ivaSel === 0 ? <> {piuIva}</> : <> {piuIva} = {eur.format(conIva(daPreventivo.netto, ivaSel))}</>}
                {daPreventivo.conVariante > 0 && <> · {daPreventivo.conVariante} al prezzo di questa ditta</>}
              </span>
              {origine?.tipo !== "preventivo" && <Button type="button" size="sm" variant="outline" onClick={applyPreventivo}>Usa questo costo</Button>}
            </div>
          )}
          {/* Da listino manodopera: prefill costo sostenuto + ricarico visibile.
              L'azienda può importare il prezziario regionale o caricare il
              proprio listino in Impostazioni → Tariffe. */}
          {canViewCosts && !listinoBusy && !tariffeError && !variantiError && tariffeAttive.length > 0 && (
            <div className="space-y-1.5 rounded-lg border bg-muted/20 p-2.5">
              <Label className="text-xs text-muted-foreground">
                Parti dal listino manodopera — costo compilato da solo
              </Label>
              <div className="flex gap-2">
                <Select
                  value={tariffaSel ? tariffaId : ""}
                  onValueChange={(v) => {
                    setTariffaId(v);
                    setVarianteId("");
                    const t = tariffeAttive.find((x) => x.id === v) ?? null;
                    // La quantità della lavorazione, se il preventivo ha una voce con questa tariffa.
                    const qFase = t ? quantitaDellaTariffa(vociFase, t.id) : null;
                    const qty = qFase != null && qFase > 0 ? String(qFase).replace(".", ",") : tariffaQty;
                    if (qty !== tariffaQty) setTariffaQty(qty);
                    // risolvo al volo: lo stato non e' ancora aggiornato
                    const vs = t && squadraSelezionata
                      ? varianti.filter((x) => x.tariffa_id === t.id && x.external_team_id === squadraSelezionata && x.attivo !== false)
                          .sort((a, b) => Number(b.is_default ?? false) - Number(a.is_default ?? false) || (a.sort_order ?? 0) - (b.sort_order ?? 0))
                      : [];
                    applyTariffa(t, qty, vs[0]?.costo ?? t?.prezzo_costo ?? null);
                  }}
                >
                  <SelectTrigger aria-label="Parti dal listino manodopera" className="h-9 flex-1">
                    <SelectValue placeholder="Cerca una voce di listino…" />
                  </SelectTrigger>
                  <SelectContent>
                    {tariffeAttive.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nome} · {eur.format(Number(t.prezzo_costo) || 0)}
                        {t.unita ? `/${t.unita}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={tariffaQty}
                  onChange={(e) => {
                    setTariffaQty(e.target.value);
                    applyTariffa(tariffaSel, e.target.value, costoUnitarioEffettivo);
                  }}
                  className="h-9 w-20"
                  aria-label="Quantità"
                  aria-invalid={invalidQuantity}
                />
              </div>
              {invalidQuantity && <p role="alert" className="text-xs text-rose-700">Completa la quantità con un numero valido, per esempio 1,5. Il budget precedente non verrà salvato.</p>}
              {/* La squadra ha piu' varianti di questa lavorazione (es. su
                  nuovo / con smontaggio): la scelta e' esplicita. Con una sola
                  variante si applica da sola. */}
              {variantiSquadra.length > 1 && (
                <Select
                  value={varianteSel?.id ?? ""}
                  onValueChange={(v) => {
                    setVarianteId(v);
                    const vr = variantiSquadra.find((x) => x.id === v);
                    applyTariffa(tariffaSel, tariffaQty, vr?.costo ?? null);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Variante della squadra…" />
                  </SelectTrigger>
                  <SelectContent>
                    {variantiSquadra.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.nome} · {eur.format(Number(v.costo) || 0)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {tariffaSel && (
                <p className="text-[11px] text-muted-foreground">
                  {varianteSel ? (
                    <>Variante <strong className="text-foreground">{varianteSel.nome}</strong>: </>
                  ) : null}
                  Costo {eur.format(Number(costoUnitarioEffettivo) || 0)}
                  {tariffaSel.unita ? `/${tariffaSel.unita}` : ""} × {tariffaQty || "1"} ={" "}
                  {eur.format((Number(costoUnitarioEffettivo) || 0) * (parseAssignmentAmount(tariffaQty, 6) ?? 0))} {piuIva} → previsto{" "}
                  <strong className="text-foreground">{eur.format(num(prev))}</strong>
                  {canViewMargins && Number(tariffaSel.prezzo_vendita) > 0 && (
                    <>
                      {" "}· vendita consigliata{" "}
                      {eur.format(
                        (Number(tariffaSel.prezzo_vendita) || 0) *
                          (parseAssignmentAmount(tariffaQty, 6) ?? 0),
                      )}{" "}
                      <span className="text-emerald-600">
                        (ricarico{" "}
                        {Number(costoUnitarioEffettivo) > 0
                          ? Math.round(
                              ((Number(tariffaSel.prezzo_vendita) -
                                Number(costoUnitarioEffettivo)) /
                                Number(costoUnitarioEffettivo)) *
                                100,
                            )
                          : "—"}
                        %)
                      </span>
                    </>
                  )}
                </p>
              )}
            </div>
          )}

          {/* Costs */}
          {canViewCosts && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="assign-prev">Costo previsto ditta · {testoIvaDitta(ivaSel)} €</Label>
              <Input
                id="assign-prev"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={prev}
                onChange={(e) => setPrev(e.target.value)}
                onBlur={() => setPrev(formatAssignmentAmount(prev))}
                aria-invalid={parseAssignmentAmount(prev) == null}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assign-cons">Costo ditta già registrato · {testoIvaDitta(ivaSel)} €</Label>
              <Input
                id="assign-cons"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={cons}
                onChange={(e) => setCons(e.target.value)}
                onBlur={() => setCons(formatAssignmentAmount(cons))}
                aria-invalid={parseAssignmentAmount(cons) == null}
              />
            </div>
          </div>}
          {(parseAssignmentAmount(prev) == null || parseAssignmentAmount(cons) == null) && <p role="alert" className="text-xs text-rose-700">Controlla gli importi: usa per esempio 1.234,56. Importi negativi o testi incompleti non vengono salvati.</p>}
          <p className="text-xs text-muted-foreground">Non inserire qui un importo già imputato da fatture o altri costi. Un pagamento o un contratto non è automaticamente un nuovo costo.</p>

            </div>
          </details>}

          {/* Notes */}
          {tipo !== "squadra" && <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Note (facoltativo)</summary><div className="mt-3 space-y-1.5">
            <Label htmlFor="assign-notes">Note (facoltativo)</Label>
            <Textarea
              id="assign-notes"
              value={notes}
              rows={2}
              placeholder="Dettagli, accordi, riferimenti…"
              onChange={(e) => setNotes(e.target.value)}
            />
          </div></details>}
        </fieldset>
        </div>

        <DialogFooter className="shrink-0 border-t pt-3">
          <Button variant="outline" disabled={submitting} onClick={() => { reset(); setOpen(false); }}>
            Annulla
          </Button>
          <Button aria-label="Conferma assegnazione" onClick={handleSubmit} disabled={submitting || contextChanged || companiesUnavailable || listinoIncompleto || !!selectedCompany?.unavailableReason || !executorId || (tipo === "squadra" ? !puoSquadra || squadreQuery.isLoading || squadreQuery.isError || squadreAssegnate.isLoading || squadreAssegnate.isError : !puoPersona)}>
            {submitting ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-1 h-4 w-4" />
            )}
            <span className="sm:hidden">Assegna</span><span className="hidden sm:inline">Conferma assegnazione</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
