import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { EditorState } from "./useEditorState";
import { useState, useEffect, useMemo } from "react";
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

const CAUSALI_TRASPORTO = [
  { value: "vendita", label: "Vendita" },
  { value: "reso", label: "Reso" },
  { value: "omaggio", label: "Omaggio" },
  { value: "conto_lavoro", label: "Conto lavoro" },
  { value: "deposito", label: "Deposito" },
  { value: "esposizione", label: "Esposizione" },
  { value: "riparazione", label: "Riparazione" },
  { value: "altro", label: "Altro" },
];

export function EditorDDTSection({ state, dispatch, disabled }: Props) {
  const { effectiveCompany } = useAuth();
  const initialVettore = (state.ddt_vettore ?? {}) as Record<string, unknown>;
  const initialTipo = ((initialVettore.tipo as string) ?? "mittente") as VettoreTipo;

  const [destDiversa, setDestDiversa] = useState<boolean>(
    !!state.ddt_indirizzo_consegna && Object.keys((state.ddt_indirizzo_consegna as any) ?? {}).length > 0,
  );
  const [vettoreTipo, setVettoreTipo] = useState<VettoreTipo>(initialTipo);

  const setField = (field: string, value: unknown) =>
    dispatch({ type: "SET_FIELD", field, value });

  const setVettoreField = (patch: Record<string, unknown>) =>
    setField("ddt_vettore", { ...((state.ddt_vettore as any) ?? {}), ...patch });

  const handleVettoreTipoChange = (v: string) => {
    const tipo = v as VettoreTipo;
    setVettoreTipo(tipo);
    const current = (state.ddt_vettore as any) ?? {};
    const next: Record<string, unknown> = { ...current, tipo };
    if (tipo !== "subappaltatore") {
      next.subappaltatore_id = null;
    }
    setField("ddt_vettore", next);
  };

  const { data: subappaltatori = [] } = useQuery<SubappaltatoreOption[]>({
    queryKey: ["subappaltatori-ddt-vettore", effectiveCompany?.id],
    enabled: !!effectiveCompany?.id && vettoreTipo === "subappaltatore",
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subappaltatori")
        .select("id, ragione_sociale, piva, indirizzo, telefono, responsabile")
        .eq("company_id", effectiveCompany!.id)
        .eq("is_active", true)
        .order("ragione_sociale", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SubappaltatoreOption[];
    },
  });

  const selectedSub = useMemo(() => {
    const id = (state.ddt_vettore as any)?.subappaltatore_id as string | undefined;
    if (!id) return null;
    return subappaltatori.find((s) => s.id === id) ?? null;
  }, [subappaltatori, state.ddt_vettore]);

  const handleSelectSub = (id: string) => {
    const sub = subappaltatori.find((s) => s.id === id);
    if (!sub) return;
    setVettoreField({
      subappaltatore_id: sub.id,
      ragione_sociale: sub.ragione_sociale,
      vat_number: sub.piva,
      address: sub.indirizzo,
      conducente_nome:
        ((state.ddt_vettore as any)?.conducente_nome as string | null) ?? sub.responsabile ?? null,
      conducente_telefono:
        ((state.ddt_vettore as any)?.conducente_telefono as string | null) ?? sub.telefono ?? null,
    });
  };

  useEffect(() => {
    if (vettoreTipo !== initialTipo && !state.ddt_vettore) {
      setField("ddt_vettore", { tipo: vettoreTipo });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      {/* Trasporto */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Informazioni Trasporto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Causale trasporto</Label>
              <Select
                value={state.ddt_causale_trasporto ?? ""}
                onValueChange={(v) => setField("ddt_causale_trasporto", v)}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona causale" />
                </SelectTrigger>
                <SelectContent>
                  {CAUSALI_TRASPORTO.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Aspetto dei beni</Label>
              <Input
                placeholder="es. Scatola, Bancale..."
                value={state.ddt_aspetto_beni ?? ""}
                onChange={(e) => setField("ddt_aspetto_beni", e.target.value)}
                disabled={disabled}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs mb-2 block">Porto</Label>
            <RadioGroup
              value={state.ddt_porto ?? "Franco"}
              onValueChange={(v) => setField("ddt_porto", v)}
              className="flex gap-4"
              disabled={disabled}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="Franco" id="porto-franco" />
                <Label htmlFor="porto-franco" className="text-sm">Franco</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="Assegnato" id="porto-assegnato" />
                <Label htmlFor="porto-assegnato" className="text-sm">Assegnato</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">N. colli</Label>
              <Input
                type="number"
                min={0}
                value={state.ddt_numero_colli ?? ""}
                onChange={(e) => setField("ddt_numero_colli", e.target.value ? Number(e.target.value) : null)}
                disabled={disabled}
              />
            </div>
            <div>
              <Label className="text-xs">Peso (kg)</Label>
              <Input
                placeholder="0.00"
                value={state.ddt_peso ?? ""}
                onChange={(e) => setField("ddt_peso", e.target.value)}
                disabled={disabled}
              />
            </div>
            <div>
              <Label className="text-xs">Mezzo trasporto</Label>
              <Input
                placeholder="es. Furgone"
                value={state.ddt_mezzo_trasporto ?? ""}
                onChange={(e) => setField("ddt_mezzo_trasporto", e.target.value)}
                disabled={disabled}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs mb-2 block">Vettore</Label>
            <RadioGroup
              value={vettoreTipo}
              onValueChange={handleVettoreTipoChange}
              className="grid grid-cols-2 sm:flex sm:flex-wrap gap-3"
              disabled={disabled}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="mittente" id="vett-mitt" />
                <Label htmlFor="vett-mitt" className="text-sm">Mittente</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="destinatario" id="vett-dest" />
                <Label htmlFor="vett-dest" className="text-sm">Destinatario</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="subappaltatore" id="vett-sub" />
                <Label htmlFor="vett-sub" className="text-sm">Subappaltatore</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="terzo" id="vett-terzo" />
                <Label htmlFor="vett-terzo" className="text-sm">Vettore terzo</Label>
              </div>
            </RadioGroup>
          </div>

          {vettoreTipo === "subappaltatore" && (
            <div className="space-y-3 p-3 bg-muted/50 rounded-md">
              <div>
                <Label className="text-xs">Seleziona subappaltatore</Label>
                <Select
                  value={((state.ddt_vettore as any)?.subappaltatore_id as string) ?? ""}
                  onValueChange={handleSelectSub}
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={subappaltatori.length ? "Scegli dal registro" : "Nessun subappaltatore attivo"} />
                  </SelectTrigger>
                  <SelectContent>
                    {subappaltatori.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.ragione_sociale}
                        {s.piva ? ` — P.IVA ${s.piva}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedSub?.indirizzo && (
                  <p className="text-xs text-muted-foreground mt-1">{selectedSub.indirizzo}</p>
                )}
              </div>
            </div>
          )}

          {vettoreTipo === "terzo" && (
            <div className="grid grid-cols-2 gap-3 p-3 bg-muted/50 rounded-md">
              <div>
                <Label className="text-xs">Denominazione vettore</Label>
                <Input
                  placeholder="Ragione sociale"
                  value={(state.ddt_vettore as any)?.ragione_sociale ?? (state.ddt_vettore as any)?.denominazione ?? ""}
                  onChange={(e) => setVettoreField({ ragione_sociale: e.target.value })}
                  disabled={disabled}
                />
              </div>
              <div>
                <Label className="text-xs">P.IVA vettore</Label>
                <Input
                  placeholder="P.IVA"
                  value={(state.ddt_vettore as any)?.vat_number ?? (state.ddt_vettore as any)?.partita_iva ?? ""}
                  onChange={(e) => setVettoreField({ vat_number: e.target.value })}
                  disabled={disabled}
                />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Indirizzo vettore</Label>
                <Input
                  placeholder="Via, comune"
                  value={(state.ddt_vettore as any)?.address ?? ""}
                  onChange={(e) => setVettoreField({ address: e.target.value })}
                  disabled={disabled}
                />
              </div>
            </div>
          )}

          {(vettoreTipo === "subappaltatore" || vettoreTipo === "terzo") && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Conducente — nome</Label>
                <Input
                  placeholder="Nome e cognome"
                  value={(state.ddt_vettore as any)?.conducente_nome ?? ""}
                  onChange={(e) => setVettoreField({ conducente_nome: e.target.value })}
                  disabled={disabled}
                />
              </div>
              <div>
                <Label className="text-xs">Conducente — telefono</Label>
                <Input
                  placeholder="+39…"
                  value={(state.ddt_vettore as any)?.conducente_telefono ?? ""}
                  onChange={(e) => setVettoreField({ conducente_telefono: e.target.value })}
                  disabled={disabled}
                />
              </div>
              <div>
                <Label className="text-xs">Targa mezzo</Label>
                <Input
                  placeholder="AB123CD"
                  value={(state.ddt_vettore as any)?.targa_mezzo ?? ""}
                  onChange={(e) => setVettoreField({ targa_mezzo: e.target.value.toUpperCase() })}
                  disabled={disabled}
                />
              </div>
              <div>
                <Label className="text-xs">N. patente</Label>
                <Input
                  placeholder="Patente"
                  value={(state.ddt_vettore as any)?.patente ?? ""}
                  onChange={(e) => setVettoreField({ patente: e.target.value })}
                  disabled={disabled}
                />
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs">Data/Ora consegna</Label>
            <Input
              type="datetime-local"
              value={state.ddt_data_ora_consegna ?? ""}
              onChange={(e) => setField("ddt_data_ora_consegna", e.target.value)}
              disabled={disabled}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
