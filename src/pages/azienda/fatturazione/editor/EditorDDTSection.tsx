import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { EditorState } from "./useEditorState";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<any>;
  disabled?: boolean;
}

type VettoreTipo = "mittente" | "destinatario" | "terzo" | "subappaltatore";

interface SubappaltatoreOption {
  id: string;
  ragione_sociale: string;
  piva: string | null;
  indirizzo: string | null;
  telefono: string | null;
  responsabile: string | null;
}

export function EditorDDTSection({ state, dispatch, disabled }: Props) {
  const { effectiveCompany } = useAuth();

  // ── Vettore tipo: SEMPRE derivato dallo state (single source of truth).
  // Bug pregresso: useState catturava il valore al primo render quando
  // state.ddt_vettore poteva essere ancora undefined (doc loading async),
  // causando UI desincronizzata dal DB.
  const vettoreTipo: VettoreTipo = useMemo(() => {
    const t = (state.ddt_vettore as Record<string, unknown> | null | undefined)?.tipo;
    return (typeof t === "string" ? (t as VettoreTipo) : "mittente");
  }, [state.ddt_vettore]);

  // Destinazione diversa: derivata dallo state, ma con override locale
  // (utente può toggle off/on senza perdere lo state immediatamente).
  const hasCustomDest = useMemo(() => {
    const ic = state.ddt_indirizzo_consegna as Record<string, unknown> | null | undefined;
    return !!ic && Object.keys(ic).length > 0;
  }, [state.ddt_indirizzo_consegna]);
  const [destDiversa, setDestDiversa] = useState<boolean>(hasCustomDest);
  // Sync quando lo state cambia (es. doc loading async)
  useEffect(() => {
    if (hasCustomDest && !destDiversa) setDestDiversa(true);
  }, [hasCustomDest, destDiversa]);

  const setField = useCallback(
    (field: string, value: unknown) => dispatch({ type: "SET_FIELD", field, value }),
    [dispatch],
  );

  const setVettoreField = useCallback(
    (patch: Record<string, unknown>) => {
      const current = (state.ddt_vettore as Record<string, unknown> | null | undefined) ?? {};
      dispatch({ type: "SET_FIELD", field: "ddt_vettore", value: { ...current, ...patch } });
    },
    [state.ddt_vettore, dispatch],
  );

  // Solo summary read-only del subappaltatore selezionato — la selezione
  // avviene in EditorDDTOpzioniCard, qui mostriamo solo i dettagli per
  // confermare la scelta dell'utente.
  const selectedSubId = (state.ddt_vettore as Record<string, unknown> | null | undefined)?.subappaltatore_id as string | undefined;
  const { data: subappaltatori = [] } = useQuery<SubappaltatoreOption[]>({
    queryKey: ["subappaltatori-ddt-section", effectiveCompany?.id],
    enabled: !!effectiveCompany?.id && vettoreTipo === "subappaltatore" && !!selectedSubId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subappaltatori")
        .select("id, ragione_sociale, piva, indirizzo, telefono, responsabile")
        .eq("company_id", effectiveCompany!.id)
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as SubappaltatoreOption[];
    },
  });

  const selectedSub = useMemo(() => {
    if (!selectedSubId) return null;
    return subappaltatori.find((s) => s.id === selectedSubId) ?? null;
  }, [subappaltatori, selectedSubId]);

  return (
    <div className="space-y-4">
      {/* Destinazione */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Destinazione</CardTitle>
            <div className="flex items-center gap-2">
              <Label htmlFor="dest-diversa" className="text-xs text-muted-foreground">
                Destinazione diversa
              </Label>
              <Switch
                id="dest-diversa"
                checked={destDiversa}
                onCheckedChange={setDestDiversa}
                disabled={disabled}
              />
            </div>
          </div>
        </CardHeader>
        {destDiversa && (
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Indirizzo</Label>
                <Input
                  placeholder="Via, numero civico"
                  value={(state.ddt_indirizzo_consegna as any)?.via ?? ""}
                  onChange={(e) =>
                    setField("ddt_indirizzo_consegna", {
                      ...((state.ddt_indirizzo_consegna as any) ?? {}),
                      via: e.target.value,
                    })
                  }
                  disabled={disabled}
                />
              </div>
              <div>
                <Label className="text-xs">Comune</Label>
                <Input
                  placeholder="Comune"
                  value={(state.ddt_indirizzo_consegna as any)?.comune ?? ""}
                  onChange={(e) =>
                    setField("ddt_indirizzo_consegna", {
                      ...((state.ddt_indirizzo_consegna as any) ?? {}),
                      comune: e.target.value,
                    })
                  }
                  disabled={disabled}
                />
              </div>
              <div>
                <Label className="text-xs">CAP</Label>
                <Input
                  placeholder="CAP"
                  value={(state.ddt_indirizzo_consegna as any)?.cap ?? ""}
                  onChange={(e) =>
                    setField("ddt_indirizzo_consegna", {
                      ...((state.ddt_indirizzo_consegna as any) ?? {}),
                      cap: e.target.value,
                    })
                  }
                  disabled={disabled}
                />
              </div>
              <div>
                <Label className="text-xs">Provincia</Label>
                <Input
                  placeholder="Prov."
                  maxLength={2}
                  value={(state.ddt_indirizzo_consegna as any)?.provincia ?? ""}
                  onChange={(e) =>
                    setField("ddt_indirizzo_consegna", {
                      ...((state.ddt_indirizzo_consegna as any) ?? {}),
                      provincia: e.target.value,
                    })
                  }
                  disabled={disabled}
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Dettagli vettore avanzati: solo conducente/targa/P.IVA terzo
          + Data consegna. I campi base (Causale/Aspetto/Porto/Colli/Peso/
          Mezzo + radio Vettore principale + Select subappaltatore) sono
          ora nella card "Opzioni avanzate" sopra. */}
      {(vettoreTipo === "subappaltatore" || vettoreTipo === "terzo") && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Dati vettore — {vettoreTipo === "subappaltatore" ? "subappaltatore" : "terzo"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {vettoreTipo === "terzo" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Denominazione vettore</Label>
                  <Input
                    placeholder="Ragione sociale"
                    value={
                      (state.ddt_vettore as Record<string, unknown> | null | undefined)?.ragione_sociale as string ||
                      (state.ddt_vettore as Record<string, unknown> | null | undefined)?.denominazione as string ||
                      ""
                    }
                    onChange={(e) => setVettoreField({ ragione_sociale: e.target.value })}
                    disabled={disabled}
                  />
                </div>
                <div>
                  <Label className="text-xs">P.IVA vettore</Label>
                  <Input
                    placeholder="P.IVA"
                    value={
                      (state.ddt_vettore as Record<string, unknown> | null | undefined)?.vat_number as string ||
                      (state.ddt_vettore as Record<string, unknown> | null | undefined)?.partita_iva as string ||
                      ""
                    }
                    onChange={(e) => setVettoreField({ vat_number: e.target.value })}
                    disabled={disabled}
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Indirizzo vettore</Label>
                  <Input
                    placeholder="Via, comune"
                    value={(state.ddt_vettore as Record<string, unknown> | null | undefined)?.address as string ?? ""}
                    onChange={(e) => setVettoreField({ address: e.target.value })}
                    disabled={disabled}
                  />
                </div>
              </div>
            )}

            {selectedSub?.indirizzo && vettoreTipo === "subappaltatore" && (
              <p className="text-xs text-muted-foreground">{selectedSub.ragione_sociale} · {selectedSub.indirizzo}</p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Conducente — nome</Label>
                <Input
                  placeholder="Nome e cognome"
                  value={(state.ddt_vettore as Record<string, unknown> | null | undefined)?.conducente_nome as string ?? ""}
                  onChange={(e) => setVettoreField({ conducente_nome: e.target.value })}
                  disabled={disabled}
                />
              </div>
              <div>
                <Label className="text-xs">Conducente — telefono</Label>
                <Input
                  placeholder="+39…"
                  value={(state.ddt_vettore as Record<string, unknown> | null | undefined)?.conducente_telefono as string ?? ""}
                  onChange={(e) => setVettoreField({ conducente_telefono: e.target.value })}
                  disabled={disabled}
                />
              </div>
              <div>
                <Label className="text-xs">Targa mezzo</Label>
                <Input
                  placeholder="AB123CD"
                  value={(state.ddt_vettore as Record<string, unknown> | null | undefined)?.targa_mezzo as string ?? ""}
                  onChange={(e) => setVettoreField({ targa_mezzo: e.target.value.toUpperCase() })}
                  disabled={disabled}
                />
              </div>
              <div>
                <Label className="text-xs">N. patente</Label>
                <Input
                  placeholder="Patente"
                  value={(state.ddt_vettore as Record<string, unknown> | null | undefined)?.patente as string ?? ""}
                  onChange={(e) => setVettoreField({ patente: e.target.value })}
                  disabled={disabled}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Data/Ora consegna</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            type="datetime-local"
            value={state.ddt_data_ora_consegna ?? ""}
            onChange={(e) => setField("ddt_data_ora_consegna", e.target.value)}
            disabled={disabled}
            className="max-w-xs"
          />
        </CardContent>
      </Card>
    </div>
  );
}
