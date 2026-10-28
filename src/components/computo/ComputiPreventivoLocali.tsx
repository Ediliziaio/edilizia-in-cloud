import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { elencaComputiPreventivo } from "@/lib/computo/editorNativo";
import { computoCloudAttivo, elencaComputiCloud, type RiepilogoComputoCloud } from "@/lib/computo/cloudComputo";

export default function ComputiPreventivoLocali() {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id, userId = user?.id;
  const owner = `${companyId ?? ""}:${userId ?? ""}`;
  const [saved, setSaved] = useState<{ owner: string; bozze: ReturnType<typeof elencaComputiPreventivo> }>({ owner: "", bozze: [] });
  const [cloud, setCloud] = useState<{ owner: string; rows: RiepilogoComputoCloud[]; error: string; loading: boolean }>({ owner: "", rows: [], error: "", loading: false });
  const [retry, setRetry] = useState(0);
  const attivo = computoCloudAttivo(companyId);
  useEffect(() => {
    if (!attivo || !companyId || !userId) return;
    let active = true;
    void elencaComputiCloud(companyId).then(rows => {
      if (active) setCloud({ owner, rows, error: "", loading: false });
    }).catch(e => {
      if (active) setCloud({ owner, rows: [], error: e instanceof Error ? e.message : "Elenco Supabase non disponibile.", loading: false });
    });
    return () => { active = false; };
  }, [attivo, companyId, userId, owner, retry]);
  useEffect(() => {
    const carica = () => {
      try { setSaved({ owner, bozze: companyId && userId ? elencaComputiPreventivo(localStorage, companyId, userId) : [] }); }
      catch { setSaved({ owner, bozze: [] }); }
    };
    carica(); window.addEventListener("storage", carica); window.addEventListener("focus", carica);
    return () => { window.removeEventListener("storage", carica); window.removeEventListener("focus", carica); };
  }, [companyId, userId, owner]);
  const bozze = saved.owner === owner ? saved.bozze : [];
  const remote = attivo && cloud.owner === owner ? cloud.rows : [];
  const remoteIds = new Set(remote.map(r => r.id));
  const rows = [
    ...bozze.map(({ id, bozza }) => ({ id, titolo: bozza.titolo, committente: bozza.committente, numeroVoci: bozza.voci.length, remoto: remoteIds.has(id) })),
    ...remote.filter(r => !bozze.some(b => b.id === r.id)).map(r => ({ ...r, remoto: true })),
  ];
  if (!rows.length && !attivo) return null;
  return <details className="border-y border-orange-200 py-3" open>
    <summary className="cursor-pointer text-sm font-semibold text-slate-900">{attivo ? "Computi" : "Computi locali"} · {rows.length}</summary>
    <p className="mt-1 text-xs text-muted-foreground">{attivo ? "Demo Azienda 2 · bozze locali e salvate su Supabase." : "Bozze in questo browser, non ancora sincronizzate con il gestionale."}</p>
    {attivo && (cloud.owner !== owner || cloud.loading) && <p role="status" className="text-xs py-2">Caricamento computi Supabase…</p>}
    {attivo && cloud.owner === owner && cloud.error && <p role="alert" className="text-sm text-amber-800">{cloud.error} <button className="underline" onClick={() => { setCloud({ owner, rows: [], error: "", loading: true }); setRetry(n => n + 1); }}>Riprova</button></p>}
    <ul className="mt-2 max-h-64 divide-y overflow-auto">{rows.map(({ id, titolo, committente, numeroVoci, remoto }) => <li key={id}>
      <Link className="flex items-center justify-between gap-3 py-2 text-sm hover:text-orange-600" to={`/azienda/marketing/preventivi/computo?bozza=${id}`}>
        <span className="min-w-0"><span className="block break-words font-medium">{titolo || "Computo senza titolo"}</span><span className="block text-xs text-muted-foreground">{committente || "Cliente da definire"} · {numeroVoci} voci{attivo ? remoto ? " · Con copia Supabase" : " · Solo locale" : ""}</span></span>
        <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
      </Link>
    </li>)}</ul>
  </details>;
}
