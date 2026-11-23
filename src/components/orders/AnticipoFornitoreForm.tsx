import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { importoPagamento } from "@/lib/orders/expensePayments";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";

type Disponibilita = {
  anticipi: { id: string; descrizione: string; data: string; residuo: number }[];
  conti: { id: string; nome: string }[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function AnticipoFornitoreForm({ costId, residuo, onClose }: {
  costId: string; residuo: number; onClose: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [anticipoId, setAnticipoId] = useState("");
  const [contoId, setContoId] = useState("");
  const [testoImporto, setTestoImporto] = useState("");
  const [stessoFornitore, setStessoFornitore] = useState(false);
  const [richiesta, setRichiesta] = useState(() => crypto.randomUUID());
  const q = useQuery({
    queryKey: ["anticipi-fornitore", costId],
    queryFn: async (): Promise<Disponibilita> => {
      const { data, error } = await db.rpc("costo_anticipi_disponibili", { p_costo: costId });
      if (error) throw new Error(error.message);
      return data;
    },
  });
  const anticipo = q.data?.anticipi.find((a) => a.id === anticipoId);
  const importo = importoPagamento(testoImporto);
  const conto = contoId || (q.data?.conti.length === 1 ? q.data.conti[0].id : "");
  const registra = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("compensa_costo_con_anticipo", {
        p_costo: costId, p_anticipo: anticipoId, p_debito: conto, p_importo: importo, p_richiesta: richiesta,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void refreshFinancialQueries(qc);
      void qc.invalidateQueries({ queryKey: ["anticipi-fornitore"] });
      void qc.invalidateQueries({ queryKey: ["cg"] });
      toast.success(t("Anticipo compensato e residuo aggiornato"));
      onClose();
    },
  });
  const selettore = "h-9 w-full rounded-md border bg-background px-2 text-sm";
  if (q.isLoading) return <p role="status" className="text-sm">{t("Lettura degli anticipi registrati…")}</p>;
  return (
    <fieldset className="space-y-2 rounded-lg border p-3 text-sm" disabled={registra.isPending}>
      <legend className="px-1 font-medium">{t("Compensa con un anticipo")}</legend>
      {q.isError ? <p role="alert" className="text-destructive">{q.error.message} <Button variant="link" onClick={() => void q.refetch()}>{t("Riprova")}</Button></p> : (
        q.data?.anticipi.length ? <>
          <label className="block">{t("Anticipo registrato")}
            <select className={selettore} value={anticipoId} onChange={(e) => {
              const a = q.data?.anticipi.find((item) => item.id === e.target.value);
              setAnticipoId(e.target.value);
              setTestoImporto(a ? String(Math.min(residuo, Number(a.residuo))) : "");
              setRichiesta(crypto.randomUUID());
              setStessoFornitore(false);
            }}>
              <option value="">{t("Scegli l’anticipo")}</option>
              {q.data.anticipi.map((a) => <option key={a.id} value={a.id}>{formatDate(a.data)} · {a.descrizione} · {formatCurrency(Number(a.residuo))}</option>)}
            </select>
          </label>
          <label className="block">{t("Conto debiti del fornitore")}
            <select className={selettore} value={conto} onChange={(e) => { setContoId(e.target.value); setRichiesta(crypto.randomUUID()); }}>
              <option value="">{t("Scegli il conto")}</option>
              {q.data.conti.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <label className="block">{t("Importo da compensare")}
            <Input inputMode="decimal" value={testoImporto} onChange={(e) => { setTestoImporto(e.target.value); setRichiesta(crypto.randomUUID()); }} />
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={stessoFornitore} onCheckedChange={(v) => setStessoFornitore(v === true)} />
            {t("L’anticipo si riferisce al fornitore di questa fattura")}
          </label>
        </> : <p className="text-muted-foreground">{t("Registrare l’anticipo nel conto Anticipi a fornitori lo rende disponibile qui.")}</p>
      )}
      {registra.isError && <p role="alert" className="text-destructive">{registra.error.message}</p>}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" type="button" onClick={onClose}>{t("Annulla")}</Button>
        <Button size="sm" type="button" disabled={!anticipo || !conto || !stessoFornitore || !importo || importo <= 0 || importo > Math.min(residuo, Number(anticipo?.residuo ?? 0))}
          onClick={() => registra.mutate()}>{t("Registra compensazione")}</Button>
      </div>
    </fieldset>
  );
}
