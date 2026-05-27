import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Settings, AlertCircle, CheckCircle2, TrendingUp, Plus, Calendar,
  User, Zap, Sun, Wind, Bolt, Home, Droplets, CheckSquare, ClipboardCheck, Users
} from "lucide-react";
import { format, addDays, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { NuovoImpiantoWizard } from "@/components/manutenzione/NuovoImpiantoWizard";
import { type StaffUser, useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { OperationalKpiCard } from "@/components/orders/OperationalKpiCard";

const KEEP_VALUE = "__keep__";
const UNASSIGNED_VALUE = "__unassigned__";

type ProfileSummary = {
  first_name: string | null;
  last_name: string | null;
};

type ImpiantoCliente = {
  id: string;
  tipo_impianto: string;
  marca: string | null;
  modello: string | null;
  garanzia_scadenza: string | null;
  data_installazione: string | null;
  customer: ProfileSummary | null;
};

type ContrattoManutenzione = {
  id: string;
  nome_contratto: string;
  stato: string | null;
  importo_canone: number;
  tipo_fatturazione: string | null;
  customer: ProfileSummary | null;
  impianto: {
    tipo_impianto: string | null;
    marca: string | null;
    modello: string | null;
  } | null;
};

type MaintenancePlan = {
  id: string;
  titolo: string;
  contratto: {
    nome_contratto: string | null;
    customer_id: string | null;
    impianto_id: string | null;
    customer: ProfileSummary | null;
  } | null;
  tecnico: ProfileSummary | null;
  tecnico_preferito: string | null;
  frequenza_tipo: string;
  frequenza_giorni: number | null;
  prossima_scadenza: string | null;
};

const TIPO_ICONE: Record<string, React.ElementType> = {
  caldaia: Zap,
  fotovoltaico: Sun,
  climatizzatore: Wind,
  impianto_elettrico: Bolt,
  infissi: Home,
  idraulico: Droplets,
};

function GaranziaScadenzaBadge({ date }: { date: string | null }) {
  if (!date) return null;
  const days = differenceInDays(new Date(date), new Date());
  if (days < 0) return <Badge className="text-xs bg-red-100 text-red-800">Garanzia scaduta</Badge>;
  if (days < 90) return <Badge className="text-xs bg-yellow-100 text-yellow-800">Garanzia: {days}gg</Badge>;
  return <Badge className="text-xs bg-green-100 text-green-800">Garanzia ok</Badge>;
}

export default function ManutenzioneList() {
  const { effectiveCompany, user } = useAuth();
  const permissions = usePermissions();
  const queryClient = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedPianoIds, setSelectedPianoIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkTecnico, setBulkTecnico] = useState(KEEP_VALUE);

  const { data: staffList = [] } = useCompanyStaffUsers(effectiveCompany?.id);

  // 2026-05-27 (Security audit): tecnico con only_assigned=true vede SOLO
  // impianti / contratti / piani col proprio tecnico_preferito. Senza filtro
  // server-side il tecnico scaricava tutto e vedeva su UI dati di colleghi.
  const { data: impianti = [], isLoading: loadingImpianti } = useQuery({
    queryKey: ["impianti", effectiveCompany?.id, permissions.onlyAssigned, user?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      let query = supabase
        .from("impianti_cliente")
        .select("*, customer:profiles!impianti_cliente_customer_id_fkey(first_name, last_name)")
        .eq("company_id", effectiveCompany.id)
        .eq("attivo", true)
        .order("created_at", { ascending: false });
      if (permissions.onlyAssigned && user?.id) {
        query = query.eq("tecnico_preferito", user.id);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as ImpiantoCliente[];
    },
    enabled: !!effectiveCompany?.id,
  });

  const { data: contratti = [], isLoading: loadingContratti } = useQuery({
    queryKey: ["contratti-manutenzione", effectiveCompany?.id, permissions.onlyAssigned, user?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      let query = supabase
        .from("contratti_manutenzione")
        .select("*, impianto:impianti_cliente(tipo_impianto, marca, modello), customer:profiles!contratti_manutenzione_customer_id_fkey(first_name, last_name)")
        .eq("company_id", effectiveCompany.id)
        .order("created_at", { ascending: false });
      if (permissions.onlyAssigned && user?.id) {
        query = query.eq("tecnico_preferito", user.id);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as ContrattoManutenzione[];
    },
    enabled: !!effectiveCompany?.id,
  });

  const { data: pianiInScadenza = [], isLoading: loadingPiani } = useQuery({
    queryKey: ["piani-scadenza", effectiveCompany?.id, permissions.onlyAssigned, user?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      const scadenza14 = addDays(new Date(), 14).toISOString().split("T")[0];
      let query = supabase
        .from("piani_manutenzione")
        .select("*, contratto:contratti_manutenzione(nome_contratto, customer_id, impianto_id, customer:profiles!contratti_manutenzione_customer_id_fkey(first_name, last_name)), tecnico:profiles!piani_manutenzione_tecnico_preferito_fkey(first_name, last_name)")
        .eq("company_id", effectiveCompany.id)
        .eq("attivo", true)
        .lte("prossima_scadenza", scadenza14)
        .order("prossima_scadenza", { ascending: true });
      if (permissions.onlyAssigned && user?.id) {
        query = query.eq("tecnico_preferito", user.id);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as MaintenancePlan[];
    },
    enabled: !!effectiveCompany?.id,
  });

  const pianificaMutation = useMutation({
    mutationFn: async (piano: MaintenancePlan) => {
      // Calcola prossima scadenza in base alla frequenza
      const oggi = new Date();
      const FREQ_GIORNI: Record<string, number> = {
        mensile: 30, trimestrale: 90, semestrale: 180, annuale: 365
      };
      const giorniFreq = piano.frequenza_giorni ?? FREQ_GIORNI[piano.frequenza_tipo] ?? 365;
      const prossima = addDays(oggi, giorniFreq).toISOString().split("T")[0];

      // Crea ticket intervento
      const customerId = piano.contratto?.customer_id;
      if (!customerId || !effectiveCompany?.id) throw new Error("Dati mancanti");

      const { error: ticketErr } = await supabase.from("tickets").insert({
        company_id: effectiveCompany.id,
        customer_id: customerId,
        subject: `Manutenzione programmata: ${piano.titolo}`,
        tipo: "intervento",
        status: "aperto",
        priority: "normale",
        assigned_to: piano.tecnico_preferito || null,
        impianto_id: piano.contratto?.impianto_id ?? null,
      });
      if (ticketErr) throw ticketErr;

      // Aggiorna solo la prossima scadenza: l'esecuzione si registra quando l'intervento viene completato.
      const { error: pianoErr } = await supabase
        .from("piani_manutenzione")
        .update({ prossima_scadenza: prossima })
        .eq("id", piano.id);
      if (pianoErr) throw pianoErr;
    },
    onSuccess: () => {
      toast.success("Intervento pianificato e ticket creato");
      queryClient.invalidateQueries({ queryKey: ["piani-scadenza", effectiveCompany?.id] });
    },
    onError: (err: Error) => toast.error(err.message || "Errore nella pianificazione"),
  });

  const selectedPiani = useMemo(
    () => pianiInScadenza.filter((piano) => selectedPianoIds.has(piano.id)),
    [pianiInScadenza, selectedPianoIds],
  );
  const selectedAllDue = pianiInScadenza.length > 0 && pianiInScadenza.every((piano) => selectedPianoIds.has(piano.id));

  const togglePianoSelection = (pianoId: string) => {
    setSelectedPianoIds((current) => {
      const next = new Set(current);
      if (next.has(pianoId)) next.delete(pianoId);
      else next.add(pianoId);
      return next;
    });
  };

  const toggleAllDue = () => {
    setSelectedPianoIds((current) => {
      const next = new Set(current);
      if (selectedAllDue) pianiInScadenza.forEach((piano) => next.delete(piano.id));
      else pianiInScadenza.forEach((piano) => next.add(piano.id));
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedPianoIds(new Set());
    setBulkTecnico(KEEP_VALUE);
  };

  const updatePianiTecnicoMutation = useMutation({
    mutationFn: async ({ ids, tecnicoId }: { ids: string[]; tecnicoId: string | null }) => {
      if (!effectiveCompany?.id || ids.length === 0) return;
      const { error } = await supabase
        .from("piani_manutenzione")
        .update({ tecnico_preferito: tecnicoId })
        .eq("company_id", effectiveCompany.id)
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["piani-scadenza", effectiveCompany?.id] });
      toast.success(variables.ids.length === 1 ? "Tecnico aggiornato" : `${variables.ids.length} piani aggiornati`);
    },
    onError: (err: Error) => toast.error(err.message || "Aggiornamento tecnico non riuscito"),
  });

  const completePianiMutation = useMutation({
    mutationFn: async (piani: MaintenancePlan[]) => {
      if (!effectiveCompany?.id || piani.length === 0) return;
      const today = new Date();
      const todayIso = today.toISOString().split("T")[0];
      const FREQ_GIORNI: Record<string, number> = {
        mensile: 30,
        trimestrale: 90,
        semestrale: 180,
        annuale: 365,
      };

      for (const piano of piani) {
        const giorniFreq = piano.frequenza_giorni ?? FREQ_GIORNI[piano.frequenza_tipo] ?? 365;
        const prossima = addDays(today, giorniFreq).toISOString().split("T")[0];
        const { error: esecuzioneError } = await supabase.from("esecuzioni_manutenzione").insert({
          piano_id: piano.id,
          tecnico_id: piano.tecnico_preferito || null,
          data_esecuzione: todayIso,
          esito: "ok",
          note: "Manutenzione completata da azione massiva",
        });
        if (esecuzioneError) throw esecuzioneError;

        const { error: pianoError } = await supabase
          .from("piani_manutenzione")
          .update({ ultima_esecuzione: todayIso, prossima_scadenza: prossima })
          .eq("company_id", effectiveCompany.id)
          .eq("id", piano.id);
        if (pianoError) throw pianoError;
      }
    },
    onSuccess: async (_data, piani) => {
      await queryClient.invalidateQueries({ queryKey: ["piani-scadenza", effectiveCompany?.id] });
      toast.success(piani.length === 1 ? "Manutenzione completata" : `${piani.length} manutenzioni completate`);
      clearSelection();
      setBulkOpen(false);
    },
    onError: (err: Error) => toast.error(err.message || "Completamento non riuscito"),
  });

  const applyBulkTecnico = () => {
    const ids = Array.from(selectedPianoIds);
    if (bulkTecnico === KEEP_VALUE) {
      toast.info("Seleziona un tecnico da applicare");
      return;
    }
    updatePianiTecnicoMutation.mutate(
      { ids, tecnicoId: bulkTecnico === UNASSIGNED_VALUE ? null : bulkTecnico },
      {
        onSuccess: () => {
          clearSelection();
          setBulkOpen(false);
        },
      },
    );
  };

  const mrr = contratti
    .filter((c) => c.stato === "attivo")
    .reduce((sum: number, c) => {
      const mensile = c.tipo_fatturazione === "mensile" ? c.importo_canone
        : c.tipo_fatturazione === "trimestrale" ? c.importo_canone / 3
        : c.tipo_fatturazione === "semestrale" ? c.importo_canone / 6
        : c.importo_canone / 12;
      return sum + mensile;
    }, 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 px-4 py-5 shadow-sm sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
              <Settings className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">Manutenzione Programmata</h1>
              <p className="mt-0.5 text-sm text-slate-500">Impianti, contratti e piani manutenzione clienti.</p>
            </div>
          </div>
          <Button
            onClick={() => setWizardOpen(true)}
            className="self-start gap-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm hover:from-orange-600 hover:to-amber-600 sm:self-auto"
          >
            <Plus className="h-4 w-4" />
            Nuovo Impianto
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <OperationalKpiCard icon={Settings} label="Impianti" value={impianti.length} hint="installazioni censite" tone="blue" />
        <OperationalKpiCard icon={AlertCircle} label="In scadenza" value={pianiInScadenza.length} hint="prossimi 14 giorni" tone={pianiInScadenza.length > 0 ? "orange" : "green"} />
        <OperationalKpiCard icon={CheckCircle2} label="Contratti attivi" value={contratti.filter((c) => c.stato === "attivo").length} hint="canoni ricorrenti" tone="green" />
        <OperationalKpiCard icon={TrendingUp} label="MRR" value={`€${mrr.toFixed(0)}`} hint="ricavi mensili stimati" tone="amber" />
      </div>

      {selectedPianoIds.size > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-orange-200 bg-orange-50/80 p-3 text-sm text-orange-950 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-orange-600">{selectedPianoIds.size} selezionati</Badge>
            <span>Pronti per cambio tecnico, pianificazione o completamento.</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={clearSelection}>Annulla selezione</Button>
            <Button size="sm" onClick={() => setBulkOpen(true)}>Azioni manutenzione</Button>
          </div>
        </div>
      )}

      <Tabs defaultValue="scadenza">
        <TabsList>
          <TabsTrigger value="scadenza">
            In Scadenza {pianiInScadenza.length > 0 && <span className="ml-1 text-xs bg-orange-100 text-orange-700 rounded-full px-1.5">{pianiInScadenza.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="impianti">Impianti ({impianti.length})</TabsTrigger>
          <TabsTrigger value="contratti">Contratti ({contratti.length})</TabsTrigger>
        </TabsList>

        {/* Tab: In Scadenza */}
        <TabsContent value="scadenza" className="mt-4 space-y-3">
          {loadingPiani ? (
            <div className="space-y-3">{[1,2,3].map((n) => <Skeleton key={n} className="h-16 rounded-lg" />)}</div>
          ) : pianiInScadenza.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <CheckCircle2 className="h-10 w-10 text-gray-300 mx-auto mb-2" />
              <p>Nessuna manutenzione in scadenza nei prossimi 14 giorni</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-lg border bg-white px-4 py-2 text-sm">
                <label className="flex items-center gap-2 font-medium">
                  <Checkbox checked={selectedAllDue} onCheckedChange={toggleAllDue} aria-label="Seleziona manutenzioni in scadenza" />
                  Seleziona manutenzioni visibili
                </label>
                <span className="text-slate-500">{pianiInScadenza.length} piani in scadenza</span>
              </div>
              {pianiInScadenza.map((piano) => {
            const days = piano.prossima_scadenza ? differenceInDays(new Date(piano.prossima_scadenza), new Date()) : null;
            return (
              <div key={piano.id} className="bg-white rounded-lg border p-4 flex items-start justify-between gap-4">
                <Checkbox checked={selectedPianoIds.has(piano.id)} onCheckedChange={() => togglePianoSelection(piano.id)} aria-label={`Seleziona ${piano.titolo}`} className="mt-1" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{piano.titolo}</span>
                    {days !== null && (
                      <Badge className={days < 0 ? "bg-red-100 text-red-800 text-xs" : days <= 7 ? "bg-orange-100 text-orange-800 text-xs" : "bg-yellow-100 text-yellow-800 text-xs"}>
                        {days < 0 ? `Scaduto ${Math.abs(days)}gg fa` : days === 0 ? "Scade oggi" : `Scade tra ${days}gg`}
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 mt-1 flex gap-3 flex-wrap">
                    {(piano.contratto?.customer?.first_name || piano.contratto?.customer?.last_name) && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {[piano.contratto.customer?.first_name, piano.contratto.customer?.last_name].filter(Boolean).join(" ")}
                      </span>
                    )}
                    {piano.prossima_scadenza && (
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(piano.prossima_scadenza), "dd MMM yyyy", { locale: it })}</span>
                    )}
                    {(piano.tecnico?.first_name || piano.tecnico?.last_name) && (
                      <span className="text-blue-600">
                        {[piano.tecnico.first_name, piano.tecnico.last_name].filter(Boolean).join(" ")}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 max-w-xs">
                    <Select
                      value={piano.tecnico_preferito || UNASSIGNED_VALUE}
                      onValueChange={(value) => updatePianiTecnicoMutation.mutate({
                        ids: [piano.id],
                        tecnicoId: value === UNASSIGNED_VALUE ? null : value,
                      })}
                      disabled={updatePianiTecnicoMutation.isPending}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Tecnico preferito" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED_VALUE}>Tecnico da assegnare</SelectItem>
                        {staffList.map((staff) => (
                          <SelectItem key={staff.id} value={staff.id}>
                            {[staff.first_name, staff.last_name].filter(Boolean).join(" ") || "Senza nome"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pianificaMutation.isPending}
                    onClick={() => pianificaMutation.mutate(piano)}
                  >
                    Pianifica
                  </Button>
                  <Button
                    size="sm"
                    disabled={completePianiMutation.isPending}
                    onClick={() => completePianiMutation.mutate([piano])}
                  >
                    Completa
                  </Button>
                </div>
              </div>
            );
              })}
            </>
          )}
        </TabsContent>

        {/* Tab: Impianti */}
        <TabsContent value="impianti" className="mt-4 space-y-3">
          {loadingImpianti ? (
            <div className="space-y-3">{[1,2,3].map((n) => <Skeleton key={n} className="h-16 rounded-lg" />)}</div>
          ) : impianti.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Settings className="h-10 w-10 text-gray-300 mx-auto mb-2" />
              <p>Nessun impianto registrato</p>
              <Button className="mt-4 gap-2" size="sm" onClick={() => setWizardOpen(true)}>
                <Plus className="h-4 w-4" /> Aggiungi Impianto
              </Button>
            </div>
          ) : impianti.map((impianto) => {
            const ImpiantoIcon = TIPO_ICONE[impianto.tipo_impianto] ?? Settings;
            return (
              <Link key={impianto.id} to={`/azienda/manutenzione/impianto/${impianto.id}`}
                className="block bg-white rounded-lg border p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-blue-50 rounded-lg">
                      <ImpiantoIcon className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold capitalize">{impianto.tipo_impianto.replace('_', ' ')}</span>
                        {impianto.marca && <span className="text-gray-500 text-sm">{impianto.marca} {impianto.modello}</span>}
                      </div>
                      <div className="text-sm text-gray-500 mt-0.5 flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {[impianto.customer?.first_name, impianto.customer?.last_name].filter(Boolean).join(" ") || "—"}
                      </div>
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <GaranziaScadenzaBadge date={impianto.garanzia_scadenza} />
                    {impianto.data_installazione && (
                      <div className="text-xs text-gray-400">
                        Installato: {format(new Date(impianto.data_installazione), "dd/MM/yyyy")}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </TabsContent>

        {/* Tab: Contratti */}
        <TabsContent value="contratti" className="mt-4 space-y-3">
          {loadingContratti ? (
            <div className="space-y-3">{[1,2].map((n) => <Skeleton key={n} className="h-16 rounded-lg" />)}</div>
          ) : contratti.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <TrendingUp className="h-10 w-10 text-gray-300 mx-auto mb-2" />
              <p>Nessun contratto attivo</p>
            </div>
          ) : contratti.map((contratto) => (
            <div key={contratto.id} className="bg-white rounded-lg border p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{contratto.nome_contratto}</span>
                    <Badge className={contratto.stato === "attivo" ? "bg-green-100 text-green-800 text-xs" : contratto.stato === "sospeso" ? "bg-yellow-100 text-yellow-800 text-xs" : "bg-gray-100 text-gray-600 text-xs"}>
                      {contratto.stato}
                    </Badge>
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    {[contratto.customer?.first_name, contratto.customer?.last_name].filter(Boolean).join(" ") || "—"} · {contratto.impianto?.tipo_impianto?.replace('_', ' ')} {contratto.impianto?.marca}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-purple-700">€{Number(contratto.importo_canone).toFixed(2)}</div>
                  <div className="text-xs text-gray-400">{contratto.tipo_fatturazione}</div>
                </div>
              </div>
            </div>
          ))}
        </TabsContent>
      </Tabs>

      <NuovoImpiantoWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        companyId={effectiveCompany?.id ?? ""}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["impianti", effectiveCompany?.id] });
          queryClient.invalidateQueries({ queryKey: ["contratti-manutenzione", effectiveCompany?.id] });
        }}
      />

      <ManutenzioneBulkSheet
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        selectedPiani={selectedPiani}
        staffList={staffList}
        bulkTecnico={bulkTecnico}
        onBulkTecnicoChange={setBulkTecnico}
        onApplyTecnico={applyBulkTecnico}
        onComplete={() => completePianiMutation.mutate(selectedPiani)}
        onClear={clearSelection}
        isPending={updatePianiTecnicoMutation.isPending || completePianiMutation.isPending}
      />
    </div>
  );
}

function ManutenzioneBulkSheet({
  open,
  onOpenChange,
  selectedPiani,
  staffList,
  bulkTecnico,
  onBulkTecnicoChange,
  onApplyTecnico,
  onComplete,
  onClear,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedPiani: MaintenancePlan[];
  staffList: StaffUser[];
  bulkTecnico: string;
  onBulkTecnicoChange: (value: string) => void;
  onApplyTecnico: () => void;
  onComplete: () => void;
  onClear: () => void;
  isPending: boolean;
}) {
  const overdue = selectedPiani.filter((piano) => {
    if (!piano.prossima_scadenza) return false;
    return differenceInDays(new Date(piano.prossima_scadenza), new Date()) < 0;
  }).length;
  const assigned = selectedPiani.filter((piano) => piano.tecnico_preferito).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Azioni manutenzione</SheetTitle>
          <SheetDescription>
            Gestisci piu piani insieme: tecnico responsabile e completamento operativo.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <MaintenanceBulkStat icon={<CheckSquare className="h-4 w-4" />} label="Selezionati" value={selectedPiani.length} />
            <MaintenanceBulkStat icon={<AlertCircle className="h-4 w-4" />} label="Scaduti" value={overdue} />
            <MaintenanceBulkStat icon={<Users className="h-4 w-4" />} label="Assegnati" value={assigned} />
            <MaintenanceBulkStat icon={<ClipboardCheck className="h-4 w-4" />} label="Da verificare" value={selectedPiani.length - assigned} />
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Il completamento registra una esecuzione manutenzione e sposta la prossima scadenza in base alla frequenza del piano.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <label className="text-sm font-medium">Tecnico preferito</label>
            <Select value={bulkTecnico} onValueChange={onBulkTecnicoChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP_VALUE}>Non cambiare tecnico</SelectItem>
                <SelectItem value={UNASSIGNED_VALUE}>Rimuovi tecnico</SelectItem>
                {staffList.map((staff) => (
                  <SelectItem key={staff.id} value={staff.id}>
                    {[staff.first_name, staff.last_name].filter(Boolean).join(" ") || "Senza nome"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" className="w-full" onClick={onApplyTecnico} disabled={isPending || selectedPiani.length === 0}>
              Applica tecnico
            </Button>
          </div>
        </div>

        <SheetFooter className="mt-6 gap-2 sm:flex-col">
          <Button onClick={onComplete} disabled={isPending || selectedPiani.length === 0}>
            {isPending ? "Aggiornamento..." : "Segna completate"}
          </Button>
          <Button variant="outline" onClick={onClear} disabled={isPending}>Svuota selezione</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function MaintenanceBulkStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="mt-1 text-xl font-bold text-slate-900">{value}</div>
    </div>
  );
}
