import { SpesePianoMezzo } from "./SpesePianoMezzo";
import { ViaggioSelect } from "./ViaggioSelect";
import { SupplierSelect } from "@/components/orders/SupplierSelect";
import { usePersonePianoMezzi } from "@/hooks/useMezziPianoEconomia";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Truck, Wrench, Pencil, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { usePermissions } from "@/hooks/usePermissions";
import { useMezzi } from "@/hooks/useMezzi";
import { usePianoMezziCantiere } from "@/hooks/usePianoMezziCantiere";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { supabase } from "@/integrations/supabase/client";
import {
  costoPianoMezzo,
  pianoPerFase,
  statoPianoMezzo,
  type PianoMezzo,
  type CostoPianoMezzo,
  type BaseCostoMezzo,
} from "@/lib/mezzi/pianoCantiere";
import { formatCurrency } from "@/lib/formatters";
import { oggiIso, formatData, POSSESSI } from "@/types/mezzi";
import { MezzoFormDialog } from "./MezzoFormDialog";
import { MezziCommessaCard } from "./MezziCommessaCard";

export function PianoMezziCantiere({
  orderId,
  faseId,
}: {
  orderId: string;
  faseId?: string;
}) {
  const perms = usePermissions();
  const vede = perms.canViewMezzi || perms.isAdmin;
  const modifica =
    vede && (perms.canEditMezzi || perms.isAdmin) && !perms.solaLettura;
  const costi = perms.canViewCosts === true;
  const {
    data: mezzi = [],
    isLoading: loadingMezzi,
    isError: erroreMezzi,
    refetch: refetchMezzi,
  } = useMezzi();
  const { piani, prezzi, salva } = usePianoMezziCantiere(orderId, vede, costi);
  const companyId = useEffectiveCompanyId();
  const fasi = useQuery({
    queryKey: ["mezzi-piani-fasi", companyId, orderId],
    enabled: vede && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_work_phases")
        .select("id,name,start_date,end_date")
        .eq("order_id", orderId)
        .eq("company_id", companyId!)
        .order("position");
      if (error) throw error;
      return data;
    },
  });
  const dateCantiere = useQuery({
    queryKey: ["mezzi-piani-date", companyId, orderId],
    enabled: vede && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("work_start_date,work_end_date")
        .eq("company_id", companyId!)
        .eq("id", orderId)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const [aperto, setAperto] = useState(false);
  const [nuovo, setNuovo] = useState<"mezzo" | "attrezzatura" | null>(null);
  const [storico, setStorico] = useState(false);
  const [filtro, setFiltro] = useState("tutti");
  const [draft, setDraft] = useState<Partial<PianoMezzo>>({});
  const [ambito, setAmbito] = useState("cantiere");
  const [tariffa, setTariffa] = useState("");
  const [base, setBase] = useState<BaseCostoMezzo>("totale");
  const [extra, setExtra] = useState("");
  const [fornitore, setFornitore] = useState("");
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const persone = usePersonePianoMezzi(orderId, vede);
  const oggi = oggiIso();
  const asset = mezzi.find((m) => m.id === draft.mezzo_id);
  const noleggio = asset?.possesso.startsWith("noleggio");
  const rows = (piani.data ?? [])
    .filter((p) => pianoPerFase(p, faseId))
    .filter((p) => storico || (!p.annullato && (!p.al || p.al >= oggi)))
    .filter((p) => {
      const m = mezzi.find((m) => m.id === p.mezzo_id);
      return (
        filtro === "tutti" ||
        (filtro === "noleggio"
          ? m?.possesso.startsWith("noleggio")
          : filtro === "attrezzatura"
            ? m?.tipo === "attrezzatura"
            : m?.tipo !== "attrezzatura")
      );
    });
  const apri = (p?: PianoMezzo) => {
    setDraft(
      p ?? {
        mezzo_id: "",
        dal: oggi,
        al: null,
        quantita: 1,
        fase_ids: faseId ? [faseId] : [],
        annullato: false,
      },
    );
    setAmbito(
      p
        ? p.fase_ids.length
          ? "fasi"
          : "cantiere"
        : faseId
          ? "fasi"
          : "cantiere",
    );
    const c = p ? prezzi.data?.[p.id] : undefined;
    setTariffa(c ? String(c.tariffa) : "");
    setBase(c?.base ?? "totale");
    setExtra(c ? String(c.extra) : "");
    setFornitore(c?.fornitore ?? "");
    setSupplierId(c?.supplier_id ?? null);
    setAperto(true);
  };
  const prezzo: CostoPianoMezzo = {
    tariffa: Number(tariffa),
    base,
    extra: Number(extra || 0),
    fornitore: fornitore.trim() || null,
    supplier_id: supplierId,
  };
  const totale =
    tariffa.trim() && draft.dal
      ? costoPianoMezzo({ dal: draft.dal, al: draft.al ?? null }, prezzo)
      : null;
  const valido =
    !!draft.mezzo_id &&
    !!draft.dal &&
    (!draft.al || draft.al >= draft.dal) &&
    Number(draft.quantita) > 0 &&
    (ambito === "cantiere" || !!draft.fase_ids?.length) &&
    (!costi ||
      (!tariffa.trim()
        ? !noleggio
        : Number.isFinite(prezzo.tariffa) &&
          prezzo.tariffa >= 0 &&
          Number.isFinite(prezzo.extra) &&
          prezzo.extra >= 0));
  const periodiSuggeriti =
    ambito === "cantiere"
      ? [
          {
            start_date: dateCantiere.data?.work_start_date,
            end_date: dateCantiere.data?.work_end_date,
          },
        ]
      : (fasi.data ?? []).filter((f) => draft.fase_ids?.includes(f.id));
  const inizioSuggerito = periodiSuggeriti
    .map((p) => p.start_date)
    .filter((x): x is string => !!x)
    .sort()[0];
  const fineSuggerita = periodiSuggeriti
    .map((p) => p.end_date)
    .filter((x): x is string => !!x)
    .sort()
    .at(-1);
  const salvaDraft = async () => {
    if (!valido) return;
    try {
      await salva.mutateAsync({
        ...draft,
        fase_ids: ambito === "cantiere" ? [] : draft.fase_ids,
        ...(costi ? { costo: tariffa.trim() ? prezzo : null } : {}),
      });
      setAperto(false);
    } catch {
      /* mutation mostra l'errore */
    }
  };
  if (!vede) return null;
  return (
    <div className="space-y-4">
      <section
        className="rounded-xl border bg-background p-3 sm:p-4"
        aria-label="Pianificazione mezzi e attrezzature"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold">
              <Truck className="h-4 w-4" />
              Mezzi e attrezzature
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {faseId
                ? "Risorse per questa fase e per tutto il cantiere."
                : "Organizza cosa serve, dove e per quanto tempo."}
            </p>
          </div>
          {modifica && (
            <Button
              size="sm"
              onClick={() => apri()}
              disabled={loadingMezzi || erroreMezzi || fasi.isError}
            >
              <Plus className="mr-1 h-4 w-4" />
              Pianifica risorsa
            </Button>
          )}
        </div>
        <div className="my-3 flex flex-wrap items-center gap-2">
          {["tutti", "mezzo", "attrezzatura", "noleggio"].map((v, i) => (
            <Button
              key={v}
              size="sm"
              variant={filtro === v ? "secondary" : "ghost"}
              onClick={() => setFiltro(v)}
            >
              {["Tutti", "Mezzi", "Attrezzature", "Noleggi"][i]}
            </Button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={storico}
              onChange={(e) => setStorico(e.target.checked)}
            />
            Mostra terminati e annullati
          </label>
        </div>
        {piani.isLoading ? (
          <Loader2 className="mx-auto my-4 h-5 w-5 animate-spin" />
        ) : piani.isError || erroreMezzi || fasi.isError ? (
          <p role="alert" className="py-4 text-sm text-destructive">
            Impossibile caricare la pianificazione.{" "}
            <button
              className="underline"
              onClick={() => {
                void piani.refetch();
                void fasi.refetch();
                void refetchMezzi();
              }}
            >
              Riprova
            </button>
          </p>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
            Nessuna risorsa pianificata con questi filtri.
            <p className="mt-1 text-xs">
              Ad esempio: gru per tutto il cantiere, betoniera dal 2 al 6
              novembre per i getti.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="p-2">Risorsa</th>
                  <th className="p-2">Assegnazione</th>
                  <th className="p-2">Periodo</th>
                  {costi && <th className="p-2 text-right">Costo previsto</th>}
                  <th className="p-2">Stato</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const m = mezzi.find((m) => m.id === p.mezzo_id);
                  const c = prezzi.data?.[p.id];
                  const t = c ? costoPianoMezzo(p, c) : null;
                  return (
                    <tr
                      key={p.id}
                      className="cursor-pointer border-b last:border-0 hover:bg-muted/30"
                      onClick={() => {
                        if (!costi || (!prezzi.isFetching && !prezzi.isError))
                          apri(p);
                      }}
                    >
                      <td className="p-2">
                        <button
                          type="button"
                          className="text-left font-medium text-blue-700 hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            apri(p);
                          }}
                          disabled={
                            costi && (prezzi.isFetching || prezzi.isError)
                          }
                        >
                          {m?.tipo === "attrezzatura" ? (
                            <Wrench className="mr-1 inline h-3.5 w-3.5" />
                          ) : (
                            <Truck className="mr-1 inline h-3.5 w-3.5" />
                          )}
                          {m?.nome ?? "Risorsa archiviata"}
                        </button>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {POSSESSI.find((x) => x.value === m?.possesso)?.label}
                          {p.responsabile_hr_id && (
                            <span className="block">
                              Referente:{" "}
                              {persone.data?.find(
                                (x) => x.id === p.responsabile_hr_id,
                              )?.nome ?? "Assegnato"}
                            </span>
                          )}
                          {m?.gestione === "quantita"
                            ? ` · ${p.quantita} ${m.unita_misura ?? "pz"}`
                            : ""}
                        </p>
                      </td>
                      <td className="max-w-64 p-2 text-xs">
                        {p.fase_ids.length
                          ? p.fase_ids
                              .map(
                                (id) =>
                                  fasi.data?.find((f) => f.id === id)?.name ??
                                  "Fase rimossa",
                              )
                              .join(", ")
                          : "Tutto il cantiere"}
                      </td>
                      <td className="whitespace-nowrap p-2 text-xs">
                        {formatData(p.dal)} →{" "}
                        {p.al ? formatData(p.al) : "Fine da definire"}
                      </td>
                      {costi && (
                        <td className="p-2 text-right text-xs">
                          {prezzi.isError
                            ? "Non disponibile"
                            : prezzi.isFetching
                              ? "Caricamento…"
                              : t !== null
                                ? formatCurrency(t)
                                : c
                                  ? "Definisci la fine"
                                  : "Da valorizzare"}
                          {c && (
                            <p className="text-muted-foreground">
                              {formatCurrency(c.tariffa)} /{" "}
                              {c.base === "totale" ? "assegnazione" : c.base}
                            </p>
                          )}
                        </td>
                      )}
                      <td className="p-2">
                        <Badge
                          variant="outline"
                          className="whitespace-nowrap text-[11px]"
                        >
                          {statoPianoMezzo(p, oggi)}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {prezzi.isError && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            Costi non disponibili.{" "}
            <button className="underline" onClick={() => void prezzi.refetch()}>
              Riprova
            </button>
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          La pianificazione prenota la risorsa. La presenza effettiva si
          registra all’arrivo e al rientro.
          {costi
            ? " Costi previsti al netto IVA, separati dalle fatture e dalle stime del parco."
            : ""}
        </p>
      </section>
      {!faseId && (
        <details className="rounded-xl border bg-background p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Presenza effettiva, montaggi e viaggi
          </summary>
          <div className="mt-3">
            <MezziCommessaCard orderId={orderId} compact />
          </div>
        </details>
      )}
      <Dialog
        open={aperto}
        onOpenChange={(v) => {
          if (!salva.isPending) setAperto(v);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {draft.id ? "Dettaglio assegnazione" : "Pianifica una risorsa"}
            </DialogTitle>
            <DialogDescription>
              Scegli mezzo o attrezzatura, fasi e periodo di utilizzo.
            </DialogDescription>
          </DialogHeader>
          <fieldset
            disabled={!modifica || salva.isPending}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="piano-risorsa">Mezzo o attrezzatura</Label>
              <ViaggioSelect
                label="Mezzo o attrezzatura"
                id="piano-risorsa"
                value={draft.mezzo_id ?? ""}
                disabled={!!draft.id || !modifica}
                onValueChange={(id) =>
                  setDraft({ ...draft, mezzo_id: id, quantita: 1 })
                }
                emptyMessage="Risorsa non trovata. Puoi registrarla con i pulsanti qui sotto."
                options={[
                  { value: "", label: "Cerca nel parco aziendale…" },
                  ...mezzi
                    .filter(
                      (m) =>
                        m.stato !== "fuori_servizio" || m.id === draft.mezzo_id,
                    )
                    .map((m) => ({
                      value: m.id,
                      label: `${m.nome} · ${m.tipo === "attrezzatura" ? "Attrezzatura" : "Mezzo"} · ${POSSESSI.find((x) => x.value === m.possesso)?.label ?? ""}`,
                    })),
                ]}
              />
              {!draft.id && (
                <div className="flex gap-2">
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => setNuovo("mezzo")}
                  >
                    + Registra mezzo o noleggio
                  </Button>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => setNuovo("attrezzatura")}
                  >
                    + Registra attrezzatura
                  </Button>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="piano-ambito">Dove serve</Label>
              <ViaggioSelect
                label="Dove serve"
                id="piano-ambito"
                value={ambito}
                onValueChange={setAmbito}
                disabled={!modifica}
                options={[
                  { value: "cantiere", label: "Tutto il cantiere" },
                  { value: "fasi", label: "Solo alcune fasi" },
                ]}
              />
              {ambito === "fasi" && (
                <div className="max-h-36 space-y-2 overflow-y-auto rounded-lg border p-3">
                  {fasi.data?.length ? (
                    fasi.data.map((f) => (
                      <label
                        key={f.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={draft.fase_ids?.includes(f.id) ?? false}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              fase_ids: e.target.checked
                                ? [...(draft.fase_ids ?? []), f.id]
                                : (draft.fase_ids ?? []).filter(
                                    (id) => id !== f.id,
                                  ),
                            })
                          }
                        />
                        {f.name}
                      </label>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Crea prima le lavorazioni nella commessa.
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Responsabile della risorsa</Label>
              <ViaggioSelect
                label="Responsabile della risorsa"
                value={draft.responsabile_hr_id ?? ""}
                disabled={!modifica || persone.isLoading || persone.isError}
                emptyMessage="Nessuna persona corrispondente."
                onValueChange={(v) =>
                  setDraft({ ...draft, responsabile_hr_id: v || null })
                }
                options={[
                  { value: "", label: "Nessun responsabile assegnato" },
                  ...(persone.data ?? [])
                    .slice()
                    .sort(
                      (a, b) => Number(b.in_cantiere) - Number(a.in_cantiere),
                    )
                    .map((p) => ({
                      value: p.id,
                      label: `${p.nome}${p.capocantiere ? " · Capocantiere" : p.in_cantiere ? " · Nel cantiere" : " · Azienda"}`,
                    })),
                ]}
              />
              {persone.isError && (
                <p role="alert" className="text-xs text-destructive">
                  Persone non disponibili.{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => void persone.refetch()}
                  >
                    Riprova
                  </button>
                </p>
              )}
              {modifica && persone.data?.some((p) => p.capocantiere) && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      responsabile_hr_id: persone.data!.find(
                        (p) => p.capocantiere,
                      )!.id,
                    })
                  }
                >
                  Usa il capocantiere
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                Referente operativo di questa assegnazione. Non cambia nomine di
                sicurezza, accessi o abilitazioni all’uso.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="piano-dal">Dal</Label>
                <Input
                  id="piano-dal"
                  type="date"
                  value={draft.dal ?? ""}
                  onChange={(e) => setDraft({ ...draft, dal: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="piano-al">Al (compreso)</Label>
                <Input
                  id="piano-al"
                  type="date"
                  min={draft.dal}
                  value={draft.al ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, al: e.target.value || null })
                  }
                />
              </div>
            </div>
            {inizioSuggerito && fineSuggerita && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setDraft({
                    ...draft,
                    dal: inizioSuggerito,
                    al: fineSuggerita,
                  })
                }
              >
                Usa le date{" "}
                {ambito === "cantiere"
                  ? "del cantiere"
                  : "delle fasi selezionate"}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Lascia la fine vuota se ancora da definire. Le date restano quelle
              concordate anche se le fasi vengono ripianificate.
            </p>
            {asset?.gestione === "quantita" && (
              <div className="space-y-2">
                <Label htmlFor="piano-quantita">
                  Quantità ({asset.unita_misura ?? "pz"})
                </Label>
                <Input
                  id="piano-quantita"
                  type="number"
                  min="0.01"
                  step="any"
                  value={draft.quantita ?? 1}
                  onChange={(e) =>
                    setDraft({ ...draft, quantita: Number(e.target.value) })
                  }
                />
              </div>
            )}
            {costi && (
              <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                <h4 className="text-sm font-semibold">
                  {noleggio
                    ? "Costo del noleggio"
                    : "Costo previsto dell’assegnazione (facoltativo)"}
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="piano-tariffa">
                      Importo €{noleggio ? " *" : ""}
                    </Label>
                    <Input
                      id="piano-tariffa"
                      type="number"
                      min="0"
                      step="0.01"
                      value={tariffa}
                      onChange={(e) => setTariffa(e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="piano-base">Tariffa</Label>
                    <ViaggioSelect
                      label="Tariffa"
                      id="piano-base"
                      value={base}
                      onValueChange={(v) => setBase(v as BaseCostoMezzo)}
                      disabled={!modifica}
                      options={[
                        { value: "totale", label: "Totale concordato" },
                        { value: "giorno", label: "Al giorno" },
                        { value: "settimana", label: "A settimana (7 giorni)" },
                        { value: "mese", label: "Al mese (30 giorni)" },
                      ]}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="piano-extra">
                      Trasporto, montaggio e altri extra €
                    </Label>
                    <Input
                      id="piano-extra"
                      type="number"
                      min="0"
                      step="0.01"
                      value={extra}
                      onChange={(e) => setExtra(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Fornitore</Label>
                    <SupplierSelect
                      searchable
                      value={supplierId ?? undefined}
                      fallbackCompanyId={companyId ?? undefined}
                      allowCreate={
                        modifica &&
                        (perms.canManageSuppliers ||
                          perms.canEditSettingsSuppliers ||
                          perms.isAdmin)
                      }
                      onSupplierNameChange={setFornitore}
                      onValueChange={(id) => {
                        setSupplierId(id ?? null);
                      }}
                    />
                    {!supplierId && fornitore && (
                      <p className="text-xs text-muted-foreground">
                        Riferimento precedente: {fornitore}. Scegli l’anagrafica
                        da collegare.
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Tariffa per l’intera assegnazione, quantità inclusa. Tutti i
                  giorni di calendario compresi; settimane e mesi
                  riproporzionati.
                </p>
                <p className="text-sm font-semibold">
                  Totale previsto:{" "}
                  {totale !== null
                    ? formatCurrency(totale)
                    : "indica importo e data di fine"}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="piano-note">Note operative</Label>
              <Input
                id="piano-note"
                value={draft.note ?? ""}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              />
            </div>
            {draft.id && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.annullato ?? false}
                  onChange={(e) =>
                    setDraft({ ...draft, annullato: e.target.checked })
                  }
                />
                Assegnazione annullata (rimane nello storico)
              </label>
            )}
          </fieldset>
          {draft.id && (
            <SpesePianoMezzo
              orderId={orderId}
              pianoId={draft.id}
              supplierId={supplierId}
            />
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAperto(false)}
              disabled={salva.isPending}
            >
              {modifica ? "Annulla" : "Chiudi"}
            </Button>
            {modifica && (
              <Button
                disabled={!valido || salva.isPending || fasi.isLoading}
                onClick={() => void salvaDraft()}
              >
                {salva.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Pencil className="mr-1 h-4 w-4" />
                )}
                Salva pianificazione
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {nuovo && (
        <MezzoFormDialog
          open
          onOpenChange={(v) => {
            if (!v) setNuovo(null);
          }}
          classe={nuovo}
          onSalvato={(id) => {
            setDraft((d) => ({ ...d, mezzo_id: id }));
            setNuovo(null);
          }}
        />
      )}
    </div>
  );
}

export function MezziFaseCantiere({
  orderId,
  faseId,
}: {
  orderId: string;
  faseId: string;
}) {
  const [open, setOpen] = useState(false);
  const p = usePermissions();
  const vede = p.canViewMezzi || p.isAdmin;
  const { piani } = usePianoMezziCantiere(orderId, vede, false);
  if (!vede) return null;
  const n =
    piani.data?.filter(
      (x) =>
        !x.annullato && (!x.al || x.al >= oggiIso()) && pianoPerFase(x, faseId),
    ).length ?? 0;
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="min-h-9 rounded-full text-xs"
        onClick={() => setOpen(true)}
      >
        <Truck className="mr-1 h-3.5 w-3.5" />
        Mezzi e attrezzature{n ? ` · ${n}` : ""}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Risorse della lavorazione</DialogTitle>
            <DialogDescription>
              Gestisci le assegnazioni senza uscire dalla commessa.
            </DialogDescription>
          </DialogHeader>
          {open && <PianoMezziCantiere orderId={orderId} faseId={faseId} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
