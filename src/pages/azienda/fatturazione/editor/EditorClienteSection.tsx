import { useState, useMemo } from "react";
import { Search, Building2, User, ChevronDown, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAnagraficheNative } from "@/hooks/useAnagraficheNative";
import type { ClienteSnapshot } from "@/types/fatturazione";
import type { EditorState } from "./useEditorState";

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<any>;
  disabled?: boolean;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
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

export function EditorClienteSection({ state, dispatch, disabled }: Props) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { data: anagrafiche } = useAnagraficheNative(search);

  const snapshot = state.cliente_snapshot;
  const hasCliente = !!snapshot?.ragione_sociale;

  const filtered = useMemo(() => {
    if (!search || !anagrafiche) return [];
    return (anagrafiche as Record<string, unknown>[]).slice(0, 8);
  }, [anagrafiche, search]);

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
  }

  return (
    <div className="space-y-3 rounded-lg border p-4 bg-card">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Cliente</Label>
        {hasCliente && !disabled && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => dispatch({ type: "CLEAR_CLIENTE" })}
          >
            <X className="h-3 w-3 mr-1" />
            Cambia
          </Button>
        )}
      </div>

      {/* Selected client card */}
      {hasCliente ? (
        <div className="rounded-lg bg-muted/30 p-3">
          <div className="flex items-start gap-3">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${avatarColor(snapshot!.ragione_sociale)}`}>
              {getInitials(snapshot!.ragione_sociale)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-foreground">{snapshot!.ragione_sociale}</div>
              {snapshot!.partita_iva && (
                <div className="text-xs font-mono text-muted-foreground">P.IVA {snapshot!.partita_iva}</div>
              )}
              {snapshot!.indirizzo_via && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {snapshot!.indirizzo_via}, {snapshot!.indirizzo_cap} {snapshot!.indirizzo_comune}
                  {snapshot!.indirizzo_provincia ? ` (${snapshot!.indirizzo_provincia})` : ""}
                </div>
              )}
            </div>
            {snapshot!.tipo_cliente && (
              <Badge variant="secondary" className={`text-[10px] ${TIPO_BADGE[snapshot!.tipo_cliente]?.className ?? ""}`}>
                {TIPO_BADGE[snapshot!.tipo_cliente]?.label ?? snapshot!.tipo_cliente}
              </Badge>
            )}
          </div>

          {/* Collapsible details */}
          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 text-xs mt-2 w-full justify-center text-muted-foreground">
                <ChevronDown className={`h-3 w-3 mr-1 transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
                Dettagli fiscali
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 space-y-1">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {snapshot!.codice_fiscale && (
                  <>
                    <span className="text-muted-foreground">Codice Fiscale</span>
                    <span className="font-mono">{snapshot!.codice_fiscale}</span>
                  </>
                )}
                {snapshot!.codice_sdi && (
                  <>
                    <span className="text-muted-foreground">Codice SDI</span>
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
        </div>
      ) : (
        /* Search state */
        !disabled && (
          <div className="relative">
            <div className="border-2 border-dashed border-primary/30 rounded-lg p-4">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cerca per ragione sociale o P.IVA..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setIsOpen(true);
                  }}
                  onFocus={() => search && setIsOpen(true)}
                  className="pl-9 h-9"
                />
              </div>

              {isOpen && filtered.length > 0 && (
                <div className="mt-2 border rounded-md bg-popover shadow-lg max-h-60 overflow-auto">
                  {filtered.map((a) => {
                    const name = (a.ragione_sociale as string) || `${a.nome ?? ""} ${a.cognome ?? ""}`.trim();
                    const tipo = a.tipo_cliente as string;
                    return (
                      <button
                        key={a.id as string}
                        className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex items-center gap-2"
                        onClick={() => selectCliente(a)}
                      >
                        <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${avatarColor(name)}`}>
                          {getInitials(name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{name}</div>
                          {a.partita_iva && (
                            <div className="text-xs text-muted-foreground font-mono">P.IVA: {a.partita_iva as string}</div>
                          )}
                        </div>
                        {tipo && (
                          <Badge variant="secondary" className="text-[10px] shrink-0">
                            {tipo}
                          </Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-2 mt-3">
                <Button variant="outline" size="sm" className="text-xs h-7">
                  + Crea nuovo cliente
                </Button>
                <Button variant="ghost" size="sm" className="text-xs h-7">
                  Cliente occasionale
                </Button>
              </div>
            </div>
          </div>
        )
      )}

      {/* CIG/CUP for PA */}
      {snapshot?.tipo_cliente === "PA" && (
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div>
            <Label className="text-xs text-muted-foreground">CIG</Label>
            <Input
              value={state.cig ?? ""}
              onChange={(e) => dispatch({ type: "SET_FIELD", field: "cig", value: e.target.value })}
              className="h-8 text-sm font-mono"
              disabled={disabled}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">CUP</Label>
            <Input
              value={state.cup ?? ""}
              onChange={(e) => dispatch({ type: "SET_FIELD", field: "cup", value: e.target.value })}
              className="h-8 text-sm font-mono"
              disabled={disabled}
            />
          </div>
        </div>
      )}
    </div>
  );
}
