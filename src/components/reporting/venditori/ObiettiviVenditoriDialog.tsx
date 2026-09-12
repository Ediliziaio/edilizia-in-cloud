import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Target, Save, Loader2 } from "lucide-react";
import { addMonths, format } from "date-fns";
import { it } from "date-fns/locale";
import { useObiettiviDelMese, useSalvaObiettivi, type ObiettivoMese } from "@/hooks/useObiettiviVenditori";

/*
 * Gli obiettivi del mese, uno per venditore: quanto deve fatturare e quanti
 * contratti deve chiudere. Si confrontano con le opportunità vinte nel mese,
 * la stessa regola del resto del report.
 *
 * Prima esisteva una finestra «Target Settimanali» nella dashboard marketing
 * che scriveva una riga per persona senza mese: un obiettivo solo, per sempre.
 */

interface Venditore {
  id: string;
  nome: string;
}

const MESI_INTORNO = 6;

export function ObiettiviVenditoriDialog({
  aperto,
  onCambiaApertura,
  venditori,
}: {
  aperto: boolean;
  onCambiaApertura: (v: boolean) => void;
  venditori: Venditore[];
}) {
  const oggi = new Date();
  const mesiScelta = useMemo(
    () =>
      Array.from({ length: MESI_INTORNO * 2 + 1 }, (_, i) => addMonths(oggi, i - MESI_INTORNO)).map((d) => ({
        chiave: `${d.getFullYear()}-${d.getMonth() + 1}`,
        anno: d.getFullYear(),
        mese: d.getMonth() + 1,
        etichetta: format(d, "MMMM yyyy", { locale: it }),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [oggi.getFullYear(), oggi.getMonth()],
  );
  const [scelto, setScelto] = useState(`${oggi.getFullYear()}-${oggi.getMonth() + 1}`);
  const mese = mesiScelta.find((m) => m.chiave === scelto) ?? mesiScelta[MESI_INTORNO];

  const { data: obiettivi = [], isLoading } = useObiettiviDelMese(mese.anno, mese.mese, aperto);
  const salva = useSalvaObiettivi();
  const [righe, setRighe] = useState<Record<string, { fatturato: string; contratti: string }>>({});

  useEffect(() => {
    if (!aperto) return;
    const per = new Map(obiettivi.map((o) => [o.user_id, o]));
    setRighe(
      Object.fromEntries(
        venditori.map((v) => {
          const o = per.get(v.id);
          return [v.id, { fatturato: o?.fatturato ? String(o.fatturato) : "", contratti: o?.contratti ? String(o.contratti) : "" }];
        }),
      ),
    );
  }, [aperto, obiettivi, venditori]);

  const cambia = (id: string, campo: "fatturato" | "contratti", valore: string) =>
    setRighe((prec) => ({ ...prec, [id]: { ...prec[id], [campo]: valore } }));

  const onSalva = async () => {
    const daSalvare: ObiettivoMese[] = venditori.map((v) => ({
      user_id: v.id,
      anno: mese.anno,
      mese: mese.mese,
      fatturato: Math.max(0, Number(righe[v.id]?.fatturato) || 0),
      contratti: Math.max(0, Math.round(Number(righe[v.id]?.contratti) || 0)),
    }));
    await salva.mutateAsync({ anno: mese.anno, mese: mese.mese, righe: daSalvare });
    onCambiaApertura(false);
  };

  return (
    <Dialog open={aperto} onOpenChange={onCambiaApertura}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Obiettivi del mese
          </DialogTitle>
          <DialogDescription>
            Fatturato e contratti che ogni venditore deve chiudere nel mese. Si confrontano con le opportunità vinte
            nello stesso mese; lasciare vuoto vuol dire «nessun obiettivo».
          </DialogDescription>
        </DialogHeader>

        <Select value={scelto} onValueChange={setScelto}>
          <SelectTrigger className="w-[220px]" aria-label="Mese">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {mesiScelta.map((m) => (
              <SelectItem key={m.chiave} value={m.chiave}>{m.etichetta}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : venditori.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nessun venditore con opportunità o appuntamenti nel periodo.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_120px_100px] gap-2 px-1 text-xs font-medium text-muted-foreground">
              <span>Venditore</span>
              <span className="text-right">Fatturato €</span>
              <span className="text-right">Contratti</span>
            </div>
            {venditori.map((v) => (
              <div key={v.id} className="grid grid-cols-[1fr_120px_100px] items-center gap-2">
                <span className="truncate text-sm font-medium">{v.nome}</span>
                <Input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={righe[v.id]?.fatturato ?? ""}
                  onChange={(e) => cambia(v.id, "fatturato", e.target.value)}
                  className="h-8 text-right text-sm"
                  placeholder="—"
                  aria-label={`Fatturato obiettivo di ${v.nome}`}
                />
                <Input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={righe[v.id]?.contratti ?? ""}
                  onChange={(e) => cambia(v.id, "contratti", e.target.value)}
                  className="h-8 text-right text-sm"
                  placeholder="—"
                  aria-label={`Contratti obiettivo di ${v.nome}`}
                />
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onCambiaApertura(false)}>Annulla</Button>
          <Button onClick={onSalva} disabled={salva.isPending || isLoading}>
            {salva.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
