/**
 * EditorDDTOpzioniCard — card "Opzioni avanzate" per DDT.
 * Tutti i campi di trasporto sono qui (Causale, Aspetto, Mezzo, Porto,
 * Colli, Peso, Luogo destinazione, Trasporto a cura di, Annotazioni).
 *
 * Il "Trasporto a cura di" è speciale:
 *   - mostra un Select dei subappaltatori attivi quando il vettore è di
 *     tipo subappaltatore, prefillando ragione_sociale + conducente + targa
 *   - Mittente/Destinatario sono opzioni rapide a un click
 *   - per casi custom (vettore terzo, free text) c'è il collapsible
 *     "Dettagli trasporto avanzati" sotto
 */
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { EditorState, Action } from "./useEditorState";

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<Action>;
  disabled?: boolean;
}

interface SubOption {
  id: string;
  ragione_sociale: string;
  piva: string | null;
  indirizzo: string | null;
  telefono: string | null;
  responsabile: string | null;
}

const CAUSALI = [
  { value: "vendita", label: "Vendita" },
  { value: "reso", label: "Reso" },
  { value: "omaggio", label: "Omaggio" },
  { value: "conto_lavoro", label: "Conto lavoro" },
  { value: "deposito", label: "Deposito" },
  { value: "esposizione", label: "Esposizione" },
  { value: "riparazione", label: "Riparazione" },
  { value: "altro", label: "Altro" },
];

export function EditorDDTOpzioniCard({ state, dispatch, disabled }: Props) {
  const { effectiveCompany } = useAuth();

  const setField = useCallback(
    (field: string, value: unknown) => dispatch({ type: "SET_FIELD", field, value }),
    [dispatch],
  );

  // ── Vettore: derivato dallo state come single source of truth ────
  const vettoreTipo = useMemo(() => {
    const t = (state.ddt_vettore as Record<string, unknown> | null | undefined)?.tipo;
    return typeof t === "string" ? t : "mittente";
  }, [state.ddt_vettore]);

  const selectedSubId = (state.ddt_vettore as Record<string, unknown> | null | undefined)
    ?.subappaltatore_id as string | undefined;

  // ── Registro subappaltatori — caricato solo se serve ─────────────
  const needSubs = vettoreTipo === "subappaltatore";
  const { data: subappaltatori = [] } = useQuery<SubOption[]>({
    queryKey: ["subappaltatori-ddt-opzioni", effectiveCompany?.id],
    enabled: !!effectiveCompany?.id && needSubs,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subappaltatori")
        .select("id, ragione_sociale, piva, indirizzo, telefono, responsabile")
        .eq("company_id", effectiveCompany!.id)
        .eq("is_active", true)
        .order("ragione_sociale", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SubOption[];
    },
  });

  // ── Luogo destinazione: textarea che preserva strutturato ─────────
  const indirizzoConsegnaFreeText = useMemo(() => {
    const ic = (state.ddt_indirizzo_consegna ?? null) as Record<string, unknown> | null;
    if (!ic) return "";
    if (typeof ic.free_text === "string") return ic.free_text;
    const parts = [
      ic.address ?? ic.via,
      ic.postal_code ?? ic.cap,
      ic.city ?? ic.citta ?? ic.comune,
      ic.province ?? ic.provincia,
    ].filter((p) => typeof p === "string" && p.length > 0);
    return parts.join(", ");
  }, [state.ddt_indirizzo_consegna]);

  const handleLuogoChange = useCallback(
    (val: string) => {
      const current = (state.ddt_indirizzo_consegna ?? {}) as Record<string, unknown>;
      const trimmed = val.trim();
      if (!trimmed) {
        if (current && Object.keys(current).some((k) => k !== "free_text")) {
          const { free_text: _ft, ...rest } = current;
          dispatch({ type: "SET_FIELD", field: "ddt_indirizzo_consegna", value: rest });
        } else {
          dispatch({ type: "SET_FIELD", field: "ddt_indirizzo_consegna", value: null });
        }
        return;
      }
      dispatch({ type: "SET_FIELD", field: "ddt_indirizzo_consegna", value: { ...current, free_text: trimmed } });
    },
    [state.ddt_indirizzo_consegna, dispatch],
  );

  // ── Trasporto a cura di: radio rapida + Select subappaltatore ─────
  const handleVettoreTipoChange = useCallback(
    (tipo: string) => {
      const current = (state.ddt_vettore as Record<string, unknown> | null | undefined) ?? {};
      const next: Record<string, unknown> = { ...current, tipo };
      if (tipo !== "subappaltatore") next.subappaltatore_id = null;
      dispatch({ type: "SET_FIELD", field: "ddt_vettore", value: next });
    },
    [state.ddt_vettore, dispatch],
  );

  const handleSelectSub = useCallback(
    (id: string) => {
      const sub = subappaltatori.find((s) => s.id === id);
      if (!sub) return;
      const current = (state.ddt_vettore as Record<string, unknown> | null | undefined) ?? {};
      const patch: Record<string, unknown> = {
        ...current,
        tipo: "subappaltatore",
        subappaltatore_id: sub.id,
        ragione_sociale: sub.ragione_sociale,
        vat_number: sub.piva,
        address: sub.indirizzo,
      };
      // Prefill conducente solo se non già compilato manualmente
      if (!current.conducente_nome) patch.conducente_nome = sub.responsabile ?? null;
      if (!current.conducente_telefono) patch.conducente_telefono = sub.telefono ?? null;
      dispatch({ type: "SET_FIELD", field: "ddt_vettore", value: patch });
    },
    [subappaltatori, state.ddt_vettore, dispatch],
  );

  const setVettoreField = useCallback(
    (patch: Record<string, unknown>) => {
      const current = (state.ddt_vettore as Record<string, unknown> | null | undefined) ?? {};
      dispatch({ type: "SET_FIELD", field: "ddt_vettore", value: { ...current, ...patch } });
    },
    [state.ddt_vettore, dispatch],
  );

  const vettoreNeedsDetails = vettoreTipo === "subappaltatore" || vettoreTipo === "terzo";

  // Riassunto a sola lettura dei dati del vettore selezionato
  const vettoreSummary = useMemo(() => {
    const dv = (state.ddt_vettore ?? null) as Record<string, unknown> | null;
    if (!dv) return "";
    if (typeof dv.free_text === "string" && dv.free_text) return dv.free_text;
    const ragione = (dv.ragione_sociale ?? dv.denominazione) as string | undefined;
    const cond = dv.conducente_nome as string | undefined;
    const targa = dv.targa_mezzo as string | undefined;
    const parts = [
      ragione,
      cond ? `Conducente: ${cond}` : null,
      targa ? `Targa ${targa}` : null,
    ].filter(Boolean);
    return parts.join(" — ");
  }, [state.ddt_vettore]);

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3 border-l-[3px] border-l-sky-400/60 shadow-sm">
      <Label className="text-[11px] font-bold uppercase tracking-wider text-sky-600/80 dark:text-sky-400/80">
        Opzioni avanzate
      </Label>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] text-muted-foreground">Colli</Label>
          <Input
            type="number"
            min={0}
            value={state.ddt_numero_colli ?? ""}
            onChange={(e) => setField("ddt_numero_colli", e.target.value ? Number(e.target.value) : null)}
            disabled={disabled}
            className="h-7 text-xs"
          />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">Peso</Label>
          <Input
            placeholder="0 kg"
            value={state.ddt_peso ?? ""}
            onChange={(e) => setField("ddt_peso", e.target.value)}
            disabled={disabled}
            className="h-7 text-xs"
          />
        </div>
      </div>

      <div>
        <Label className="text-[10px] text-muted-foreground">Causale trasporto</Label>
        <Select
          value={state.ddt_causale_trasporto ?? ""}
          onValueChange={(v) => setField("ddt_causale_trasporto", v)}
          disabled={disabled}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder="Seleziona causale" />
          </SelectTrigger>
          <SelectContent>
            {CAUSALI.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] text-muted-foreground">Aspetto dei beni</Label>
          <Input
            placeholder="Scatola, bancale…"
            value={state.ddt_aspetto_beni ?? ""}
            onChange={(e) => setField("ddt_aspetto_beni", e.target.value)}
            disabled={disabled}
            className="h-7 text-xs"
          />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">Mezzo trasporto</Label>
          <Input
            placeholder="Furgone, autocarro…"
            value={state.ddt_mezzo_trasporto ?? ""}
            onChange={(e) => setField("ddt_mezzo_trasporto", e.target.value)}
            disabled={disabled}
            className="h-7 text-xs"
          />
        </div>
      </div>

      <div>
        <Label className="text-[10px] text-muted-foreground">Porto</Label>
        <RadioGroup
          value={state.ddt_porto ?? "Franco"}
          onValueChange={(v) => setField("ddt_porto", v)}
          className="flex gap-3 mt-1"
          disabled={disabled}
        >
          <div className="flex items-center gap-1.5">
            <RadioGroupItem value="Franco" id="opz-porto-franco" />
            <Label htmlFor="opz-porto-franco" className="text-xs">Franco</Label>
          </div>
          <div className="flex items-center gap-1.5">
            <RadioGroupItem value="Assegnato" id="opz-porto-assegnato" />
            <Label htmlFor="opz-porto-assegnato" className="text-xs">Assegnato</Label>
          </div>
        </RadioGroup>
      </div>

      <div>
        <Label className="text-[10px] text-muted-foreground">Luogo di destinazione</Label>
        <Textarea
          rows={2}
          value={indirizzoConsegnaFreeText}
          onChange={(e) => handleLuogoChange(e.target.value)}
          disabled={disabled}
          className="text-xs resize-none"
          placeholder="Indirizzo cantiere o luogo consegna…"
        />
      </div>

      <div>
        <Label className="text-[10px] text-muted-foreground">Trasporto a cura di</Label>
        <RadioGroup
          value={vettoreTipo}
          onValueChange={handleVettoreTipoChange}
          className="grid grid-cols-2 gap-1.5 mt-1"
          disabled={disabled}
        >
          <div className="flex items-center gap-1.5">
            <RadioGroupItem value="mittente" id="opz-vett-mitt" />
            <Label htmlFor="opz-vett-mitt" className="text-xs">Mittente</Label>
          </div>
          <div className="flex items-center gap-1.5">
            <RadioGroupItem value="destinatario" id="opz-vett-dest" />
            <Label htmlFor="opz-vett-dest" className="text-xs">Destinatario</Label>
          </div>
          <div className="flex items-center gap-1.5">
            <RadioGroupItem value="subappaltatore" id="opz-vett-sub" />
            <Label htmlFor="opz-vett-sub" className="text-xs">Subappaltatore</Label>
          </div>
          <div className="flex items-center gap-1.5">
            <RadioGroupItem value="terzo" id="opz-vett-terzo" />
            <Label htmlFor="opz-vett-terzo" className="text-xs">Vettore terzo</Label>
          </div>
        </RadioGroup>

        {vettoreTipo === "subappaltatore" && (
          <Select
            value={selectedSubId ?? ""}
            onValueChange={handleSelectSub}
            disabled={disabled}
          >
            <SelectTrigger className="h-7 text-xs mt-2">
              <SelectValue placeholder={subappaltatori.length ? "Scegli subappaltatore" : "Nessun subappaltatore attivo"} />
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
        )}

        {vettoreTipo === "terzo" && (
          <div className="grid grid-cols-2 gap-2 mt-2 p-2 rounded bg-muted/40">
            <div className="col-span-2">
              <Label className="text-[10px] text-muted-foreground">Denominazione vettore</Label>
              <Input
                placeholder="Ragione sociale"
                value={
                  (state.ddt_vettore as Record<string, unknown> | null | undefined)?.ragione_sociale as string ||
                  (state.ddt_vettore as Record<string, unknown> | null | undefined)?.denominazione as string ||
                  ""
                }
                onChange={(e) => setVettoreField({ ragione_sociale: e.target.value })}
                disabled={disabled}
                className="h-7 text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">P.IVA</Label>
              <Input
                placeholder="P.IVA"
                value={
                  (state.ddt_vettore as Record<string, unknown> | null | undefined)?.vat_number as string ||
                  (state.ddt_vettore as Record<string, unknown> | null | undefined)?.partita_iva as string ||
                  ""
                }
                onChange={(e) => setVettoreField({ vat_number: e.target.value })}
                disabled={disabled}
                className="h-7 text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Indirizzo</Label>
              <Input
                placeholder="Via, comune"
                value={(state.ddt_vettore as Record<string, unknown> | null | undefined)?.address as string ?? ""}
                onChange={(e) => setVettoreField({ address: e.target.value })}
                disabled={disabled}
                className="h-7 text-xs"
              />
            </div>
          </div>
        )}

        {vettoreNeedsDetails && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <Label className="text-[10px] text-muted-foreground">Conducente</Label>
              <Input
                placeholder="Nome e cognome"
                value={(state.ddt_vettore as Record<string, unknown> | null | undefined)?.conducente_nome as string ?? ""}
                onChange={(e) => setVettoreField({ conducente_nome: e.target.value })}
                disabled={disabled}
                className="h-7 text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Telefono</Label>
              <Input
                placeholder="+39…"
                value={(state.ddt_vettore as Record<string, unknown> | null | undefined)?.conducente_telefono as string ?? ""}
                onChange={(e) => setVettoreField({ conducente_telefono: e.target.value })}
                disabled={disabled}
                className="h-7 text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Targa</Label>
              <Input
                placeholder="AB123CD"
                value={(state.ddt_vettore as Record<string, unknown> | null | undefined)?.targa_mezzo as string ?? ""}
                onChange={(e) => setVettoreField({ targa_mezzo: e.target.value.toUpperCase() })}
                disabled={disabled}
                className="h-7 text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">N. patente</Label>
              <Input
                placeholder="Patente"
                value={(state.ddt_vettore as Record<string, unknown> | null | undefined)?.patente as string ?? ""}
                onChange={(e) => setVettoreField({ patente: e.target.value })}
                disabled={disabled}
                className="h-7 text-xs"
              />
            </div>
          </div>
        )}

        {!vettoreNeedsDetails && vettoreSummary && (
          <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug">{vettoreSummary}</p>
        )}
      </div>

      <div>
        <Label className="text-[10px] text-muted-foreground">Data/Ora consegna</Label>
        <Input
          type="datetime-local"
          value={state.ddt_data_ora_consegna ?? ""}
          onChange={(e) => setField("ddt_data_ora_consegna", e.target.value)}
          disabled={disabled}
          className="h-7 text-xs"
        />
      </div>

      <div>
        <Label className="text-[10px] text-muted-foreground">Annotazioni</Label>
        <Textarea
          rows={2}
          value={state.note_documento ?? ""}
          onChange={(e) => setField("note_documento", e.target.value)}
          disabled={disabled}
          className="text-xs resize-none"
        />
      </div>
    </div>
  );
}
