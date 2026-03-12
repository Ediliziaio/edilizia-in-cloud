import { useState, useMemo } from "react";
import { Search, Building2, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useAnagraficheNative } from "@/hooks/useAnagraficheNative";
import type { ClienteSnapshot } from "@/types/fatturazione";
import type { EditorState } from "./useEditorState";

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<any>;
  disabled?: boolean;
}

export function EditorClienteSection({ state, dispatch, disabled }: Props) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
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
    <div className="space-y-3">
      <Label className="text-sm font-semibold">Cliente</Label>

      {!disabled && (
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
          {isOpen && filtered.length > 0 && (
            <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-lg max-h-60 overflow-auto">
              {filtered.map((a) => (
                <button
                  key={a.id as string}
                  className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex items-center gap-2"
                  onClick={() => selectCliente(a)}
                >
                  {a.tipo_soggetto === "fisico" ? (
                    <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {(a.ragione_sociale as string) || `${a.nome ?? ""} ${a.cognome ?? ""}`.trim()}
                    </div>
                    {a.partita_iva && (
                      <div className="text-xs text-muted-foreground">P.IVA: {a.partita_iva as string}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {hasCliente && (
        <Card className="bg-muted/30">
          <CardContent className="p-3 space-y-1 text-sm">
            <div className="font-semibold text-foreground">{snapshot!.ragione_sociale}</div>
            {snapshot!.partita_iva && (
              <div className="text-muted-foreground">P.IVA: {snapshot!.partita_iva}</div>
            )}
            {snapshot!.codice_fiscale && (
              <div className="text-muted-foreground">CF: {snapshot!.codice_fiscale}</div>
            )}
            {snapshot!.indirizzo_via && (
              <div className="text-muted-foreground">
                {snapshot!.indirizzo_via}, {snapshot!.indirizzo_cap} {snapshot!.indirizzo_comune} ({snapshot!.indirizzo_provincia})
              </div>
            )}
            <div className="flex gap-3 text-xs text-muted-foreground">
              {snapshot!.codice_sdi && <span>SDI: {snapshot!.codice_sdi}</span>}
              {snapshot!.pec && <span>PEC: {snapshot!.pec}</span>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* CIG/CUP for PA */}
      {snapshot?.tipo_cliente === "PA" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">CIG</Label>
            <Input
              value={state.cig ?? ""}
              onChange={(e) => dispatch({ type: "SET_FIELD", field: "cig", value: e.target.value })}
              className="h-8 text-sm"
              disabled={disabled}
            />
          </div>
          <div>
            <Label className="text-xs">CUP</Label>
            <Input
              value={state.cup ?? ""}
              onChange={(e) => dispatch({ type: "SET_FIELD", field: "cup", value: e.target.value })}
              className="h-8 text-sm"
              disabled={disabled}
            />
          </div>
        </div>
      )}
    </div>
  );
}
