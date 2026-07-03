/**
 * HrMansioneBlock — mansionario della persona.
 * Select mansione dal catalogo (salva mansione_id su hr_profili + sincronizza
 * il testo `mansione`), responsabilità ereditate (read-only) + editor delle
 * responsabilità extra della persona, bottone "Applica KPI del ruolo" e link al
 * catalogo (HrMansioniCatalogDialog).
 */
import { useMemo, useState } from "react";
import { useHrMansioni } from "@/hooks/useHrMansioni";
import { useUpdateHrProfilo } from "@/hooks/useOrganigramma";
import { useHrKpi, useHrKpiMutations } from "@/hooks/useHrKpi";
import { HrMansioniCatalogDialog } from "@/components/hr/HrMansioniCatalogDialog";
import type { HrProfilo, HrMansione } from "@/types/hr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, X, Loader2, Settings2, Sparkles, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface Props { profilo: HrProfilo; companyId: string; }

const NONE = "__none__";

export function HrMansioneBlock({ profilo, companyId }: Props) {
  const { data: mansioni = [] } = useHrMansioni(companyId);
  const update = useUpdateHrProfilo();
  const { data: kpis = [] } = useHrKpi(profilo.id);
  const { create } = useHrKpiMutations(profilo.id, companyId);

  const [catalogOpen, setCatalogOpen] = useState(false);
  const [extraInput, setExtraInput] = useState("");
  const [applying, setApplying] = useState(false);

  const selected: HrMansione | undefined = useMemo(
    () => mansioni.find((m) => m.id === profilo.mansione_id),
    [mansioni, profilo.mansione_id],
  );
  const extra = profilo.responsabilita ?? [];

  const onSelectMansione = async (value: string) => {
    const mansione = value === NONE ? null : mansioni.find((m) => m.id === value);
    await update.mutateAsync({
      id: profilo.id,
      mansione_id: mansione?.id ?? null,
      mansione: mansione?.nome ?? profilo.mansione ?? null,
    } as any);
  };

  const saveExtra = async (next: string[]) => {
    await update.mutateAsync({ id: profilo.id, responsabilita: next } as any);
  };
  const addExtra = async () => {
    const v = extraInput.trim();
    if (!v) return;
    await saveExtra([...extra, v]);
    setExtraInput("");
  };
  const removeExtra = async (i: number) => saveExtra(extra.filter((_, idx) => idx !== i));

  const applyKpi = async () => {
    if (!selected || (selected.kpi_suggeriti ?? []).length === 0) return;
    setApplying(true);
    try {
      const existing = new Set(kpis.map((k) => k.nome.trim().toLowerCase()));
      let created = 0, skipped = 0;
      for (const sug of selected.kpi_suggeriti) {
        if (!sug.nome.trim()) continue;
        if (existing.has(sug.nome.trim().toLowerCase())) { skipped++; continue; }
        await create.mutateAsync({
          nome: sug.nome,
          unita: sug.unita,
          target: sug.target,
          direzione: sug.direzione,
          periodo: sug.periodo,
          tipo: "manuale",
          origine_mansione_id: selected.id,
        });
        existing.add(sug.nome.trim().toLowerCase());
        created++;
      }
      toast.success(`${created} KPI creati${skipped ? `, ${skipped} già presenti` : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore applicazione KPI");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-muted-foreground">RUOLO / MANSIONE</h4>
        <Button size="sm" variant="ghost" onClick={() => setCatalogOpen(true)}>
          <Settings2 className="h-4 w-4 mr-1" />Gestisci catalogo
        </Button>
      </div>

      <div>
        <Label>Mansione dal catalogo</Label>
        <Select value={profilo.mansione_id ?? NONE} onValueChange={onSelectMansione} disabled={update.isPending}>
          <SelectTrigger>
            <SelectValue placeholder="Nessuna mansione" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Nessuna mansione</SelectItem>
            {mansioni.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.nome}{m.area ? ` · ${m.area}` : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {mansioni.length === 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            Il catalogo è vuoto. Apri "Gestisci catalogo" per creare le mansioni.
          </p>
        )}
      </div>

      {selected && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              Responsabilità del ruolo
            </div>
            {(selected.kpi_suggeriti ?? []).length > 0 && (
              <Button size="sm" variant="outline" onClick={applyKpi} disabled={applying}>
                {applying ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                Applica KPI del ruolo
              </Button>
            )}
          </div>
          {selected.descrizione && <p className="text-xs text-muted-foreground">{selected.descrizione}</p>}
          {(selected.responsabilita ?? []).length > 0 ? (
            <ul className="list-disc pl-5 text-sm space-y-0.5">
              {selected.responsabilita.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Nessuna responsabilità definita per questo ruolo.</p>
          )}
        </div>
      )}

      <div>
        <Label>Responsabilità extra della persona</Label>
        <div className="flex gap-2 mt-1">
          <Input
            value={extraInput}
            onChange={(e) => setExtraInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExtra(); } }}
            placeholder="Aggiungi una responsabilità specifica e premi Invio"
            disabled={update.isPending}
          />
          <Button type="button" variant="outline" onClick={addExtra} disabled={update.isPending || !extraInput.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {extra.map((r, i) => (
            <Badge key={i} variant="secondary" className="gap-1">
              {r}
              <button type="button" onClick={() => removeExtra(i)} disabled={update.isPending}><X className="h-3 w-3" /></button>
            </Badge>
          ))}
          {extra.length === 0 && <span className="text-xs text-muted-foreground">Nessuna responsabilità extra.</span>}
        </div>
      </div>

      <HrMansioniCatalogDialog open={catalogOpen} onOpenChange={setCatalogOpen} companyId={companyId} />
    </div>
  );
}
