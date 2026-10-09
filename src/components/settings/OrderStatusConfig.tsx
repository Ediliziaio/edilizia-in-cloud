import React, { useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus, Loader2, AlertTriangle, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { useVaiASezione } from "@/hooks/useVaiASezione";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AmbitoImpostazione,
  IndiceSezioni,
  RigaInterruttore,
  SezioneImpostazione,
  type VoceIndice,
} from "@/components/impostazioni/SezioneImpostazione";
import { AvvisoAreaClienti } from "@/components/impostazioni/AvvisoAreaClienti";
import { AvvisoSolaLetturaImpostazioni } from "@/components/impostazioni/AvvisoSolaLetturaImpostazioni";
import { StatusItem } from "./StatusItem";
import { OrderProgressTracker, type OrderStatus } from "@/components/orders/OrderProgressTracker";
import { cn } from "@/lib/utils";

/** Elenchi pronti per tipo di lavoro. Applicarne uno sostituisce la LISTA
 *  LOCALE (anteprima inclusa): gli stati con lo stesso nome — e lo stato
 *  Assistenza — riusano gli UUID esistenti, quindi storico e commesse collegate
 *  restano intatti. Nulla tocca il DB finché non si preme «Salva modifiche»; la RPC
 *  save_order_statuses blocca comunque l'eliminazione di stati con commesse. */
const PIPELINE_PRESETS: {
  key: string;
  label: string;
  hint: string;
  statuses: { name: string; icon: string; color: string }[];
}[] = [
  {
    key: "serramenti",
    label: "Serramenti / Infissi",
    hint: "Flusso prodotto: produzione → consegna → posa",
    statuses: [
      { name: "Contratto Firmato", icon: "FileSignature", color: "#2563EB" },
      { name: "Acconto Pagato", icon: "Euro", color: "#16A34A" },
      { name: "Rilievo Tecnico", icon: "ClipboardCheck", color: "#D97706" },
      { name: "In Produzione", icon: "Package", color: "#7C3AED" },
      { name: "Produzione Finita", icon: "PackageCheck", color: "#0891B2" },
      { name: "Merce in Magazzino", icon: "Truck", color: "#4F46E5" },
      { name: "Posa Programmata", icon: "CalendarClock", color: "#DB2777" },
      { name: "Posa Completata", icon: "CheckCircle2", color: "#16A34A" },
      { name: "Assistenza", icon: "Wrench", color: "#64748B" },
    ],
  },
  {
    key: "fotovoltaico",
    label: "Fotovoltaico",
    hint: "Sopralluogo → pratiche → installazione → allaccio",
    statuses: [
      { name: "Contratto Firmato", icon: "FileSignature", color: "#2563EB" },
      { name: "Acconto Pagato", icon: "Euro", color: "#16A34A" },
      { name: "Sopralluogo Tecnico", icon: "ClipboardCheck", color: "#D97706" },
      { name: "Pratiche e Autorizzazioni", icon: "FileText", color: "#7C3AED" },
      { name: "Materiale Ordinato", icon: "Package", color: "#0891B2" },
      { name: "Installazione", icon: "HardHat", color: "#DB2777" },
      { name: "Allaccio e Collaudo", icon: "Zap", color: "#F59E0B" },
      { name: "Assistenza", icon: "Wrench", color: "#64748B" },
    ],
  },
  {
    key: "ristrutturazioni",
    label: "Ristrutturazioni",
    hint: "Pochi passaggi: l'avanzamento vero lo vedi nelle fasi di lavoro del cantiere",
    statuses: [
      { name: "Contratto Firmato", icon: "FileSignature", color: "#2563EB" },
      { name: "Acconto Pagato", icon: "Euro", color: "#16A34A" },
      { name: "Cantiere in Corso", icon: "HardHat", color: "#D97706" },
      { name: "SAL Intermedi", icon: "Banknote", color: "#7C3AED" },
      { name: "Fine Lavori", icon: "CheckCircle2", color: "#0891B2" },
      { name: "Collaudo e Consegna", icon: "ShieldCheck", color: "#16A34A" },
      { name: "Assistenza", icon: "Wrench", color: "#64748B" },
    ],
  },
  {
    key: "impianti",
    label: "Impianti",
    hint: "Elettrico / idraulico / clima",
    statuses: [
      { name: "Contratto Firmato", icon: "FileSignature", color: "#2563EB" },
      { name: "Acconto Pagato", icon: "Euro", color: "#16A34A" },
      { name: "Sopralluogo", icon: "ClipboardCheck", color: "#D97706" },
      { name: "Installazione", icon: "Hammer", color: "#7C3AED" },
      { name: "Collaudo e Certificazione", icon: "ShieldCheck", color: "#0891B2" },
      { name: "Assistenza", icon: "Wrench", color: "#64748B" },
    ],
  },
];

// Le sezioni, nell'ordine in cui compaiono: quello che si viene a fare (la lista degli stati) per primo.
const SEZIONI: VoceIndice[] = [
  { id: "stati", etichetta: "Stati" },
  { id: "cliente", etichetta: "Cliente" },
];

/** Il database risponde con codici e testi tecnici: al titolare si dice solo cosa fare. */
function messaggioErroreSalvataggioStati(errore: unknown): string {
  // L'errore di una RPC Supabase è un oggetto con `message`, non un Error.
  const grezzo =
    (errore && typeof errore === "object" && "message" in errore && typeof errore.message === "string" && errore.message) || "";
  if (grezzo.includes("status_in_use")) {
    const trovato = grezzo.match(/lo stato "([^"]+)" è associato a (\d+) ordine/);
    if (trovato) {
      const quante = Number(trovato[2]);
      const dove = quante === 1 ? "c'è 1 commessa" : `ci sono ${quante} commesse`;
      return `Non posso eliminare lo stato «${trovato[1]}»: ${dove} in questo stato. Sposta prima le commesse su un altro stato.`;
    }
    return "Non posso eliminare uno stato che ha commesse: sposta prima le commesse su un altro stato.";
  }
  if (grezzo.includes("support_phase_required")) {
    return "Lo stato Assistenza non si può eliminare: la commessa ci passa da sola quando apri un ticket.";
  }
  if (grezzo.includes("forbidden") || grezzo.includes("not_authenticated")) {
    return "Non hai il permesso di modificare gli stati.";
  }
  if (grezzo.includes("almeno 2 stati")) {
    return "Servono almeno 2 stati.";
  }
  return "Non sono riuscito a salvare. Riprova tra poco.";
}

export function OrderStatusConfig() {
  const { effectiveCompany } = useAuth();
  const permissions = usePermissions();
  const company = effectiveCompany;
  const queryClient = useQueryClient();
  // Gli stati si salvano con una funzione del database che chiede «Configurazione Ordini» in modifica.
  const puoModificare = !permissions.isLoading && Boolean(permissions.isAdmin || permissions.canEditSettingsOrders);
  const puoVedereAutomazioni = Boolean(permissions.isAdmin || permissions.canViewAutomazioni);

  // La lista in modifica: finché non si tocca niente c'è solo quella salvata (nessuna copia da tenere allineata).
  const [bozza, setBozza] = useState<OrderStatus[] | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [avvisoInCorso, setAvvisoInCorso] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const hasChanges = bozza !== null;
  useSettingsDraftGuard(hasChanges || isSaving);

  // Email al cliente a ogni cambio di stato (trigger trg_cliente_stato_commessa).
  const { data: avvisaCliente = true } = useQuery({
    queryKey: ["company-avvisa-cliente-cambio-fase", company?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("avvisa_cliente_cambio_fase")
        .eq("id", company!.id)
        .maybeSingle();
      if (error) throw error;
      return (data as { avvisa_cliente_cambio_fase?: boolean } | null)?.avvisa_cliente_cambio_fase !== false;
    },
    enabled: !!company?.id,
    staleTime: 5 * 60 * 1000,
  });
  const cambiaAvvisoCliente = async (valore: boolean) => {
    if (!company?.id || !puoModificare || avvisoInCorso) return;
    const chiave = ["company-avvisa-cliente-cambio-fase", company.id];
    const prima = avvisaCliente;
    queryClient.setQueryData(chiave, valore);
    setAvvisoInCorso(true);
    // `select("id")`: se la regola del database non lascia modificare, l'update non dà errore ma non tocca nessuna riga.
    const { data, error } = await supabase
      .from("companies")
      .update({ avvisa_cliente_cambio_fase: valore } as never)
      .eq("id", company.id)
      .select("id");
    setAvvisoInCorso(false);
    if (error || !data || data.length === 0) {
      queryClient.setQueryData(chiave, prima);
      toast.error(
        error
          ? "Non sono riuscito a salvare la scelta. Riprova tra poco."
          : "Non hai il permesso di cambiare questa scelta: la cambia l'amministratore.",
      );
      return;
    }
    toast.success(valore ? "Il cliente riceverà un'email a ogni cambio di stato." : "Niente più email al cliente sui cambi di stato.");
  };

  const { data: queryData, isLoading, isError, refetch } = useQuery({
    queryKey: ["order-statuses-config", company?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_statuses")
        .select("*")
        .eq("company_id", company!.id)
        .order("position");

      if (error) throw error;
      return data as OrderStatus[];
    },
    enabled: !!company?.id,
    staleTime: 5 * 60 * 1000,
  });
  const { evidenziata, vai } = useVaiASezione(!isLoading && !isError);

  const statuses = useMemo<OrderStatus[]>(() => bozza ?? queryData ?? [], [bozza, queryData]);
  // Ogni modifica parte dalla lista che c'è in quel momento (la bozza, o quella salvata se non si è toccato niente).
  const modifica = useCallback(
    (cambia: (lista: OrderStatus[]) => OrderStatus[]) => setBozza((prima) => cambia(prima ?? queryData ?? [])),
    [queryData],
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!puoModificare || !over || active.id === over.id) return;
    modifica((lista) => {
      const oldIndex = lista.findIndex((i) => i.id === active.id);
      const newIndex = lista.findIndex((i) => i.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return lista;
      return arrayMove(lista, oldIndex, newIndex).map((item, index) => ({ ...item, position: index }));
    });
  }

  // Update a single status
  const handleUpdateStatus = useCallback(
    (id: string, updates: Partial<OrderStatus>) => {
      if (!puoModificare) return;
      modifica((lista) => lista.map((s) => (s.id === id ? { ...s, ...updates } : s)));
    },
    [puoModificare, modifica],
  );

  // Delete a status — blocca eliminazione dello stato Assistenza
  const handleDeleteStatus = useCallback(
    (id: string) => {
      if (!puoModificare) return;
      const target = statuses.find((s) => s.id === id);
      if (target?.is_support_phase) {
        toast.error("Lo stato Assistenza non si può eliminare: la commessa ci passa da sola quando apri un ticket.");
        return;
      }
      modifica((lista) => lista.filter((s) => s.id !== id).map((s, index) => ({ ...s, position: index })));
    },
    [puoModificare, statuses, modifica],
  );

  // Applica un elenco pronto: sostituisce la lista locale riusando gli UUID
  // degli stati omonimi (e dello stato Assistenza) → niente perdita di storico.
  // Diventa effettivo solo con «Salva modifiche».
  const applyPreset = useCallback(
    (presetKey: string) => {
      const preset = PIPELINE_PRESETS.find((p) => p.key === presetKey);
      if (!preset || !puoModificare) return;
      const byName = new Map(statuses.map((s) => [s.name.trim().toLowerCase(), s]));
      const support = statuses.find((s) => s.is_support_phase);
      setBozza(
        preset.statuses.map((p, index) => {
          const key = p.name.trim().toLowerCase();
          const isSupport = key === "assistenza";
          const existing = (isSupport && support) || byName.get(key);
          return {
            ...(existing ?? {}),
            id: existing?.id ?? `temp-${Date.now()}-${index}`,
            name: p.name,
            icon: p.icon,
            color: p.color,
            position: index,
            is_support_phase: isSupport || existing?.is_support_phase === true,
          } as OrderStatus;
        }),
      );
      setSelectedPreset(presetKey);
      toast.info(`Elenco «${preset.label}» caricato: controlla la lista e premi «Salva modifiche».`);
    },
    [puoModificare, statuses],
  );

  // Add a new status
  const handleAddStatus = useCallback(() => {
    if (!puoModificare) return;
    modifica((lista) => [
      ...lista,
      { id: `temp-${Date.now()}`, name: "Nuovo stato", icon: "Circle", color: "#2563EB", position: lista.length },
    ]);
  }, [puoModificare, modifica]);

  const annullaModifiche = () => {
    setBozza(null);
    setSelectedPreset(null);
  };

  // Save all changes — usa RPC atomica save_order_statuses (non distruttiva,
  // preserva UUID, storico commesse e current_status_id delle commesse esistenti)
  async function handleSave() {
    if (!puoModificare || isSaving) return;
    if (!company?.id) {
      toast.error("Azienda non selezionata: impossibile salvare gli stati.");
      return;
    }

    const normalizedNames = statuses.map((s) => s.name.trim().toLowerCase());
    if (normalizedNames.some((name) => !name)) {
      toast.error("Ogni stato deve avere un nome.");
      return;
    }
    if (new Set(normalizedNames).size !== normalizedNames.length) {
      toast.error("Hai inserito due stati con lo stesso nome.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = statuses.map((s, index) => ({
        // Mantieni UUID solo se è un ID reale (non "temp-*")
        id: s.id && !s.id.startsWith("temp-") ? s.id : undefined,
        name: s.name,
        icon: s.icon,
        color: s.color,
        position: index,
        is_support_phase: s.is_support_phase === true,
      }));

      const { data, error } = await supabase.rpc("save_order_statuses", {
        p_company_id: company.id,
        p_statuses: payload,
      });

      if (error) throw error;

      // Quello che il database ha salvato diventa la lista di partenza: la bozza si chiude.
      if (data) queryClient.setQueryData(["order-statuses-config", company.id], data as OrderStatus[]);
      await queryClient.invalidateQueries({ queryKey: ["order-statuses-config", company.id] });
      await queryClient.invalidateQueries({ queryKey: ["orders", "statuses", company.id] });
      // OrdersList/CreateOrder/Calendar usano la chiave storica "order-statuses":
      // senza questa riga vedevano gli stati vecchi fino a 10 minuti.
      await queryClient.invalidateQueries({ queryKey: ["order-statuses", company.id] });
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setBozza(null);
      setSelectedPreset(null);
      toast.success("Stati salvati");
    } catch (error: unknown) {
      toast.error(messaggioErroreSalvataggioStati(error));
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label="Caricamento degli stati">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Stati non disponibili</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>Non riesco a leggere gli stati. Controlla la connessione e riprova: nessuna modifica verrà salvata.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Riprova
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const canDeleteStatus = statuses.length > 2;
  const previewStatusId = statuses.length > 1 ? statuses[Math.floor(statuses.length / 2)]?.id : statuses[0]?.id;

  return (
    <div className="max-w-3xl space-y-4">
      {!puoModificare && <AvvisoSolaLetturaImpostazioni permesso="Configurazione Ordini" />}
      {/* disabled su un fieldset spegne ogni campo e pulsante che contiene. */}
      <fieldset disabled={!puoModificare || isSaving} className="m-0 min-w-0 space-y-4 border-0 p-0">
        {/* Indice e salvataggio restano in vista mentre si scorre una lista lunga. */}
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card/95 px-3 py-2 shadow-sm backdrop-blur">
          <IndiceSezioni voci={SEZIONI} onVai={vai} />
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/* A riposo lo stato lo legge solo il lettore di schermo: la barra serve alle scorciatoie e ai pulsanti. */}
            <p
              role="status"
              className={cn(
                "text-xs max-sm:sr-only",
                isSaving || hasChanges ? "text-muted-foreground" : "sr-only",
                hasChanges && !isSaving && "font-medium text-amber-700 dark:text-amber-400",
              )}
            >
              {isSaving ? "Salvataggio…" : hasChanges ? "Modifiche non salvate" : "Nessuna modifica da salvare"}
            </p>
            {hasChanges && (
              <Button size="sm" variant="ghost" onClick={annullaModifiche} disabled={isSaving}>
                <span className="max-sm:sr-only">Annulla le modifiche</span>
                <span className="sm:hidden" aria-hidden="true">Annulla</span>
              </Button>
            )}
            <Button size="sm" onClick={handleSave} disabled={!hasChanges || isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin sm:mr-2" /> : <Save className="h-4 w-4 sm:mr-2" />}
              {/* Da telefono resta l'icona: il nome lo legge comunque il lettore di schermo. */}
              <span className="max-sm:sr-only">Salva modifiche</span>
            </Button>
          </div>
        </div>

        {/* La lista degli stati: è quello che si viene a fare */}
        <SezioneImpostazione
          id="stati"
          titolo="I tuoi stati"
          descrizione="Trascina per riordinare. Ogni commessa nuova parte dal primo stato."
          evidenziata={evidenziata === "stati"}
        >
          <div className="space-y-3 px-4 py-4">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={statuses.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {statuses.map((status) => (
                    <StatusItem
                      key={status.id}
                      status={status}
                      onUpdate={handleUpdateStatus}
                      onDelete={handleDeleteStatus}
                      canDelete={canDeleteStatus}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {statuses.length < 2 && <p className="text-sm text-destructive">Servono almeno 2 stati.</p>}

            <div>
              <Button variant="outline" size="sm" onClick={handleAddStatus}>
                <Plus className="mr-2 h-4 w-4" />
                Aggiungi stato
              </Button>
            </div>

            {puoVedereAutomazioni && (
              <p className="text-xs text-muted-foreground">
                Vuoi che al cambio di stato parta un&apos;azione, per esempio un&apos;email o un&apos;attività? Si fa dalle{" "}
                <Link to="/azienda/automazioni" className="font-medium text-primary underline">
                  Automazioni
                </Link>
                .
              </p>
            )}
          </div>
        </SezioneImpostazione>

        {/* Quello che riguarda il cliente: anteprima e avviso */}
        <SezioneImpostazione
          id="cliente"
          titolo="Cosa vede il cliente"
          descrizione="Gli stati compaiono nell'area clienti, e il cliente può essere avvisato a ogni cambio."
          ambito={<AmbitoImpostazione>Area clienti</AmbitoImpostazione>}
          azione={<span>L&apos;interruttore si salva subito</span>}
          evidenziata={evidenziata === "cliente"}
        >
          <div className="space-y-2 px-4 py-4">
            <AvvisoAreaClienti />
            <div>
              <p className="text-sm font-medium">Come lo vede il cliente</p>
              <p className="text-xs text-muted-foreground">Un esempio, con lo stato a metà della lista.</p>
            </div>
            <div className="overflow-x-auto py-2">
              <OrderProgressTracker statuses={statuses} currentStatusId={previewStatusId || null} />
            </div>
          </div>
          <RigaInterruttore
            id="avvisa-cliente-cambio-stato"
            titolo="Avvisa il cliente a ogni cambio di stato"
            descrizione="Il cliente con accesso all'area clienti riceve un'email con il nome del nuovo stato. Spegnilo se gli stati sono solo per l'ufficio o se mandi già tu le email dalle Automazioni."
            checked={avvisaCliente}
            onCheckedChange={cambiaAvvisoCliente}
            disabled={avvisoInCorso}
          />
        </SezioneImpostazione>

        {/* Si usa una volta sola, e sostituisce la lista: chiuso */}
        <details className="rounded-lg border bg-card">
          <summary className="cursor-pointer px-4 py-3">
            <h2 className="inline text-base font-semibold leading-tight">Parti da un elenco pronto</h2>
          </summary>
          <div className="space-y-2 border-t px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Sostituisce la lista con un elenco già pronto per il tuo tipo di lavoro. Gli stati con lo stesso nome (e lo stato
              Assistenza) restano collegati alle commesse. Non cambia niente finché non premi «Salva modifiche».
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PIPELINE_PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => applyPreset(p.key)}
                  aria-pressed={selectedPreset === p.key}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    selectedPreset === p.key
                      ? "border-primary bg-primary/10 font-medium text-primary"
                      : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {selectedPreset && (
              <p className="text-xs text-muted-foreground">
                {PIPELINE_PRESETS.find((p) => p.key === selectedPreset)?.hint}
              </p>
            )}
          </div>
        </details>
      </fieldset>
    </div>
  );
}
