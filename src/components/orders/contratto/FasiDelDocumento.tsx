import type { ContractExtractWorkPhase } from "@/lib/orders/contractExtract";
import { macrofaseOperativa } from "../../../../supabase/functions/_shared/computoFasiOperative";

/** Stesse fasi del documento, raggruppate per macrofase senza alterare le voci contabili. */
export function FasiDelDocumento({ fasi }: { fasi: ContractExtractWorkPhase[] }) {
  const gruppi = new Map<string, ContractExtractWorkPhase[]>();
  for (const f of fasi) {
    const macro = macrofaseOperativa(f.nome);
    gruppi.set(macro, [...(gruppi.get(macro) ?? []), f]);
  }
  return <div className="space-y-3" aria-label="Macrofasi e fasi del documento">
    <p className="text-xs text-muted-foreground">{gruppi.size} macrofasi · {fasi.length} fasi. Date e durate si confermano nel piano lavori.</p>
    {[...gruppi].map(([macro, ff]) => <section key={macro} className="rounded-md border p-2">
      <h4 className="text-xs font-semibold">{macro}</h4>
      <ol className="mt-1 space-y-1.5">{ff.map((f, i) => <li key={`${f.nome}-${i}`} className="text-xs">
        <p className="font-medium">{f.nome}{f.giorni ? <span className="font-normal text-muted-foreground"> · {f.giorni} gg</span> : null}</p>
        {f.sottofasi.length > 0 && <details className="mt-0.5 pl-2"><summary className="cursor-pointer text-muted-foreground">Lavorazioni ({f.sottofasi.length})</summary>
          <ul className="mt-1 list-inside list-disc text-muted-foreground">{f.sottofasi.map((s, k) => <li key={k}>{s}</li>)}</ul>
        </details>}
      </li>)}</ol>
    </section>)}
  </div>;
}
