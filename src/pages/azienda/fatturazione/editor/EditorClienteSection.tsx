import { useState, useMemo } from "react";
import { Search, X, ChevronDown } from "lucide-react";
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
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Cerca nome o P.IVA..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setIsOpen(true); }}
                onFocus={() => search && setIsOpen(true)}
                className="pl-7 h-8 text-xs"
              />
            </div>

            {isOpen && filtered.length > 0 && (
              <div className="absolute z-50 w-full mt-1 border rounded-md bg-popover shadow-lg max-h-48 overflow-auto">
                {filtered.map((a) => {
                  const name = (a.ragione_sociale as string) || `${a.nome ?? ""} ${a.cognome ?? ""}`.trim();
                  return (
                    <button
                      key={a.id as string}
                      className="w-full text-left px-2.5 py-1.5 hover:bg-accent text-xs flex items-center gap-2"
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
                })}
              </div>
            )}

            <div className="flex gap-1.5 mt-2">
              <Button variant="outline" size="sm" className="text-[10px] h-6 px-2">
                + Nuovo cliente
              </Button>
              <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2">
                Occasionale
              </Button>
            </div>
          </div>
        )
      )}
    </div>
  );
}
