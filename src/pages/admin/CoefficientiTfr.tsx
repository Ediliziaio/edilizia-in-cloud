/**
 * Coefficienti ISTAT di rivalutazione del TFR — UI super-admin.
 *
 * Il controllo di gestione rivaluta il fondo TFR di ogni azienda con questi
 * coefficienti (art. 2120 c.c.: 1,5% fisso + 75% dell'aumento dell'indice
 * FOI da dicembre a dicembre). Dicembre è il coefficiente dell'anno; finché
 * non esce, vale l'ultimo mese pubblicato, con la parte fissa per l'anno
 * intero (stima). L'ISTAT ne pubblica uno al mese, verso il 15 del mese dopo.
 *
 * Tabella condivisa da tutte le aziende (cg_tfr_coefficienti_istat): la
 * scrive solo il super-admin (regola sul database), la legge chiunque.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Percent, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { supabase } from "@/integrations/supabase/client";
import { coefficienteAnno, parseCoefficiente } from "@/lib/controlloGestione/coefficientiTfr";

interface Coefficiente {
  anno: number;
  mese: number;
  coefficiente_pct: number;
  fonte: string | null;
  updated_at: string;
}

const MESI = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

// La tabella non è nei tipi generati: un solo punto con il cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const fmt = (n: number) => new Intl.NumberFormat("it-IT", { minimumFractionDigits: 6, maximumFractionDigits: 6 }).format(n);

export default function CoefficientiTfr() {
  const { permissions } = useSuperAdminPermissions();
  const qc = useQueryClient();
  const oggi = new Date();
  // Di solito si inserisce il mese prima: quello che l'ISTAT ha appena pubblicato.
  const meseScorso = new Date(oggi.getFullYear(), oggi.getMonth() - 1, 1);
  const [form, setForm] = useState({
    anno: String(meseScorso.getFullYear()),
    mese: String(meseScorso.getMonth() + 1),
    coefficiente: "",
    fonte: "",
  });

  const q = useQuery({
    queryKey: ["admin", "tfr-coefficienti"],
    queryFn: async (): Promise<Coefficiente[]> => {
      const { data, error } = await db
        .from("cg_tfr_coefficienti_istat")
        .select("anno, mese, coefficiente_pct, fonte, updated_at")
        .order("anno", { ascending: false })
        .order("mese", { ascending: false })
        .limit(600);
      if (error) throw error;
      return (data ?? []) as Coefficiente[];
    },
  });

  const salva = useMutation({
    mutationFn: async (r: { anno: number; mese: number; coefficiente_pct: number; fonte: string | null }) => {
      const { error } = await db
        .from("cg_tfr_coefficienti_istat")
        .upsert({ ...r, updated_at: new Date().toISOString() }, { onConflict: "anno,mese" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "tfr-coefficienti"] });
      // Conto economico e Stato patrimoniale delle aziende si ricalcolano alla prossima lettura.
      qc.invalidateQueries({ queryKey: ["cg"] });
    },
  });

  const perAnno = useMemo(() => {
    const m = new Map<number, Coefficiente[]>();
    for (const r of q.data ?? []) m.set(r.anno, [...(m.get(r.anno) ?? []), r]);
    return [...m.entries()].sort((a, b) => b[0] - a[0]);
  }, [q.data]);

  if (!permissions.can_manage_companies) return <AccessDenied />;

  const handleSalva = async () => {
    const anno = Number(form.anno);
    const mese = Number(form.mese);
    const coeff = parseCoefficiente(form.coefficiente);
    if (!Number.isInteger(anno) || anno < 2000 || anno > 2100 || !Number.isInteger(mese) || mese < 1 || mese > 12) {
      toast.error("Anno o mese non validi");
      return;
    }
    if (coeff === null || coeff < 0 || coeff > 30) {
      toast.error("Coefficiente non valido", { description: "In percentuale, per esempio 4,285617." });
      return;
    }
    const esistente = (q.data ?? []).find((r) => r.anno === anno && r.mese === mese);
    try {
      await salva.mutateAsync({ anno, mese, coefficiente_pct: coeff, fonte: form.fonte.trim() || `ISTAT, indice FOI ${MESI[mese - 1]} ${anno}` });
      toast.success(esistente ? `Coefficiente di ${MESI[mese - 1]} ${anno} corretto` : `Coefficiente di ${MESI[mese - 1]} ${anno} salvato`);
      setForm((f) => ({ ...f, coefficiente: "", fonte: "" }));
    } catch (e) {
      toast.error("Non salvato", { description: e instanceof Error ? e.message : "Riprova." });
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Percent className="h-5 w-5" /> Coefficienti di rivalutazione del TFR
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Il controllo di gestione rivaluta il fondo TFR di ogni azienda con questi coefficienti (art. 2120 c.c.: 1,5%
          fisso più il 75% dell'aumento dell'indice ISTAT dei prezzi FOI rispetto a dicembre dell'anno prima). L'ISTAT
          ne pubblica uno al mese, verso il 15 del mese dopo: inseriscilo qui appena esce. Dicembre è il coefficiente
          dell'anno; finché manca, l'anno si stima dall'ultimo mese inserito.
        </p>
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Inserisci o correggi un mese</CardTitle>
          <CardDescription>
            Il coefficiente in percentuale, come lo pubblica l'ISTAT (per esempio 4,285617 per settembre 2026). Se il
            mese c'è già, il valore si sostituisce.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div>
              <Label className="text-xs" htmlFor="coef-anno">Anno</Label>
              <Input id="coef-anno" inputMode="numeric" value={form.anno} onChange={(e) => setForm((f) => ({ ...f, anno: e.target.value }))} />
            </div>
            <div className="lg:col-span-1">
              <Label className="text-xs">Mese</Label>
              <Select value={form.mese} onValueChange={(v) => setForm((f) => ({ ...f, mese: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESI.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs" htmlFor="coef-valore">Coefficiente (%)</Label>
              <Input id="coef-valore" inputMode="decimal" placeholder="es. 4,285617" value={form.coefficiente}
                onChange={(e) => setForm((f) => ({ ...f, coefficiente: e.target.value }))} />
            </div>
            <div className="sm:col-span-2 lg:col-span-2">
              <Label className="text-xs" htmlFor="coef-fonte">Fonte (facoltativa)</Label>
              <Input id="coef-fonte" placeholder="es. comunicato ISTAT del 16/10/2026" value={form.fonte}
                onChange={(e) => setForm((f) => ({ ...f, fonte: e.target.value }))} />
            </div>
            <div className="flex items-end">
              <Button size="sm" className="gap-1.5" onClick={handleSalva} disabled={salva.isPending}>
                {salva.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salva
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {q.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Caricamento…</div>
      ) : q.error ? (
        <p className="text-sm text-destructive">Coefficienti non caricati: {q.error instanceof Error ? q.error.message : "errore"}</p>
      ) : perAnno.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessun coefficiente inserito: la rivalutazione usa solo l'1,5% fisso.</p>
      ) : (
        perAnno.map(([anno, righe]) => {
          const usato = coefficienteAnno(righe);
          return (
            <Card key={anno} className="rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {anno}
                  <span className="text-sm font-normal text-muted-foreground">
                    coefficiente dell'anno usato: {fmt(usato.valore)}%
                  </span>
                  {usato.stimato ? (
                    <Badge variant="outline">stimato da {usato.mese ? MESI[usato.mese - 1] : "1,5% fisso"}</Badge>
                  ) : (
                    <Badge variant="secondary">definitivo</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mese</TableHead>
                      <TableHead className="text-right">Coefficiente</TableHead>
                      <TableHead>Fonte</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {righe.map((r) => (
                      <TableRow key={`${r.anno}-${r.mese}`}>
                        <TableCell className="capitalize">{MESI[r.mese - 1]}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(r.coefficiente_pct)}%</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.fonte ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
