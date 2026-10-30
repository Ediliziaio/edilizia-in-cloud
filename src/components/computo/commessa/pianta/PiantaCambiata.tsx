/**
 * «La pianta è cambiata»: le righe di misura prese da una versione vecchia della
 * pianta, con il confronto vecchia → nuova quantità. Il computo non cambia da solo:
 * - in bozza o verificato: «Aggiorna le quantità», con conferma;
 * - contrattuale: niente aggiornamento; con la contabilità dei lavori pubblici le
 *   differenze vanno nella perizia di variante, altrimenti serve lo sblocco.
 */
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { numeroVoce, type VoceComputo } from "@/lib/computo/alberoComputo";
import { righeCambiate, type ConfrontoRiga } from "@/lib/planimetrie/computo";
import { useAggiornaMisureDaPianta, usePeriziaDaPianta, type PiantaUsata } from "@/hooks/useComputoPianta";
import type { ComputoCommessa } from "@/hooks/useComputoCommessa";

const numero = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const conSegno = (n: number) => `${n > 0 ? "+" : ""}${numero(n)}`;

interface Props {
  voci: VoceComputo[]; computo: ComputoCommessa; computi: ComputoCommessa[]; orderId: string; canEdit: boolean; onApriVarianti?: () => void;
}

function Pianta({ pianta, confronto, voci, computo, computi, orderId, canEdit, onApriVarianti }: Props & { pianta: PiantaUsata; confronto: ConfrontoRiga[] }) {
  const confirm = useConfirm();
  const aggiorna = useAggiornaMisureDaPianta(computo.id);
  const perizia = usePeriziaDaPianta(orderId);
  const [tutte, setTutte] = useState(false);
  const cambiate = righeCambiate(confronto);
  const visibili = tutte ? cambiate : cambiate.slice(0, 8);
  const perVoce = new Map(voci.map(v => [v.id, v]));
  const versioni = [...new Set(confronto.map(c => c.misura.versione))].sort((a, b) => a - b);
  const contrattuale = computo.stato === "contrattuale";
  const inCorso = aggiorna.isPending || perizia.isPending;

  const aggiornaOra = async () => {
    const ok = await confirm({
      title: "Aggiornare le quantità dalla pianta?",
      description: cambiate.length
        ? `Cambiano ${cambiate.length === 1 ? "1 riga di misura" : `${cambiate.length} righe di misura`} e le quantità e gli importi delle loro voci, come nel confronto. Le altre righe del computo non si toccano.`
        : "Le quantità usate dal computo sono uguali nella pianta nuova: le righe ricordano solo la versione nuova.",
      confirmLabel: "Aggiorna",
    });
    if (!ok) return;
    aggiorna.mutate({ confronto, versione: pianta.versioneCorrente, voci }, {
      onSuccess: () => toast.success("Quantità aggiornate dalla pianta"),
      onError: e => toast.error(e instanceof Error ? e.message : "Aggiornamento non riuscito."),
    });
  };
  const portaInPerizia = async () => {
    const aperta = computi.find(c => c.variante_di === computo.id && (c.stato === "bozza" || c.stato === "verificato"));
    const ok = await confirm({
      title: "Portare le differenze nella perizia di variante?",
      description: `${aperta ? `Le righe cambiano nella perizia «${aperta.titolo || `n. ${aperta.numero_variante}`}», ancora da approvare.` : "Si crea una perizia di variante, copia del computo contrattuale, e lì cambiano le righe."} Il computo contrattuale resta com'è finché la perizia non è approvata.`,
      confirmLabel: "Porta nella perizia",
    });
    if (!ok) return;
    perizia.mutate({ computo, computi, voci, confronto, versione: pianta.versioneCorrente, titoloPianta: pianta.titolo }, {
      onSuccess: r => {
        toast.success(r.aggiornate ? `Perizia di variante aggiornata: ${r.aggiornate === 1 ? "1 riga" : `${r.aggiornate} righe`} dalla pianta` : "La perizia di variante ha già queste quantità");
        if (r.nonTrovate.length) toast.warning(`Non ritrovate nella perizia: ${r.nonTrovate.slice(0, 3).join(", ")}${r.nonTrovate.length > 3 ? "…" : ""}. Correggile a mano nella scheda Varianti.`);
        onApriVarianti?.();
      },
      onError: e => toast.error(e instanceof Error ? e.message : "Perizia non aggiornata."),
    });
  };

  return (
    <div className="space-y-2">
      <p className="text-sm">
        <strong>«{pianta.titolo}»</strong> è alla versione {pianta.versioneCorrente}; il computo usa la versione {versioni.join(", ")}.
        {" "}{cambiate.length
          ? <>{cambiate.length === 1 ? "Cambia 1 riga di misura." : `Cambiano ${cambiate.length} righe di misura.`}</>
          : <>Le quantità usate dal computo non cambiano.</>}
      </p>
      {visibili.length > 0 && (
        <div className="overflow-x-auto rounded border bg-white">
          <table className="w-full min-w-[30rem] text-xs">
            <caption className="sr-only">Confronto delle quantità con la pianta nuova</caption>
            <thead className="bg-slate-100 text-slate-600">
              <tr><th className="px-2 py-1 text-left font-medium">Voce</th><th className="px-2 py-1 text-left font-medium">Riga</th>
                <th className="px-2 py-1 text-right font-medium">Prima</th><th className="px-2 py-1 text-right font-medium">Adesso</th>
                <th className="px-2 py-1 text-right font-medium">Differenza</th></tr>
            </thead>
            <tbody>
              {visibili.map(c => {
                const v = perVoce.get(c.misura.voceId);
                return (
                  <tr key={c.misura.id} className="border-t">
                    <td className="px-2 py-1 font-semibold tabular-nums">{v ? numeroVoce(v) : "—"}</td>
                    <td className="px-2 py-1">{c.misura.descrizione || "—"}
                      {c.mancanti.length > 0 && <span className="block text-amber-800">non c'è più nella pianta: la riga andrebbe a zero</span>}
                      {c.origine === "stimata" && !c.mancanti.length && <span className="ml-1 text-amber-800">(stimata)</span>}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">{numero(c.vecchia)}</td>
                    <td className="px-2 py-1 text-right font-medium tabular-nums">{numero(c.nuova)}</td>
                    <td className={`px-2 py-1 text-right tabular-nums ${c.differenza > 0 ? "text-sky-800" : c.differenza < 0 ? "text-amber-800" : "text-slate-400"}`}>{conSegno(c.differenza)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {cambiate.length > visibili.length && <Button type="button" size="sm" variant="ghost" onClick={() => setTutte(true)}>Mostra tutte ({cambiate.length})</Button>}

      {canEdit && !contrattuale && (
        <Button type="button" size="sm" onClick={aggiornaOra} disabled={inCorso}>
          {aggiorna.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
          {cambiate.length ? "Aggiorna le quantità" : "Segna come aggiornate"}
        </Button>
      )}
      {contrattuale && (
        <div className="space-y-2 text-sm text-slate-700">
          <p>Il computo è <strong>contrattuale</strong>: la pianta nuova non lo cambia.
            {computo.lavoro_pubblico ? " Le differenze si portano in una perizia di variante, da approvare." : " Per usare la pianta nuova va prima sbloccato (Sblocca, con il motivo), se il libretto delle misure è ancora vuoto."}</p>
          {canEdit && computo.lavoro_pubblico && cambiate.length > 0 && (
            <Button type="button" size="sm" onClick={portaInPerizia} disabled={inCorso}>
              {perizia.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Porta le differenze nella perizia di variante
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default function PiantaCambiata({ cambiate, ...props }: Props & { cambiate: Array<{ pianta: PiantaUsata; confronto: ConfrontoRiga[] }> }) {
  if (!cambiate.length) return null;
  return (
    <section role="status" aria-label="La pianta è cambiata" className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-amber-950"><AlertTriangle className="h-4 w-4" />
        {cambiate.length === 1 ? "La pianta è cambiata" : "Le piante sono cambiate"}: il computo non si aggiorna da solo.</h4>
      {cambiate.map(c => (
        <Pianta key={c.pianta.id} pianta={c.pianta} confronto={c.confronto} {...props} />
      ))}
    </section>
  );
}
