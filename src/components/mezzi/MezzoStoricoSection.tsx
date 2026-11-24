/**
 * Storico del mezzo: chi l'ha avuto e su quale cantiere, periodo per periodo.
 * I periodi li scrive il database a ogni cambio di assegnazione; quelli di
 * prima di usare l'app si aggiungono a mano. In cima: chi aveva il mezzo un
 * certo giorno, per le multe.
 */
import { useMemo, useState } from "react";
import { History, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { OrderSelectCombobox } from "@/components/warehouse/OrderSelectCombobox";
import { useAllHrProfili } from "@/hooks/useOrganigramma";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useEliminaPeriodo, useMezzoAssegnazioni, useSalvaPeriodo, type PeriodoConNomi } from "@/hooks/useMezzi";
import { formatData, giornoItaliano, oggiIso, periodiDelGiorno } from "@/types/mezzi";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const NESSUNO = "__nessuno__";

function descriviPeriodo(p: PeriodoConNomi, t: ReturnType<typeof useT>): string {
  const parti = [p.persona, p.commessa ? t("cantiere {commessa}", { commessa: p.commessa }) : null, p.su_mezzo_nome ? t("su {mezzo}", { mezzo: p.su_mezzo_nome }) : null];
  return parti.filter(Boolean).join(" · ") || t("Nessuno");
}

interface Props {
  mezzoId: string;
  puoModificare: boolean;
}

export function MezzoStoricoSection({ mezzoId, puoModificare }: Props) {
  const t = useT();
  const companyId = useEffectiveCompanyId();
  const { data: periodi = [], isLoading, error, refetch } = useMezzoAssegnazioni(mezzoId);
  const { data: profili = [] } = useAllHrProfili();
  const salva = useSalvaPeriodo(mezzoId);
  const elimina = useEliminaPeriodo();

  const [giorno, setGiorno] = useState("");
  const [aperto, setAperto] = useState(false);
  const [persona, setPersona] = useState<string | null>(null);
  const [commessa, setCommessa] = useState<string | null>(null);
  const [dal, setDal] = useState("");
  const [al, setAl] = useState("");
  const [note, setNote] = useState("");
  const [daEliminare, setDaEliminare] = useState<PeriodoConNomi | null>(null);

  const trovati = useMemo(() => (giorno ? periodiDelGiorno(periodi, giorno) : []), [periodi, giorno]);

  const nuovo = () => {
    setPersona(null);
    setCommessa(null);
    setDal("");
    setAl("");
    setNote("");
    setAperto(true);
  };

  const datiValidi = !!dal && !!al && al >= dal && al <= oggiIso() && (!!persona || !!commessa);

  const salvaPeriodo = async () => {
    try {
      await salva.mutateAsync({
        hr_profilo_id: persona,
        order_id: commessa,
        // Da inizio a fine giornata, in ora locale (italiana per chi usa l'app).
        dal: new Date(`${dal}T00:00:00`).toISOString(),
        al: new Date(`${al}T23:59:59`).toISOString(),
        note: note.trim() || null,
      });
      setAperto(false);
    } catch {
      // l'errore lo mostra la mutation
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4">
        <Label htmlFor="storico-giorno" className="text-sm font-medium">{t("Chi aveva il mezzo il giorno…")}</Label>
        <p className="text-xs text-muted-foreground">{t("Per esempio la data di una multa.")}</p>
        <div className="mt-2 flex items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="storico-giorno" type="date" value={giorno} max={oggiIso()} onChange={(e) => setGiorno(e.target.value)} className="pl-9" />
          </div>
          {giorno && (
            <Button variant="ghost" size="icon" onClick={() => setGiorno("")} aria-label={t("Cancella la data")}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        {giorno && (
          <div className="mt-3 text-sm" aria-live="polite">
            {trovati.length === 0 ? (
              <p className="text-muted-foreground">{t("Il {giorno} il mezzo non risulta assegnato a nessuno.", { giorno: formatData(giorno) })}</p>
            ) : (
              <ul className="space-y-1">
                {trovati.map((p) => (
                  <li key={p.id} className="font-medium">
                    {descriviPeriodo(p, t)}
                    <span className="font-normal text-muted-foreground">
                      {" "}({p.al ? t("dal {dal} al {al}", { dal: formatData(giornoItaliano(p.dal)), al: formatData(giornoItaliano(p.al)) }) : t("dal {dal}, ancora adesso", { dal: formatData(giornoItaliano(p.dal)) })})
                    </span>
                  </li>
                ))}
                {trovati.length > 1 && (
                  <li className="text-xs text-muted-foreground">{t("Quel giorno il mezzo è passato di mano: controlla l'ora.")}</li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("Ogni cambio di persona o di cantiere si segna da solo.")}</p>
        {puoModificare && (
          <Button size="sm" variant="outline" onClick={nuovo} className="shrink-0">
            <Plus className="mr-1 h-4 w-4" />{t("Periodo passato")}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {t("Non riesco a caricare lo storico.")}{" "}
          <button type="button" className="font-semibold underline" onClick={() => refetch()}>{t("Riprova")}</button>
        </div>
      ) : periodi.length === 0 ? (
        <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
          <History className="mx-auto mb-2 h-8 w-8 opacity-40" />
          {t("Ancora nessun periodo: si aggiunge da solo quando assegni il mezzo a una persona o a un cantiere.")}
        </div>
      ) : (
        <ol className="relative space-y-2 border-l border-slate-200 pl-4">
          {periodi.map((p) => (
            <li key={p.id} className="relative rounded-xl border bg-card p-3">
              <span
                className={`absolute -left-[1.4rem] top-4 h-2.5 w-2.5 rounded-full ${p.al ? "bg-slate-300" : "bg-emerald-500"}`}
                aria-hidden="true"
              />
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{descriviPeriodo(p, t)}</span>
                    {!p.al && <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[11px] text-emerald-700">{t("Adesso")}</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("Dal")} {formatData(giornoItaliano(p.dal))}{p.al ? t(" al {valore}", { valore: formatData(giornoItaliano(p.al)) }) : ""}
                    {p.note ? ` · ${p.note}` : ""}
                  </p>
                </div>
                {puoModificare && p.al && (
                  <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0 text-destructive" onClick={() => setDaEliminare(p)} aria-label={t("Elimina il periodo")}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      <Dialog open={aperto} onOpenChange={setAperto}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("Periodo passato")}</DialogTitle>
            <DialogDescription>{t("Per ricostruire chi aveva il mezzo prima di usare l'app.")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="periodo-persona">{t("Persona")}</Label>
              <Select value={persona ?? NESSUNO} onValueChange={(v) => setPersona(v === NESSUNO ? null : v)}>
                <SelectTrigger id="periodo-persona"><SelectValue placeholder={t("Nessuno")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NESSUNO}>{t("Nessuno")}</SelectItem>
                  {profili.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{[p.cognome, p.nome].filter(Boolean).join(" ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("Cantiere (commessa)")}</Label>
              <OrderSelectCombobox
                companyId={companyId ?? undefined}
                value={commessa ?? undefined}
                onChange={(id) => setCommessa(id)}
                placeholder={t("Nessun cantiere")}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="periodo-dal">{t("Dal")}</Label>
                <Input id="periodo-dal" type="date" value={dal} max={oggiIso()} onChange={(e) => setDal(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="periodo-al">{t("Al")}</Label>
                <Input id="periodo-al" type="date" value={al} max={oggiIso()} onChange={(e) => setAl(e.target.value)} />
              </div>
            </div>
            {dal && al && al < dal && <p className="text-sm text-red-700">{t("La fine viene prima dell'inizio: controlla le date.")}</p>}
            {!persona && !commessa && <p className="text-xs text-muted-foreground">{t("Scegli almeno una persona o un cantiere.")}</p>}
            <div className="space-y-1.5">
              <Label htmlFor="periodo-note">{t("Note")}</Label>
              <Textarea id="periodo-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAperto(false)}>{t("Annulla")}</Button>
            <Button onClick={salvaPeriodo} disabled={!datiValidi || salva.isPending}>
              {salva.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("Salva")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!daEliminare} onOpenChange={(o) => !o && setDaEliminare(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Eliminare il periodo?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {daEliminare ? t("{periodo}, dal {data}", { periodo: descriviPeriodo(daEliminare, t), data: formatData(giornoItaliano(daEliminare.dal)) }) : ""}{". "}{t("Serve solo per correggere uno storico sbagliato.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Annulla")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => daEliminare && elimina.mutate(daEliminare.id)}
            >
              {t("Elimina")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
