/**
 * TabConfigurazione — editor della classificazione voci di costo/ricavo.
 *
 * Permette al consulente / imprenditore di:
 *  - rinominare ogni voce (voce_descrizione)
 *  - cambiarne la macro_voce (es. spostare "marketing" da costi_amm a costi_comm)
 *  - cambiarne il tipo F/V/Z (impatta direttamente il calcolo del BEP)
 *  - attivare/disattivare la voce dal CE
 *  - bootstrap iniziale (45 voci default) se la lista è vuota
 *
 * Cambiamenti invalidano automaticamente la query del CE riclassificato
 * (gli importi vengono ricalcolati al successivo render).
 */

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Search, Loader2 } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  useClassificazioneVoci,
  useUpdateClassificazione,
  useBootstrapClassificazione,
  MACRO_VOCE_LABELS,
  TIPO_LABELS,
  SOURCE_LABELS,
  type ClassificazioneVoce,
  type MacroVoce,
  type ClassTipo,
} from "@/hooks/controlloGestione/useClassificazioneVoci";
import { EmptyState } from "@/components/controllo-gestione/ui/EmptyState";
import { NotePanel } from "@/components/controllo-gestione/ui/NotePanel";
import { AliquoteEditor } from "@/components/controllo-gestione/ui/AliquoteEditor";
import { ErrorBlock } from "@/components/controllo-gestione/ui/ErrorBlock";
import { cn } from "@/lib/utils";
import { categoriaLeggibile } from "@/lib/controlloGestione/formatCG";

interface TabConfigurazioneProps {
  anno?: number;
}

export function TabConfigurazione({ anno }: TabConfigurazioneProps = {}) {
  const list = useClassificazioneVoci();
  const annoCurrent = anno ?? new Date().getFullYear();
  const update = useUpdateClassificazione();
  const bootstrap = useBootstrapClassificazione();
  const [search, setSearch] = useState("");
  const [macroFilter, setMacroFilter] = useState<MacroVoce | "all">("all");
  const [tipoFilter, setTipoFilter] = useState<ClassTipo | "all">("all");

  const filtered = useMemo(() => {
    const data = list.data ?? [];
    return data.filter((v) => {
      if (macroFilter !== "all" && v.macro_voce !== macroFilter) return false;
      if (tipoFilter !== "all" && v.tipo !== tipoFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          v.voce_descrizione.toLowerCase().includes(q) ||
          v.voce_chiave.toLowerCase().includes(q) ||
          (v.source_value ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [list.data, search, macroFilter, tipoFilter]);

  if (list.isLoading) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="space-y-2 p-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }
  if (list.isError) return <ErrorBlock onRetry={() => list.refetch()} />;

  if (!list.data || list.data.length === 0) {
    return (
      <EmptyState
        title="Nessuna voce di classificazione"
        description="Carica le 45 voci di costo e ricavo già pronte per un'impresa edile, poi cambiale come preferisci."
        ctaLabel={bootstrap.isPending ? "Caricamento…" : "Carica le voci standard"}
        onCta={bootstrap.isPending ? undefined : () => bootstrap.mutate()}
        icon={
          bootstrap.isPending ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Sparkles className="h-6 w-6 text-orange-500" />
          )
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Come si leggono i costi nel conto economico</CardTitle>
          <p className="text-sm text-muted-foreground">
            Ogni categoria di spesa va in una voce del conto economico. Il tipo dice se è un costo
            fisso (c'è anche senza lavoro), variabile (cresce con i cantieri) o straordinario: serve
            al calcolo del punto di pareggio.
          </p>
          <p className="text-xs text-muted-foreground">
            La stessa spesa può comparire con due provenienze (un costo registrato e il bonifico in
            banca): il conto economico conta il bonifico solo se non è già collegato a quel costo o
            a una scadenza. Se ci sono cedolini, il costo del personale viene dai cedolini e le
            altre voci «Costo del personale» non si sommano.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Toolbar filtri */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca voce o categoria…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={macroFilter} onValueChange={(v) => setMacroFilter(v as MacroVoce | "all")}>
              <SelectTrigger className="md:w-56" aria-label="Voce del conto economico"><SelectValue placeholder="Tutte le voci" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le voci</SelectItem>
                {(Object.keys(MACRO_VOCE_LABELS) as MacroVoce[]).map((mv) => (
                  <SelectItem key={mv} value={mv}>{MACRO_VOCE_LABELS[mv]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={tipoFilter} onValueChange={(v) => setTipoFilter(v as ClassTipo | "all")}>
              <SelectTrigger className="md:w-40" aria-label="Tipo di costo"><SelectValue placeholder="Tutti i tipi" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i tipi</SelectItem>
                <SelectItem value="F">F — Fissa</SelectItem>
                <SelectItem value="V">V — Variabile</SelectItem>
                <SelectItem value="Z">Z — Extra</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              disabled={bootstrap.isPending}
              onClick={() => bootstrap.mutate()}
            >
              {bootstrap.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              <span className="ml-1.5">Aggiungi le voci standard</span>
            </Button>
          </div>

          {/* Tabella */}
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[30%]">Nome</TableHead>
                  <TableHead className="w-[24%]">Voce del conto economico</TableHead>
                  <TableHead className="w-[16%]">Tipo</TableHead>
                  <TableHead className="w-[18%]">Da dove arriva</TableHead>
                  <TableHead className="w-[8%] text-center">Attiva</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      Nessuna voce corrisponde ai filtri.
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((v) => (
                  <ClassificazioneRow key={v.id} voce={v} onPatch={(patch) => update.mutate({ id: v.id, patch })} />
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <NotePanel anno={annoCurrent} />
      <AliquoteEditor />
    </div>
  );
}

interface RowProps {
  voce: ClassificazioneVoce;
  onPatch: (patch: Partial<ClassificazioneVoce>) => void;
}

function ClassificazioneRow({ voce, onPatch }: RowProps) {
  const [name, setName] = useState(voce.voce_descrizione);
  const dirty = name !== voce.voce_descrizione;

  return (
    <TableRow className={cn(!voce.is_active && "opacity-50")}>
      <TableCell>
        <div className="flex items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => dirty && onPatch({ voce_descrizione: name })}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setName(voce.voce_descrizione);
            }}
            className={cn("h-8 text-sm", dirty && "border-orange-400")}
          />
        </div>
        {/* Il nome tecnico (es. «salari_stipendi_cc») solo nel tooltip. */}
        <p
          className="mt-1 text-[11px] text-muted-foreground"
          title={`Codice: ${voce.voce_chiave}${voce.source_value ? ` · categoria salvata: ${voce.source_value}` : ""}`}
        >
          {voce.source_value ? <>Categoria «{categoriaLeggibile(voce.source_value)}»</> : "Senza categoria"}
        </p>
      </TableCell>
      <TableCell>
        <Select value={voce.macro_voce} onValueChange={(v) => onPatch({ macro_voce: v as MacroVoce })}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(MACRO_VOCE_LABELS) as MacroVoce[]).map((mv) => (
              <SelectItem key={mv} value={mv} className="text-xs">{MACRO_VOCE_LABELS[mv]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Select value={voce.tipo} onValueChange={(v) => onPatch({ tipo: v as ClassTipo })}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="F">F — {TIPO_LABELS.F}</SelectItem>
            <SelectItem value="V">V — {TIPO_LABELS.V}</SelectItem>
            <SelectItem value="Z">Z — {TIPO_LABELS.Z}</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="text-[11px] font-normal">
          {SOURCE_LABELS[voce.source_table] ?? voce.source_table}
        </Badge>
      </TableCell>
      <TableCell className="text-center">
        <Switch
          checked={voce.is_active}
          onCheckedChange={(checked) => onPatch({ is_active: checked })}
        />
      </TableCell>
    </TableRow>
  );
}
