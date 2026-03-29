import { useState, useMemo } from "react";
import { Search, X, ChevronDown, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAnagraficheNative } from "@/hooks/useAnagraficheNative";
import { validaPartitaIva, validaCodiceFiscale } from "@/lib/fatturazione/validazioniAnagrafiche";
import type { ClienteSnapshot } from "@/types/fatturazione";
import type { EditorState } from "./useEditorState";

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<any>;
  disabled?: boolean;
}

function getInitials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

const AVATAR_COLORS = [
  "bg-primary/20 text-primary",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const TIPO_BADGE: Record<string, { label: string; className: string }> = {
  B2B: { label: "B2B", className: "bg-primary/10 text-primary" },
  B2C: { label: "B2C", className: "bg-muted text-muted-foreground" },
  PA: { label: "PA", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  Estero: { label: "Estero", className: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" },
};

// New client form state
interface NewClientForm {
  tipo: "B2C" | "B2B";
  nome?: string;
  cognome?: string;
  ragioneSociale?: string;
  partitaIva?: string;
  codiceFiscale?: string;
  codiceSdi?: string;
  pec?: string;
}

export function EditorClienteSection({ state, dispatch, disabled }: Props) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newClientTab, setNewClientTab] = useState<"B2C" | "B2B">("B2C");
  const [newForm, setNewForm] = useState<NewClientForm>({ tipo: "B2C" });

  // Get all clients (empty search returns up to 100)
  const { data: anagrafiche } = useAnagraficheNative(search);

  const snapshot = state.cliente_snapshot;
  const hasCliente = !!snapshot?.ragione_sociale;

  // Show all results when search is active, or empty results when focused but no search
  const filtered = useMemo(() => {
    if (!anagrafiche) return [];
    return (anagrafiche as Record<string, unknown>[]).slice(0, 100);
  }, [anagrafiche]);

  function selectCliente(a: Record<string, unknown>) {
    const snap: ClienteSnapshot = {
      ragione_sociale: (a.ragione_sociale as string) ?? `${a.nome ?? ""} ${a.cognome ?? ""}`.trim(),
      partita_iva: a.partita_iva as string | undefined,
      codice_fiscale: a.codice_fiscale as string | undefined,
      codice_sdi: a.codice_sdi as string | undefined,
      pec: a.pec as string | undefined,
      indirizzo_via: a.indirizzo_via as string | undefined,
      indirizzo_cap: a.indirizzo_cap as string | undefined,
      indirizzo_comune: a.indirizzo_comune as string | undefined,
      indirizzo_provincia: a.indirizzo_provincia as string | undefined,
      indirizzo_nazione: a.indirizzo_nazione as string | undefined,
      tipo_cliente: (a.tipo_cliente as ClienteSnapshot["tipo_cliente"]) ?? "B2B",
    };
    dispatch({ type: "SET_CLIENTE", anagrafica_id: a.id as string, snapshot: snap });
    setSearch("");
    setIsOpen(false);
    setShowNewForm(false);
  }

  // Create quick B2C client (occasionale)
  function createQuickB2C(name: string) {
    if (!name.trim()) return;
    const snap: ClienteSnapshot = {
      ragione_sociale: name.trim(),
      tipo_cliente: "B2C",
    };
    dispatch({ type: "SET_CLIENTE", anagrafica_id: "", snapshot: snap });
    setSearch("");
    setIsOpen(false);
    setShowNewForm(false);
  }

  // Create new client from form
  function createNewClient() {
    const ragioneSociale = newForm.tipo === "B2B"
      ? newForm.ragioneSociale?.trim()
      : `${newForm.nome?.trim() ?? ""} ${newForm.cognome?.trim() ?? ""}`.trim();

    if (!ragioneSociale) return;

    const snap: ClienteSnapshot = {
      ragione_sociale: ragioneSociale,
      partita_iva: newForm.partitaIva,
      codice_fiscale: newForm.codiceFiscale,
      codice_sdi: newForm.codiceSdi,
      pec: newForm.pec,
      tipo_cliente: newForm.tipo,
    };

    dispatch({ type: "SET_CLIENTE", anagrafica_id: "", snapshot: snap });
    setNewForm({ tipo: "B2C" });
    setShowNewForm(false);
    setSearch("");
    setIsOpen(false);
  }

  // Validation
  const pivaError = newForm.partitaIva && !validaPartitaIva(newForm.partitaIva).valida
    ? validaPartitaIva(newForm.partitaIva).errore
    : undefined;
  const cfError = newForm.codiceFiscale && !validaCodiceFiscale(newForm.codiceFiscale).valida
    ? validaCodiceFiscale(newForm.codiceFiscale).errore
    : undefined;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3 border-l-[3px] border-l-primary/60 shadow-sm">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] font-bold uppercase tracking-wider text-primary/80">Cliente</Label>
        {hasCliente && !disabled && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 text-[10px] px-1.5"
            onClick={() => dispatch({ type: "CLEAR_CLIENTE" })}
          >
            <X className="h-2.5 w-2.5 mr-0.5" />
            Cambia
          </Button>
        )}
      </div>

      {hasCliente ? (
        <div>
          {/* Compact client card */}
          <div className="flex items-center gap-2.5">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${avatarColor(snapshot!.ragione_sociale)}`}>
              {getInitials(snapshot!.ragione_sociale)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm leading-tight truncate">{snapshot!.ragione_sociale}</div>
              {snapshot!.partita_iva && (
                <div className="text-[10px] font-mono text-muted-foreground">P.IVA {snapshot!.partita_iva}</div>
              )}
            </div>
            {snapshot!.tipo_cliente && (
              <Badge variant="secondary" className={`text-[9px] px-1.5 h-4 shrink-0 ${TIPO_BADGE[snapshot!.tipo_cliente]?.className ?? ""}`}>
                {TIPO_BADGE[snapshot!.tipo_cliente]?.label ?? snapshot!.tipo_cliente}
              </Badge>
            )}
          </div>

          {/* Address & fiscal details (collapsible) */}
          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground mt-1.5 w-full justify-center transition-colors">
                <ChevronDown className={`h-2.5 w-2.5 transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
                Dettagli
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 space-y-1 text-[11px]">
              {snapshot!.indirizzo_via && (
                <p className="text-muted-foreground">
                  {snapshot!.indirizzo_via}, {snapshot!.indirizzo_cap} {snapshot!.indirizzo_comune}
                  {snapshot!.indirizzo_provincia ? ` (${snapshot!.indirizzo_provincia})` : ""}
                </p>
              )}
              <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                {snapshot!.codice_fiscale && (
                  <>
                    <span className="text-muted-foreground">CF</span>
                    <span className="font-mono truncate">{snapshot!.codice_fiscale}</span>
                  </>
                )}
                {snapshot!.codice_sdi && (
                  <>
                    <span className="text-muted-foreground">SDI</span>
                    <span className="font-mono">{snapshot!.codice_sdi}</span>
                  </>
                )}
                {snapshot!.pec && (
                  <>
                    <span className="text-muted-foreground">PEC</span>
                    <span className="truncate">{snapshot!.pec}</span>
                  </>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* CIG/CUP for PA */}
          {snapshot?.tipo_cliente === "PA" && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">CIG</Label>
                <Input
                  value={state.cig ?? ""}
                  onChange={(e) => dispatch({ type: "SET_FIELD", field: "cig", value: e.target.value })}
                  className="h-7 text-xs font-mono"
                  disabled={disabled}
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">CUP</Label>
                <Input
                  value={state.cup ?? ""}
                  onChange={(e) => dispatch({ type: "SET_FIELD", field: "cup", value: e.target.value })}
                  className="h-7 text-xs font-mono"
                  disabled={disabled}
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        !disabled && (
          <div className="relative space-y-2">
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Cerca cliente..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setIsOpen(true); }}
                onFocus={() => setIsOpen(true)}
                className="pl-7 h-8 text-xs"
              />
            </div>

            {/* Dropdown list */}
            {isOpen && (
              <div className="absolute z-50 w-full mt-1 border rounded-md bg-popover shadow-lg max-h-48 overflow-auto">
                {filtered.length > 0 ? (
                  filtered.map((a) => {
                    const name = (a.ragione_sociale as string) || `${a.nome ?? ""} ${a.cognome ?? ""}`.trim();
                    return (
                      <button
                        key={a.id as string}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-accent text-xs flex items-center gap-2 border-b last:border-b-0"
                        onClick={() => selectCliente(a)}
                      >
                        <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${avatarColor(name)}`}>
                          {getInitials(name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{name}</div>
                          {a.partita_iva && (
                            <div className="text-[10px] text-muted-foreground font-mono">{a.partita_iva as string}</div>
                          )}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="px-3 py-2 text-[11px] text-muted-foreground">Nessun cliente trovato</div>
                )}
              </div>
            )}

            {/* New client form or quick buttons */}
            {showNewForm ? (
              <div className="border rounded-md p-3 space-y-3 bg-muted/30 animate-in fade-in-50 slide-in-from-top-2">
                <Tabs value={newClientTab} onValueChange={(v) => {
                  setNewClientTab(v as "B2C" | "B2B");
                  setNewForm({ tipo: v as "B2C" | "B2B" });
                }}>
                  <TabsList className="grid w-full grid-cols-2 h-7">
                    <TabsTrigger value="B2C" className="text-xs">Privato</TabsTrigger>
                    <TabsTrigger value="B2B" className="text-xs">Azienda</TabsTrigger>
                  </TabsList>

                  {/* B2C form */}
                  <TabsContent value="B2C" className="space-y-2 mt-2">
                    <div>
                      <Label className="text-[10px]">Nome</Label>
                      <Input
                        placeholder="Nome"
                        value={newForm.nome ?? ""}
                        onChange={(e) => setNewForm({ ...newForm, nome: e.target.value })}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">Cognome</Label>
                      <Input
                        placeholder="Cognome"
                        value={newForm.cognome ?? ""}
                        onChange={(e) => setNewForm({ ...newForm, cognome: e.target.value })}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">Codice Fiscale</Label>
                      <Input
                        placeholder="16 caratteri"
                        value={newForm.codiceFiscale ?? ""}
                        onChange={(e) => setNewForm({ ...newForm, codiceFiscale: e.target.value })}
                        className="h-7 text-xs font-mono"
                      />
                      {cfError && <p className="text-[10px] text-destructive mt-0.5">{cfError}</p>}
                    </div>
                  </TabsContent>

                  {/* B2B form */}
                  <TabsContent value="B2B" className="space-y-2 mt-2">
                    <div>
                      <Label className="text-[10px]">Ragione Sociale</Label>
                      <Input
                        placeholder="Nome azienda"
                        value={newForm.ragioneSociale ?? ""}
                        onChange={(e) => setNewForm({ ...newForm, ragioneSociale: e.target.value })}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">P.IVA</Label>
                      <Input
                        placeholder="11 cifre"
                        value={newForm.partitaIva ?? ""}
                        onChange={(e) => setNewForm({ ...newForm, partitaIva: e.target.value })}
                        className="h-7 text-xs font-mono"
                      />
                      {pivaError && <p className="text-[10px] text-destructive mt-0.5">{pivaError}</p>}
                    </div>
                    <div>
                      <Label className="text-[10px]">Codice Fiscale Azienda</Label>
                      <Input
                        placeholder="11 cifre"
                        value={newForm.codiceFiscale ?? ""}
                        onChange={(e) => setNewForm({ ...newForm, codiceFiscale: e.target.value })}
                        className="h-7 text-xs font-mono"
                      />
                      {cfError && <p className="text-[10px] text-destructive mt-0.5">{cfError}</p>}
                    </div>
                    <div>
                      <Label className="text-[10px]">Codice SDI</Label>
                      <Input
                        placeholder="Codice SDI"
                        value={newForm.codiceSdi ?? ""}
                        onChange={(e) => setNewForm({ ...newForm, codiceSdi: e.target.value })}
                        className="h-7 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">PEC</Label>
                      <Input
                        placeholder="email@pec.it"
                        value={newForm.pec ?? ""}
                        onChange={(e) => setNewForm({ ...newForm, pec: e.target.value })}
                        className="h-7 text-xs"
                      />
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-6 text-xs flex-1"
                    onClick={createNewClient}
                    disabled={!newForm.tipo || (newClientTab === "B2B" ? !newForm.ragioneSociale : !(newForm.nome || newForm.cognome)) || !!pivaError || !!cfError}
                  >
                    Crea
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs flex-1"
                    onClick={() => {
                      setShowNewForm(false);
                      setNewForm({ tipo: "B2C" });
                    }}
                  >
                    Annulla
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[10px] h-6 px-2 flex-1"
                  onClick={() => setShowNewForm(true)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Nuovo cliente
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[10px] h-6 px-2 flex-1"
                  onClick={() => {
                    const name = prompt("Nome cliente occasionale:");
                    if (name) createQuickB2C(name);
                  }}
                >
                  Occasionale
                </Button>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}
