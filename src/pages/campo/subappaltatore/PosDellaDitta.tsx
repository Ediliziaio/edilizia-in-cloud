import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConsegnaPosEsternoDialog } from "@/components/sicurezza/ConsegnaPosEsterno";
import { STATI_POS_ESTERNO, useConsegnePosEsterno } from "@/hooks/useAvvioSicurezza";
import { apriFileRiservato } from "@/lib/storagePrivato";
import { toast } from "sonner";

export function PosDellaDitta({ companyId, userId }: { companyId: string; userId: string }) {
  const q = useConsegnePosEsterno({ companyId, userId });
  const [scelto, setScelto] = useState("");
  const attuale = q.data?.find((d) => d.id === scelto);
  const righe = q.data?.filter((d) => d.corrente) ?? [];
  return (
    <section aria-label="POS dei miei cantieri" className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="text-sm font-semibold">POS dei miei cantieri</h2>
      {q.isError ? <div role="alert" className="text-sm">Richieste POS non disponibili. <Button variant="link" onClick={() => void q.refetch()}>Riprova</Button></div>
        : q.isLoading ? <p role="status" className="text-sm text-muted-foreground">Carico le richieste…</p>
        : !righe.length ? <p className="text-sm text-muted-foreground">Nessuna richiesta POS per i tuoi cantieri.</p>
        : righe.map((d) => <article key={d.id} className="space-y-2 rounded-lg border p-3 text-sm">
            <p className="font-medium">{d.nome_commessa}</p>
            <p className={d.da_riesaminare ? "font-medium text-amber-800" : "text-muted-foreground"}>
              {d.da_riesaminare ? "Da riesaminare con l’impresa affidataria" : STATI_POS_ESTERNO[d.stato]}
              {d.revisione ? ` · Rev. ${d.revisione}` : ""}
            </p>
            {d.nota && <p className="whitespace-pre-wrap">{d.nota}</p>}
            <div className="flex flex-wrap gap-2">
              {d.psc_comunicato && <Button variant="outline" size="sm" onClick={() => {
                const p = d.psc_comunicato!;
                void apriFileRiservato(p.archivio === "sicurezza_fascicolo" ? "fascicoli-cantiere" : "sicurezza-documenti", p.file_path).catch(() => toast.error("Impossibile aprire il PSC"));
              }}>PSC rev. {d.psc_comunicato.revisione}</Button>}
              {d.file_path && <Button variant="outline" size="sm" onClick={() => void apriFileRiservato("fascicoli-cantiere", d.file_path!).catch(() => toast.error("Impossibile aprire il POS"))}>Apri POS consegnato</Button>}
              {d.stato === "richiesto" && <Button size="sm" onClick={() => setScelto(d.id)}>Consegna POS</Button>}
            </div>
          </article>)}
      {attuale && <ConsegnaPosEsternoDialog consegna={attuale} chiudi={() => setScelto("")} />}
    </section>
  );
}
