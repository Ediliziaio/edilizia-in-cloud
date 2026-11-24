import { useState } from "react";
import { format, parseISO, startOfMonth } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useViaggiRipartoCarburante } from "@/hooks/useMezziViaggi";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { ripartoCarburante } from "@/lib/mezzi/ripartoCarburante";
import { parseDecimalITStrict } from "@/lib/parseDecimalIT";
import { toast } from "sonner";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const formatoKm = new Intl.NumberFormat(intlCampo(), { maximumFractionDigits: 3 });
const formatKm = (metri: number) => formatoKm.format(metri / 1000);

export default function RipartoCarburanteDialog({ companyId, mezzoId, numero, dataFattura, quota, onClose, onFattura }: {
  companyId: string; mezzoId: string; numero: string; dataFattura: string; quota: number;
  onClose: () => void; onFattura: () => void;
}) {
  const t = useT();
  const [dal, setDal] = useState(() => format(startOfMonth(parseISO(dataFattura)), "yyyy-MM-dd"));
  const [al, setAl] = useState(dataFattura);
  const [importo, setImporto] = useState("");
  const [richiesta, setRichiesta] = useState<{ dal: string; al: string; centesimi: number } | null>(null);
  const valore = parseDecimalITStrict(importo) * 100;
  const centesimi = Math.round(valore);
  const dateValide = Boolean(dal && al && dal <= al && (Date.parse(al) - Date.parse(dal)) / 86_400_000 <= 366);
  const valido = dateValide && Number.isSafeInteger(centesimi) && Math.abs(valore - centesimi) < 0.000001 && centesimi !== 0 &&
    Math.sign(centesimi) === Math.sign(quota) && Math.abs(centesimi) <= Math.round(Math.abs(quota) * 100);
  const viaggi = useViaggiRipartoCarburante(companyId, mezzoId, richiesta);
  const corrente = richiesta?.dal === dal && richiesta?.al === al && richiesta.centesimi === centesimi;
  const riparto = corrente && viaggi.isSuccess && !viaggi.isFetching ? ripartoCarburante(viaggi.data, centesimi) : null;
  const ids = (riparto?.quote.flatMap(q => q.ordine ? [q.ordine] : []) ?? []).sort();
  const actor = useAuth().user?.id;
  const commesse = useQuery({
    queryKey: ["riparto-carburante-commesse", companyId, actor, ids],
    enabled: !!actor && ids.length > 0,
    queryFn: async ({ signal }) => {
      const nomi: Record<string, string> = {};
      for (let offset = 0; offset < ids.length; offset += 100) {
        const { data, error } = await supabase.from("orders").select("id,order_code,description")
          .eq("company_id", companyId).in("id", ids.slice(offset, offset + 100)).abortSignal(signal);
        if (error) throw error;
        for (const o of data ?? []) nomi[o.id] = [o.order_code, o.description].filter(Boolean).join(" · ");
      }
      return nomi;
    },
  });
  const righe = riparto?.quote.map(q => ({
    ...q, nome: q.ordine ? commesse.data?.[q.ordine] ?? "Commessa senza nome disponibile"
      : q.tipo === "generale" ? "Spostamenti generali" : "Destinazione da verificare",
  })) ?? [];

  const copia = async () => {
    const testo = righe.map(q => `${q.nome}\t${formatKm(q.metri)} km\t${formatCurrency(q.centesimi / 100)}`).join("\n");
    try {
      await navigator.clipboard.writeText(`Riparto carburante · Fattura ${numero} · ${dal} / ${al}\n${testo}`);
      toast.success(t("Proposta copiata"));
    } catch {
      toast.error(t("Impossibile copiare la proposta."));
    }
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{t("Riparto carburante")}</DialogTitle>
        <DialogDescription>{t("Fattura {numero} · Quota netta confermata per il mezzo {quota}", { numero: String(numero ?? ""), quota: formatCurrency(quota) })}</DialogDescription>
      </DialogHeader>
      <form className="space-y-3" onSubmit={e => {
        e.preventDefault();
        if (!valido) return;
        if (corrente) void viaggi.refetch();
        else setRichiesta({ dal, al, centesimi });
      }}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <label className="min-w-0 space-y-1 text-xs font-medium">{t("Rifornimenti dal")}
            <Input type="date" value={dal} onChange={e => setDal(e.target.value)} className="min-w-0" />
          </label>
          <label className="min-w-0 space-y-1 text-xs font-medium">{t("Rifornimenti al")}
            <Input type="date" value={al} onChange={e => setAl(e.target.value)} className="min-w-0" />
          </label>
          <label className="col-span-2 min-w-0 space-y-1 text-xs font-medium sm:col-span-1">{t("Solo carburante netto (€)")}
            <Input inputMode="decimal" value={importo} onChange={e => setImporto(e.target.value)} placeholder={t("Es. 120,00")} />
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-sm text-xs text-muted-foreground">{t("Verifica le date dei rifornimenti e inserisci l’importo delle sole righe carburante per questo mezzo.")}</p>
          <Button type="submit" size="sm" disabled={!valido || viaggi.isFetching}>{t("Calcola quote")}</Button>
        </div>
        {!valido && importo.trim() && <p className="text-xs text-muted-foreground">{t("Indica fino a due decimali, con lo stesso segno e con un importo entro la quota del mezzo. L’intervallo massimo è 366 giorni.")}</p>}
      </form>
      {corrente && viaggi.isFetching && <p role="status" className="text-sm text-muted-foreground">{t("Carico i viaggi del mezzo…")}</p>}
      {corrente && viaggi.isError && <p role="alert" className="text-sm text-destructive">{viaggi.error.message}</p>}
      {riparto && <section aria-label={t("Proposta di riparto")} className="space-y-2 rounded-lg border bg-muted/25 p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">{t("Proposta di riparto")}</h3>
          <span className="text-xs tabular-nums text-muted-foreground">{t("{metriTotali} km verificati", { metriTotali: formatKm(riparto.metriTotali) })}</span>
        </div>
        {righe.length > 0 ? <ul className="divide-y rounded-md border bg-background">
          {righe.map(q => <li key={q.chiave} className="flex flex-wrap items-baseline justify-between gap-x-3 px-2.5 py-2 text-sm">
            <span className="min-w-0 flex-1 basis-40 break-words">{q.nome}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{t("{metri} km", { metri: formatKm(q.metri) })}</span>
            <strong className="min-w-[5rem] text-right tabular-nums">{formatCurrency(q.centesimi / 100)}</strong>
          </li>)}
        </ul> : <p className="text-sm">{t("{valore} da attribuire. Il mezzo non ha km verificati in questo periodo.", { valore: formatCurrency(riparto.daRipartire / 100) })}</p>}
        <p className="text-xs text-muted-foreground">{t("Quota = imponibile carburante × km verificati della destinazione ÷ km verificati del mezzo nel periodo.")}</p>
        {(riparto.viaggiDaVerificare > 0 || riparto.tratteSenzaKm > 0) && <p role="status" className="text-xs text-amber-800 dark:text-amber-300">{t("Da controllare prima di imputare il costo. Viaggi in attesa di verifica: {viaggiDaVerificare}. Tratte senza km confermati: {tratteSenzaKm}.", { viaggiDaVerificare: String(riparto.viaggiDaVerificare ?? ""), tratteSenzaKm: String(riparto.tratteSenzaKm ?? "") })}</p>}
      </section>}
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose}>{t("Chiudi")}</Button>
        {righe.length > 0 && <Button size="sm" variant="outline" disabled={righe.some(q => q.ordine && !commesse.data?.[q.ordine])} onClick={() => void copia()}>{t("Copia proposta")}</Button>}
        {riparto && <Button size="sm" variant="secondary" onClick={onFattura}>{t("Apri fattura")}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
