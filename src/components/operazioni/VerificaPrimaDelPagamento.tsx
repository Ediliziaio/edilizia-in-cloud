import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { operazioniRpc, type ControlloPagamento } from "@/lib/operazioni/operazioni";
import { DettagliVerificaPagamento } from "./DettagliVerificaPagamento";

export function VerificaPrimaDelPagamento({ companyId, fatturaId }: { companyId: string; fatturaId: string }) {
  const client = useQueryClient();
  const [aperta, setAperta] = useState(false);
  const [nota, setNota] = useState("");
  const chiave = ["verifica-prima-pagamento", companyId, fatturaId];
  const verifica = useQuery({
    queryKey: chiave,
    queryFn: () => operazioniRpc<ControlloPagamento>("operazioni_fattura_controllo", { p_company: companyId, p_fattura: fatturaId }),
  });
  const conferma = useMutation({
    mutationFn: (impronta: string) => operazioniRpc<void>("operazioni_fattura_conferma", {
      p_company: companyId, p_fattura: fatturaId, p_impronta: impronta, p_nota: nota.trim(),
    }),
    onSuccess: () => {
      setAperta(false);
      setNota("");
      toast.success("Verifica per il pagamento confermata");
      void client.invalidateQueries({ queryKey: chiave });
      void client.invalidateQueries({ queryKey: ["operazioni-eccezioni", companyId] });
      void client.invalidateQueries({ queryKey: ["distinte-pagamenti", companyId] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      void verifica.refetch();
    },
  });
  if (verifica.isError) return <p role="status" className="text-xs text-muted-foreground">
    Verifica prima del pagamento non disponibile.{" "}
    <button type="button" className="underline" onClick={() => void verifica.refetch()}>Riprova</button>
  </p>;
  const e = verifica.data;
  if (!e || e.stato === "non_applicabile" || e.stato === "chiusa" || e.stato === "pronta") return null;
  return (
    <section className="space-y-2 rounded-lg border bg-muted/30 p-3" aria-label="Verifica prima del pagamento">
      <p className={e.bloccata ? "font-medium text-amber-800 dark:text-amber-300" : "font-medium"} role={e.bloccata ? "alert" : "status"}>
        {e.bloccata ? "Da verificare prima del pagamento" : "Verifica per il pagamento confermata"}
      </p>
      {e.bloccata ? <DettagliVerificaPagamento esito={e} /> : e.nota && <p className="text-sm">{e.nota}</p>}
      {e.bloccata && e.puo_approvare && e.puo_confermare !== false && (
        aperta ? <form className="space-y-2" onSubmit={ev => { ev.preventDefault(); conferma.mutate(e.impronta); }}>
          <label className="block text-sm" htmlFor="motivo-verifica-pagamento">Motivo della verifica</label>
          <Textarea id="motivo-verifica-pagamento" value={nota} onChange={ev => setNota(ev.target.value)} rows={2} maxLength={1000} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={nota.trim().length < 3 || conferma.isPending}>Salva verifica</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAperta(false)}>Annulla</Button>
          </div>
        </form> : <Button type="button" size="sm" variant="outline" onClick={() => setAperta(true)}>Conferma verifica</Button>
      )}
    </section>
  );
}

