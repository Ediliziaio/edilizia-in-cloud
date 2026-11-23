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
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { numeroVoce, type VoceComputo } from "@/lib/computo/alberoComputo";
import { righeCambiate, type ConfrontoRiga } from "@/lib/planimetrie/computo";
import { useAggiornaMisureDaPianta, usePeriziaDaPianta, type PiantaUsata } from "@/hooks/useComputoPianta";
import type { ComputoCommessa } from "@/hooks/useComputoCommessa";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

const numero = (n: number) => n.toLocaleString(intlCampo(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const conSegno = (n: number) => `${n > 0 ? "+" : ""}${numero(n)}`;

interface Props {
  voci: VoceComputo[]; computo: ComputoCommessa; computi: ComputoCommessa[]; orderId: string; canEdit: boolean; onApriVarianti?: () => void;
}

function Pianta({ pianta, confronto, voci, computo, computi, orderId, canEdit, onApriVarianti }: Props & { pianta: PiantaUsata; confronto: ConfrontoRiga[] }) {
  const t = useT();
  const confirm = useConfirm();
  const aggiorna = useAggiornaMisureDaPianta(computo.id);
  const perizia = usePeriziaDaPianta(orderId);
  const [tutte, setTutte] = useState(false);
  const cambiate = righeCambiate(confronto);
  const [selezionate, setSelezionate] = useState<Set<string>>(new Set());
  const varianteAperta = computi.find(c => c.variante_di === computo.id && (c.stato === "bozza" || c.stato === "verificato"));
  const confermate = cambiate.length ? confronto.filter(c => selezionate.has(c.misura.id)) : confronto;
  const visibili = tutte ? cambiate : cambiate.slice(0, 8);
  const perVoce = new Map(voci.map(v => [v.id, v]));
  const versioni = [...new Set(confronto.map(c => c.misura.versione))].sort((a, b) => a - b);
  const contrattuale = computo.stato === "contrattuale";
  const inCorso = aggiorna.isPending || perizia.isPending;
  const selezionabile = canEdit && (!contrattuale || (computo.lavoro_pubblico && !!varianteAperta));

  const aggiornaOra = async () => {
    if (!confermate.length) return;
    const ok = await confirm({
      title: t("Aggiornare le quantità dalla pianta?"),
      description: cambiate.length
        ? t("Aggiorni {n} righe selezionate e le quantità e gli importi delle loro voci, come nel confronto. Le altre righe del computo non si toccano.", { n: confermate.length })
        : t("Le quantità usate dal computo sono uguali nella pianta nuova: le righe ricordano solo la versione nuova."),
      confirmLabel: t("Aggiorna"),
    });
    if (!ok) return;
    aggiorna.mutate({ confronto: confermate, versione: pianta.versioneCorrente, voci }, {
      onSuccess: () => toast.success(t("Quantità aggiornate dalla pianta")),
      onError: e => toast.error(e instanceof Error ? e.message : t("Aggiornamento non riuscito.")),
    });
  };
  const portaInPerizia = async () => {
    if (!varianteAperta || !confermate.length) return;
    const ok = await confirm({
      title: t("Portare le differenze nella perizia di variante?"),
      description: t("Le {n} righe selezionate cambiano nella perizia esistente «{titolo}», ancora da approvare. Il computo contrattuale resta com'è.", { n: confermate.length, titolo: varianteAperta.titolo || `n. ${varianteAperta.numero_variante}` }),
      confirmLabel: t("Porta nella perizia"),
    });
    if (!ok) return;
    perizia.mutate({ computo, computi, voci, confronto: confermate, versione: pianta.versioneCorrente, titoloPianta: pianta.titolo }, {
      onSuccess: r => {
        toast.success(r.aggiornate ? (r.aggiornate === 1 ? t("Perizia di variante aggiornata: 1 riga dalla pianta") : t("Perizia di variante aggiornata: {n} righe dalla pianta", { n: r.aggiornate })) : t("La perizia di variante ha già queste quantità"));
        if (r.nonTrovate.length) toast.warning(t("Non ritrovate nella perizia: {elenco}. Correggile a mano nella scheda Varianti.", { elenco: r.nonTrovate.slice(0, 3).join(", ") + (r.nonTrovate.length > 3 ? "…" : "") }));
        onApriVarianti?.();
      },
      onError: e => toast.error(e instanceof Error ? e.message : t("Perizia non aggiornata.")),
    });
  };

  return (
    <div className="space-y-2">
      <p className="text-sm">
        {t("«{titolo}» è alla versione {versione}; il computo usa la versione {versioni}.", { titolo: pianta.titolo, versione: pianta.versioneCorrente, versioni: versioni.join(", ") })}
        {" "}{cambiate.length
          ? <>{cambiate.length === 1 ? t("Cambia 1 riga di misura.") : t("Cambiano {n} righe di misura.", { n: cambiate.length })}</>
          : <>{t("Le quantità usate dal computo non cambiano.")}</>}
      </p>
      {visibili.length > 0 && (
        <div className="overflow-x-auto rounded border bg-white">
          <table className="w-full min-w-[30rem] text-xs">
            <caption className="sr-only">{t("Confronto delle quantità con la pianta nuova")}</caption>
            <thead className="bg-slate-100 text-slate-600">
              <tr>{selezionabile && <th className="w-9 px-2 py-1"><Checkbox aria-label={t("Seleziona tutte le misure cambiate")} checked={cambiate.length > 0 && cambiate.every(c => selezionate.has(c.misura.id))} disabled={inCorso} onCheckedChange={(v) => setSelezionate(v === true ? new Set(cambiate.map(c => c.misura.id)) : new Set())} /></th>}<th className="px-2 py-1 text-left font-medium">{t("Voce")}</th><th className="px-2 py-1 text-left font-medium">{t("Riga")}</th>
                <th className="px-2 py-1 text-right font-medium">{t("Prima")}</th><th className="px-2 py-1 text-right font-medium">{t("Adesso")}</th>
                <th className="px-2 py-1 text-right font-medium">{t("Differenza")}</th></tr>
            </thead>
            <tbody>
              {visibili.map(c => {
                const v = perVoce.get(c.misura.voceId);
                return (
                  <tr key={c.misura.id} className="border-t">
                    {selezionabile && <td className="px-2 py-1"><Checkbox aria-label={t("Seleziona misura {descrizione}", { descrizione: c.misura.descrizione || c.misura.id })} checked={selezionate.has(c.misura.id)} disabled={inCorso} onCheckedChange={(valore) => setSelezionate((precedenti) => { const nuove = new Set(precedenti); if (valore === true) nuove.add(c.misura.id); else nuove.delete(c.misura.id); return nuove; })} /></td>}
                    <td className="px-2 py-1 font-semibold tabular-nums">{v ? numeroVoce(v) : "—"}</td>
                    <td className="px-2 py-1">{c.misura.descrizione || "—"}
                      {c.mancanti.length > 0 && <span className="block text-amber-800">{t("non c'è più nella pianta: la riga andrebbe a zero")}</span>}
                      {c.origine === "stimata" && !c.mancanti.length && <span className="ml-1 text-amber-800">{t("(stimata)")}</span>}
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
      {cambiate.length > visibili.length && <Button type="button" size="sm" variant="ghost" onClick={() => setTutte(true)}>{t("Mostra tutte ({n})", { n: cambiate.length })}</Button>}
      {selezionabile && cambiate.length > 0 && <p className="text-xs text-amber-950">{t("Selezionate {n} di {n2} righe. Le misure stimate e le righe non più presenti nella pianta richiedono la tua verifica.", { n: confermate.length, n2: cambiate.length })}</p>}

      {canEdit && !contrattuale && (
        <Button type="button" size="sm" onClick={aggiornaOra} disabled={inCorso || !confermate.length}>
          {aggiorna.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
          {cambiate.length ? t("Aggiorna le quantità") : t("Segna come aggiornate")}
        </Button>
      )}
      {contrattuale && (
        <div className="space-y-2 text-sm text-slate-700">
          <p>{t("Il computo è")} <strong>{t("contrattuale")}</strong>{t(": la pianta nuova non lo cambia.")}
            {computo.lavoro_pubblico ? varianteAperta ? t(" Le differenze selezionate si applicano alla perizia di variante già aperta, da approvare.") : t(" Per applicare le differenze serve una perizia di variante già esistente e modificabile.") : t(" Per usare la pianta nuova va prima sbloccato (Sblocca, con il motivo), se il libretto delle misure è ancora vuoto.")}</p>
          {canEdit && computo.lavoro_pubblico && varianteAperta && cambiate.length > 0 && (
            <Button type="button" size="sm" onClick={portaInPerizia} disabled={inCorso || !confermate.length}>
              {perizia.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{t("Porta le differenze nella perizia di variante")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default function PiantaCambiata({ cambiate, ...props }: Props & { cambiate: Array<{ pianta: PiantaUsata; confronto: ConfrontoRiga[] }> }) {
  const t = useT();
  if (!cambiate.length) return null;
  return (
    <section role="status" aria-label={t("La pianta è cambiata")} className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-amber-950"><AlertTriangle className="h-4 w-4" />
        {cambiate.length === 1 ? t("La pianta è cambiata: il computo non si aggiorna da solo.") : t("Le piante sono cambiate: il computo non si aggiorna da solo.")}</h4>
      {cambiate.map(c => (
        <Pianta key={`${c.pianta.id}:${c.pianta.versioneCorrente}`} pianta={c.pianta} confronto={c.confronto} {...props} />
      ))}
    </section>
  );
}
