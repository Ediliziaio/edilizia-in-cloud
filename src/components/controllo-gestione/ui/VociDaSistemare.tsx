/**
 * Le categorie di spesa che non hanno ancora una voce del conto economico.
 *
 * Dalla più costosa: è da quella che conviene partire. Alcune è giusto che
 * restino fuori — l'acquisto di un terreno o di un immobile non è un costo
 * dell'anno, è un investimento — e il testo lo dice, invece di spingere a
 * classificare tutto.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { OfficeSelect } from "@/components/orders/OfficeSelect";
import { formatCurrency } from "@/lib/formatters";
import { CheckCircle2 } from "lucide-react";
import {
  MACRO_VOCE_LABELS,
  SOURCE_LABELS,
  TIPO_LABELS,
  useClassificaVoce,
  useVociNonClassificate,
  type ClassTipo,
  type MacroVoce,
} from "@/hooks/controlloGestione/useClassificazioneVoci";

/** Le voci di costo: le entrate non si classificano da qui. */
const MACRO_COSTO: MacroVoce[] = [
  "acquisti_materie",
  "costi_produttivi",
  "costo_personale",
  "costi_commerciali",
  "costi_amministrativi",
  "ammortamenti",
  "oneri_tributari",
  "oneri_finanziari",
  "costi_extra",
];

/** Suggerimento di tipo: chi non sa che scegliere parte da qui. */
function tipoSuggerito(macro: MacroVoce): ClassTipo {
  if (macro === "acquisti_materie") return "V";
  if (macro === "costi_extra") return "Z";
  return "F";
}

interface VociDaSistemareProps {
  anno: number;
}

export function VociDaSistemare({ anno }: VociDaSistemareProps) {
  const lista = useVociNonClassificate(anno);
  const classifica = useClassificaVoce();
  const [scelte, setScelte] = useState<Record<string, { macro?: MacroVoce; tipo?: ClassTipo }>>({});

  if (lista.isLoading) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="space-y-2 p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }
  // Se la lettura non riesce (RPC non ancora in produzione) la sezione tace:
  // è un aiuto, non una parte indispensabile della pagina.
  if (lista.isError) return null;

  const voci = lista.data ?? [];
  if (voci.length === 0) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="flex items-center gap-3 p-4 text-sm">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <span>
            Tutte le categorie di spesa del {anno} hanno una voce del conto economico.
          </span>
        </CardContent>
      </Card>
    );
  }

  const totale = voci.reduce((s, v) => s + Number(v.euro ?? 0), 0);

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Categorie da sistemare — {formatCurrency(totale)} nel {anno}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Queste spese finiscono nella riga «Costi non classificati»: nel margine ci sono, ma non
          si vede dove vanno. Dalla più costosa: sistema le prime e lascia stare la coda.
        </p>
        <p className="text-xs text-muted-foreground">
          Non tutto va classificato. L'acquisto di un terreno o di un immobile non è un costo
          dell'anno ma un investimento: lascialo qui, e comparirà nello stato patrimoniale quando
          lo registri tra i cespiti.
        </p>
      </CardHeader>
      <CardContent>
        <div className="rounded-xl border">
          <Table wrapperClassName="max-h-[28rem]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[26%]">Categoria</TableHead>
                <TableHead className="w-[14%]">Da dove arriva</TableHead>
                <TableHead className="w-[10%] text-right">Spese</TableHead>
                <TableHead className="w-[14%] text-right">Importo</TableHead>
                <TableHead className="w-[22%]">Voce del conto economico</TableHead>
                <TableHead className="w-[14%]">Tipo</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {voci.map((v) => {
                const id = `${v.source_table}|${v.source_value}`;
                const scelta = scelte[id] ?? {};
                const macro = scelta.macro;
                const tipo = scelta.tipo ?? (macro ? tipoSuggerito(macro) : undefined);
                return (
                  <TableRow key={id}>
                    <TableCell className="font-medium">{v.source_value}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal">
                        {SOURCE_LABELS[v.source_table] ?? v.source_table}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{v.righe}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(Number(v.euro ?? 0))}
                    </TableCell>
                    <TableCell>
                      <OfficeSelect
                        label={`Voce per ${v.source_value}`}
                        id={`macro-${id}`}
                        value={macro ?? ""}
                        placeholder="Scegli la voce"
                        onValueChange={(next) =>
                          setScelte((s) => ({
                            ...s,
                            [id]: { macro: (next || undefined) as MacroVoce | undefined, tipo: undefined },
                          }))
                        }
                        options={MACRO_COSTO.map((mv) => ({
                          value: mv,
                          label: MACRO_VOCE_LABELS[mv],
                        }))}
                      />
                    </TableCell>
                    <TableCell>
                      <OfficeSelect
                        label={`Tipo per ${v.source_value}`}
                        id={`tipo-${id}`}
                        value={tipo ?? ""}
                        placeholder="Tipo"
                        disabled={!macro}
                        onValueChange={(next) =>
                          setScelte((s) => ({
                            ...s,
                            [id]: { macro, tipo: (next || undefined) as ClassTipo | undefined },
                          }))
                        }
                        options={(["F", "V", "Z"] as ClassTipo[]).map((t) => ({
                          value: t,
                          label: TIPO_LABELS[t],
                        }))}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!macro || !tipo || classifica.isPending}
                        onClick={() => {
                          if (!macro || !tipo) return;
                          classifica.mutate({
                            sourceTable: v.source_table,
                            sourceValue: v.source_value,
                            macroVoce: macro,
                            tipo,
                          });
                        }}
                      >
                        Classifica
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
