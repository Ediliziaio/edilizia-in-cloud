import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  bankRpc,
  CONTEXT_LABELS,
  type BankContext,
  type BankMovement,
  type BankTarget,
  type ContextKind,
} from "@/lib/finance/bankWorkspace";
import { leggiImporto } from "@/lib/finance/reconciliationAnalysis";
import { formatTreasuryCurrency as money } from "@/lib/treasury";

type Draft = BankContext & { text: string };
export function BankContextEditor({
  company,
  movement,
  revision,
  onSaved,
  canPersonnel,
  canMezzi,
  onDirty,
}: {
  company: string;
  movement: BankMovement;
  revision: number;
  onSaved: (revision: number) => void;
  canPersonnel: boolean;
  canMezzi: boolean;
  onDirty: () => void;
}) {
  const [rows, setRows] = useState<Draft[]>(() =>
    movement.links.contexts.map((c) => ({ ...c, text: String(c.amount) })),
  );
  const [kind, setKind] = useState<ContextKind>("commessa");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);
  const choices = useQuery({
    queryKey: ["bank-context-choices", company, kind, debounced],
    queryFn: () =>
      bankRpc<BankTarget[]>("bank_context_choices", {
        p_company: company,
        p_kind: kind,
        p_search: debounced,
      }),
    staleTime: 30_000,
  });
  const totals = rows.reduce<Partial<Record<ContextKind, number>>>((a, c) => {
    a[c.kind] = (a[c.kind] ?? 0) + (leggiImporto(c.text) ?? 0);
    return a;
  }, {});
  const invalid =
    rows.some((r) => (leggiImporto(r.text) ?? 0) <= 0) ||
    Object.values(totals).some((n) => n > Math.abs(movement.amount) + 0.004);
  const change = (index: number, patch: Partial<Draft>) => {
    onDirty();
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };
  async function save() {
    setSaving(true);
    try {
      const next = await bankRpc<number>("bank_context_save", {
        p_company: company,
        p_tx: movement.id,
        p_revision: revision,
        p_rows: rows.map((r) => ({
          kind: r.kind,
          target_id: r.id,
          amount: leggiImporto(r.text),
          note: r.note ?? null,
        })),
      });
      onSaved(next);
      toast.success("Collegamenti salvati");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Collegamenti non salvati");
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="space-y-4 rounded-xl border p-4">
      <div>
        <h3 className="font-semibold">Commesse e altri riferimenti</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Ripartisci le quote per commessa, mezzo o destinatario. Questi
          riferimenti non registrano nuovi pagamenti o costi.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-[170px_1fr]">
        <label className="text-sm">
          Tipo
          <select
            aria-label="Tipo di collegamento"
            className="mt-1 h-10 w-full rounded-md border bg-background px-2"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as ContextKind);
              setSearch("");
            }}
          >
            {Object.entries(CONTEXT_LABELS)
              .filter(
                ([k]) =>
                  (canPersonnel || !["dipendente", "cedolino"].includes(k)) &&
                  (canMezzi || k !== "mezzo"),
              )
              .map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
          </select>
        </label>
        <label className="text-sm">
          Cerca un riferimento
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nome, codice commessa o mese del cedolino…"
            className="mt-1"
          />
        </label>
      </div>
      {choices.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Riferimenti non disponibili.{" "}
          <button onClick={() => void choices.refetch()} className="underline">
            Riprova
          </button>
        </p>
      ) : (
        <div className="max-h-40 overflow-auto rounded-md border">
          {choices.isFetching && (
            <p className="p-2 text-sm text-muted-foreground" role="status">
              Ricerca in corso…
            </p>
          )}
          {!choices.isFetching && choices.data?.length === 0 && (
            <p className="p-2 text-sm text-muted-foreground">
              Nessun riferimento disponibile con questi permessi.
            </p>
          )}
          {choices.data?.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={rows.some((r) => r.kind === c.kind && r.id === c.id)}
              onClick={() => {
                onDirty();
                const residual = Math.max(
                  0,
                  Math.abs(movement.amount) - (totals[kind] ?? 0),
                );
                setRows((rs) => [
                  ...rs,
                  {
                    ...c,
                    amount: residual,
                    text: residual.toFixed(2),
                    note: "",
                  },
                ]);
              }}
              className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted disabled:opacity-40"
            >
              <span>{c.label}</span>
              <Plus className="h-4 w-4 shrink-0" />
            </button>
          ))}
          {(choices.data?.length ?? 0) >= 30 && (
            <p className="p-2 text-xs text-muted-foreground">
              Primi 30 risultati: precisa la ricerca per trovare gli altri.
            </p>
          )}
        </div>
      )}
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div
            key={`${r.kind}:${r.id}`}
            className="rounded-lg border bg-muted/20 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  {CONTEXT_LABELS[r.kind]}
                </p>
                <p className="break-words text-sm font-medium">{r.label}</p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Rimuovi ${r.label}`}
                onClick={() => {
                  onDirty();
                  setRows((rs) => rs.filter((_, n) => n !== i));
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-[150px_1fr]">
              <Label className="text-xs">
                Quota ({movement.currency})
                <Input
                  aria-label={`Quota ${r.label}`}
                  inputMode="decimal"
                  value={r.text}
                  onChange={(e) => change(i, { text: e.target.value })}
                  className="mt-1"
                />
              </Label>
              <Label className="text-xs">
                Nota sul collegamento
                <Input
                  aria-label={`Nota ${r.label}`}
                  maxLength={1000}
                  value={r.note ?? ""}
                  onChange={(e) => change(i, { note: e.target.value })}
                  className="mt-1"
                />
              </Label>
            </div>
          </div>
        ))}
      </div>
      {Object.entries(totals).map(([k, n]) => (
        <p
          key={k}
          className={`text-xs ${n > Math.abs(movement.amount) + 0.004 ? "text-destructive" : "text-muted-foreground"}`}
        >
          {CONTEXT_LABELS[k as ContextKind]}: {money(n, "—", movement.currency)}{" "}
          su {money(Math.abs(movement.amount), "—", movement.currency)}
        </p>
      ))}
      <p className="text-xs text-muted-foreground">
        Le quote dello stesso tipo non possono superare il movimento. Una
        commessa e un dipendente possono descrivere lo stesso pagamento: le
        quote di tipi diversi non si sommano fra loro.
      </p>
      <Button onClick={() => void save()} disabled={saving || invalid}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salva
        collegamenti
      </Button>
    </section>
  );
}
