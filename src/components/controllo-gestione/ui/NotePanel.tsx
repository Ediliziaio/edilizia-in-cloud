/**
 * NotePanel — pannello per gestire note esplicative del controller
 * su qualsiasi voce dei prospetti CG.
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { messaggioErrore } from "@/lib/controlloGestione/formatCG";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useNoteVoci, useUpsertNotaVoce, useDeleteNotaVoce, type NoteScope,
} from "@/hooks/controlloGestione/useNoteVoci";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/formatters";
import { Plus, Trash2, FileText } from "lucide-react";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const SCOPES: { value: NoteScope; label: string }[] = [
  { value: "CE",       label: "Conto Economico" },
  { value: "SP",       label: "Stato Patrimoniale" },
  { value: "PFN",      label: "PFN" },
  { value: "CASHFLOW", label: "Cash Flow" },
  { value: "BUDGET",   label: "Budget" },
  { value: "PIANO",    label: "Piano industriale" },
];

interface Props {
  anno: number;
}

export function NotePanel({ anno }: Props) {
  const tr = useT();
  const [scope, setScope] = useState<NoteScope>("CE");
  const q = useNoteVoci(anno, scope);
  const upsert = useUpsertNotaVoce();
  const del = useDeleteNotaVoce();
  const { toast } = useToast();
  const [codice, setCodice] = useState("");
  const [contenuto, setContenuto] = useState("");

  const handleAdd = async () => {
    const c = codice.trim();
    const t = contenuto.trim();
    if (!c || !t) {
      toast({
        title: tr("Dati mancanti"),
        description: tr("Codice voce e contenuto obbligatori."),
        variant: "destructive",
      });
      return;
    }
    try {
      await upsert.mutateAsync({ anno, scope, codice_voce: c, contenuto: t });
      setCodice("");
      setContenuto("");
      toast({ title: tr("Nota salvata") });
    } catch (e) {
      toast({ title: tr("Errore"), description: messaggioErrore(e), variant: "destructive" });
    }
  };

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4" /> {tr("Note esplicative")}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {tr("Appunti del controller su voci specifiche dei prospetti. Vengono incluse nei pacchetti banca.")}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <div>
            <Label className="text-xs">{tr("Prospetto")}</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as NoteScope)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SCOPES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{tr(s.label)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{tr("Codice voce")}</Label>
            <Input
              value={codice}
              onChange={(e) => setCodice(e.target.value)}
              placeholder={tr("es. 06 (per Costo personale)")}
            />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">{tr("Nota")}</Label>
            <Textarea
              rows={2}
              value={contenuto}
              onChange={(e) => setContenuto(e.target.value)}
              placeholder={tr("es. Aumento dovuto ad assunzione capocantiere a marzo")}
            />
          </div>
        </div>
        <Button
          size="sm"
          disabled={upsert.isPending}
          onClick={handleAdd}
        >
          <Plus className="mr-2 h-4 w-4" /> {tr("Aggiungi nota")}
        </Button>

        {/* Lista note esistenti */}
        <div className="border-t pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tr("Note esistenti per {label} · {anno}", { label: tr(SCOPES.find((s) => s.value === scope)?.label ?? ""), anno })}</p>
          {q.isLoading && <Skeleton className="h-20 w-full" />}
          {q.data && q.data.length === 0 && (
            <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
              {tr("Nessuna nota.")}
            </p>
          )}
          {q.data && q.data.length > 0 && (
            <ul className="space-y-2">
              {q.data.map((n) => (
                <li
                  key={n.id}
                  className="flex items-start gap-3 rounded-xl border p-3 text-sm"
                >
                  <Badge variant="outline" className="shrink-0 font-mono">
                    {n.codice_voce}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p>{n.contenuto}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{tr("Aggiornata il {updated_at}", { updated_at: formatDate(n.updated_at) })}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={tr("Elimina nota")}
                    onClick={async () => {
                      try {
                        await del.mutateAsync(n.id);
                        toast({ title: tr("Nota eliminata") });
                      } catch (e) {
                        toast({ title: tr("Errore"), description: messaggioErrore(e), variant: "destructive" });
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
