/**
 * AggiungiVociDialog — picker per aggiungere voci alla simulazione da due fonti:
 *
 *   1. "Listino aziendale" — `tariffe_aziendali` della company effettiva (attive).
 *      Ricerca per nome/codice, selezione multipla con checkbox.
 *   2. "Prezzario regionale" — ricerca FTS cross-fonte via
 *      `usePrezzarioVociGlobalSearch` (libreria prezzari condivisa).
 *
 * Su "Aggiungi" mappa le selezioni → `VoceSim[]` (con `crypto.randomUUID()` e
 * `ordine` progressivo a partire da 0; l'editor li accoda) e chiama `onAdd`,
 * poi chiude. La selezione si azzera alla chiusura.
 *
 * Le tabelle `tariffe_aziendali`/`prezzario_*` sono lette via query diretta /
 * hook esistente; `tariffe_aziendali` NON ha un hook "lista completa" dedicato
 * → query diretta con `useEffectiveCompanyId` (stesso pattern di SettingsTariffe).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Library, MapPin, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { usePrezzarioVociGlobalSearch } from "@/lib/prezzario/queries";
import { formatCurrency } from "@/lib/formatters";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/ui/empty-state";
import type { VoceSim } from "@/lib/simulatore/tipi";
import type { PrezzarioVoceConFonte } from "@/lib/prezzario/queries";

// Tipo locale snello per il picker (solo i campi usati nel mapping → VoceSim).
// `codice` non è nei tipi generati di `tariffe_aziendali` → leggiamo via cast
// `supabase as any` (stesso pattern di useListinoLavorazioni/useListinoTariffe).
interface TariffaListino {
  id: string;
  nome: string;
  codice: string | null;
  tipo: string | null;
  unita: string | null;
  unita_fatturazione: string | null;
  costo_interno: number | null;
  prezzo_costo: number | null;
  costo_default: number | null;
  prezzo_vendita: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = () => supabase as any;

/** Lista tariffe attive della company per il picker (ricerca client-side). */
function useListinoTariffe(enabled: boolean) {
  const companyId = useEffectiveCompanyId();
  return useQuery<TariffaListino[]>({
    queryKey: ["sim-listino-tariffe", companyId],
    enabled: enabled && !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await sb()
        .from("tariffe_aziendali")
        .select(
          "id, nome, codice, tipo, unita, unita_fatturazione, costo_interno, prezzo_costo, costo_default, prezzo_vendita",
        )
        .eq("company_id", companyId!)
        .eq("attivo", true)
        .order("nome", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as TariffaListino[];
    },
  });
}

// ─── Mapper → VoceSim ─────────────────────────────────────────────────────────

function tariffaToVoce(t: TariffaListino, ordine: number): VoceSim {
  return {
    id: crypto.randomUUID(),
    fase_id: null,
    descrizione: t.nome,
    fonte: "listino",
    riferimento_id: t.id,
    codice: t.codice ?? null,
    quantita: 1,
    unita: t.unita_fatturazione ?? t.unita ?? "pz",
    costo_unitario: t.costo_interno ?? t.prezzo_costo ?? t.costo_default ?? 0,
    ricarico_pct: 0,
    prezzo_unitario: t.prezzo_vendita ?? 0,
    vat_rate: 10,
    bene_significativo: false,
    valore_posa_associata: null,
    is_manodopera: t.tipo === "manodopera",
    ordine,
  };
}

function prezzarioToVoce(v: PrezzarioVoceConFonte, ordine: number): VoceSim {
  return {
    id: crypto.randomUUID(),
    fase_id: null,
    descrizione: v.descrizione,
    fonte: "prezzario",
    riferimento_id: v.id,
    codice: v.codice ?? null,
    quantita: 1,
    unita: v.unita_misura ?? "pz",
    costo_unitario: v.prezzo ?? 0,
    ricarico_pct: 0,
    prezzo_unitario: v.prezzo ?? 0,
    vat_rate: 10,
    bene_significativo: false,
    valore_posa_associata: null,
    is_manodopera: false,
    ordine,
  };
}

// ─── Componente ───────────────────────────────────────────────────────────────

interface AggiungiVociDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (voci: VoceSim[]) => void;
}

export function AggiungiVociDialog({ open, onOpenChange, onAdd }: AggiungiVociDialogProps) {
  const [tab, setTab] = useState<"listino" | "prezzario">("listino");
  const [qListino, setQListino] = useState("");
  const [qPrezzario, setQPrezzario] = useState("");

  // Selezioni separate per tab: Map id→entità così possiamo mappare al "Aggiungi".
  const [selListino, setSelListino] = useState<Map<string, TariffaListino>>(new Map());
  const [selPrezzario, setSelPrezzario] = useState<Map<string, PrezzarioVoceConFonte>>(new Map());

  const listinoQuery = useListinoTariffe(open);
  const prezzarioQuery = usePrezzarioVociGlobalSearch(qPrezzario);

  // Filtro client-side sul listino (nome/codice).
  const listinoFiltrato = useMemo(() => {
    const rows = listinoQuery.data ?? [];
    const t = qListino.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter(
      (r) =>
        r.nome.toLowerCase().includes(t) ||
        (r.codice ?? "").toLowerCase().includes(t),
    );
  }, [listinoQuery.data, qListino]);

  const totSelezionate = selListino.size + selPrezzario.size;

  const reset = () => {
    setSelListino(new Map());
    setSelPrezzario(new Map());
    setQListino("");
    setQPrezzario("");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const toggleListino = (t: TariffaListino) => {
    setSelListino((prev) => {
      const next = new Map(prev);
      if (next.has(t.id)) next.delete(t.id);
      else next.set(t.id, t);
      return next;
    });
  };

  const togglePrezzario = (v: PrezzarioVoceConFonte) => {
    setSelPrezzario((prev) => {
      const next = new Map(prev);
      if (next.has(v.id)) next.delete(v.id);
      else next.set(v.id, v);
      return next;
    });
  };

  const handleAdd = () => {
    let ordine = 0;
    const voci: VoceSim[] = [];
    for (const t of selListino.values()) voci.push(tariffaToVoce(t, ordine++));
    for (const v of selPrezzario.values()) voci.push(prezzarioToVoce(v, ordine++));
    if (voci.length > 0) onAdd(voci);
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[88vh] max-w-3xl flex-col">
        <DialogHeader>
          <DialogTitle>Aggiungi voci</DialogTitle>
          <DialogDescription>
            Scegli dal listino aziendale o dai prezzari regionali. Puoi selezionarne più di una.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "listino" | "prezzario")} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="listino" className="gap-1.5">
              <Library className="h-4 w-4" />
              Listino aziendale
              {selListino.size > 0 ? (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5">{selListino.size}</Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="prezzario" className="gap-1.5">
              <MapPin className="h-4 w-4" />
              Prezzario regionale
              {selPrezzario.size > 0 ? (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5">{selPrezzario.size}</Badge>
              ) : null}
            </TabsTrigger>
          </TabsList>

          {/* ── Listino aziendale ──────────────────────────────────────────── */}
          <TabsContent value="listino" className="mt-3 flex min-h-0 flex-1 flex-col gap-3 data-[state=inactive]:hidden">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={qListino}
                onChange={(e) => setQListino(e.target.value)}
                placeholder="Cerca per nome o codice…"
                className="pl-8"
              />
            </div>
            <ScrollArea className="h-[44vh] rounded-md border">
              <div className="space-y-1 p-2">
                {listinoQuery.isLoading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Caricamento listino…
                  </div>
                ) : listinoFiltrato.length === 0 ? (
                  <EmptyState
                    icon={Library}
                    size="sm"
                    title={qListino ? "Nessun risultato" : "Listino vuoto"}
                    description={
                      qListino
                        ? "Nessuna voce di listino corrisponde alla ricerca."
                        : "Non ci sono ancora voci attive nel listino aziendale."
                    }
                  />
                ) : (
                  listinoFiltrato.map((t) => {
                    const checked = selListino.has(t.id);
                    const costo = t.costo_interno ?? t.prezzo_costo ?? t.costo_default ?? 0;
                    return (
                      <label
                        key={t.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-md border p-2.5 transition-colors ${
                          checked ? "border-primary/40 bg-primary/[0.03]" : "hover:bg-muted/40"
                        }`}
                      >
                        <Checkbox checked={checked} onCheckedChange={() => toggleListino(t)} className="mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">{t.nome}</span>
                            {t.codice ? (
                              <span className="shrink-0 font-mono text-xs text-muted-foreground">{t.codice}</span>
                            ) : null}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            <span>{t.unita_fatturazione ?? t.unita ?? "pz"}</span>
                            <span>
                              Prezzo{" "}
                              <span className="font-medium text-foreground">
                                {formatCurrency(t.prezzo_vendita ?? 0)}
                              </span>
                            </span>
                            {costo > 0 ? <span>Costo {formatCurrency(costo)}</span> : null}
                          </div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ── Prezzario regionale ────────────────────────────────────────── */}
          <TabsContent value="prezzario" className="mt-3 flex min-h-0 flex-1 flex-col gap-3 data-[state=inactive]:hidden">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={qPrezzario}
                onChange={(e) => setQPrezzario(e.target.value)}
                placeholder="Cerca nei prezzari regionali (min. 2 caratteri)…"
                className="pl-8"
              />
            </div>
            <ScrollArea className="h-[44vh] rounded-md border">
              <div className="space-y-1 p-2">
                {qPrezzario.trim().length < 2 ? (
                  <EmptyState
                    icon={MapPin}
                    size="sm"
                    title="Cerca una voce"
                    description="Digita almeno 2 caratteri per cercare nei prezzari regionali pubblicati."
                  />
                ) : prezzarioQuery.isLoading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Ricerca…
                  </div>
                ) : (prezzarioQuery.data ?? []).length === 0 ? (
                  <EmptyState
                    icon={MapPin}
                    size="sm"
                    title="Nessun risultato"
                    description="Nessuna voce di prezzario corrisponde alla ricerca."
                  />
                ) : (
                  (prezzarioQuery.data ?? []).map((v) => {
                    const checked = selPrezzario.has(v.id);
                    return (
                      <label
                        key={v.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-md border p-2.5 transition-colors ${
                          checked ? "border-primary/40 bg-primary/[0.03]" : "hover:bg-muted/40"
                        }`}
                      >
                        <Checkbox checked={checked} onCheckedChange={() => togglePrezzario(v)} className="mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="line-clamp-2 text-sm font-medium">{v.descrizione}</span>
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal">
                              {v.fonteLabel}
                            </Badge>
                            {v.codice ? <span className="font-mono">{v.codice}</span> : null}
                            <span>{v.unita_misura ?? "pz"}</span>
                            <span className="font-medium text-foreground">{formatCurrency(v.prezzo ?? 0)}</span>
                          </div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 sm:gap-2">
          <span className="mr-auto self-center text-sm text-muted-foreground">
            {totSelezionate > 0 ? `${totSelezionate} selezionate` : "Nessuna selezione"}
          </span>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={handleAdd} disabled={totSelezionate === 0}>
            Aggiungi{totSelezionate > 0 ? ` (${totSelezionate})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
