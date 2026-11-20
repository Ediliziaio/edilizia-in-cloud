import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { computoLetto, useComputiCommessa, useVociComputo } from "@/hooks/useComputoCommessa";
import { archivioRisorseComputo, salvaPianoRisorse, usePianoRisorseComputo } from "@/hooks/usePianoRisorseComputo";
import type { PropostaRisorsa, StatoPropostaRisorsa, TipoRisorsa } from "@/lib/distinta/proposteRisorseComputo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const TIPI: Record<TipoRisorsa, string> = { nolo: "Noleggio", servizio: "Servizio", manodopera: "Manodopera", lotto: "Distinta da completare" };
const STATI: Record<StatoPropostaRisorsa, string> = { da_completare: "Da completare", da_quotare: "Da quotare", in_gestione: "In gestione", esclusa: "Esclusa" };
const n = (q: number) => q.toLocaleString("it-IT", { maximumFractionDigits: 4 });
export interface AzioniNoleggiComputo {
  collegato: (computoId: string, proposta: PropostaRisorsa) => boolean;
  apri: (computoId: string, proposta: PropostaRisorsa) => void;
}

function EditorRisorse({ companyId, orderId, computoId, userId, dati, puoModificare, faseIniziale, noleggi }: {
  companyId: string; orderId: string; computoId: string; userId: string; puoModificare: boolean;
  dati: NonNullable<ReturnType<typeof usePianoRisorseComputo>["data"]>;
  faseIniziale?: string;
  noleggi?: AzioniNoleggiComputo;
}) {
  const [proposte, setProposte] = useState(dati.proposte);
  const [fase, setFase] = useState(faseIniziale ?? "");
  const [tipo, setTipo] = useState("");
  const [modificata, setModificata] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const qc = useQueryClient();
  const cambia = (id: string, patch: Partial<PropostaRisorsa["scelta"]>) => {
    setProposte(rr => rr.map(r => r.id === id ? { ...r, scelta: { ...r.scelta, ...patch } } : r)); setModificata(true);
  };
  const visibili = useMemo(() => proposte.filter(p => (!tipo || p.tipo === tipo) && (!fase || p.fase_ids.includes(fase))), [proposte, fase, tipo]);
  const salva = async () => {
    setSalvando(true);
    try {
      const salvato = await salvaPianoRisorse(archivioRisorseComputo(companyId, orderId, computoId),
        { companyId, orderId, computoId, userId }, dati.salvato?.revisione ?? 0, proposte);
      qc.setQueryData(["piano-risorse-computo", companyId, orderId, computoId], { ...dati, proposte, salvato });
      toast.success("Proposte salvate nella commessa", { description: "Puoi riaprirle senza rileggere il documento con l'AI." });
    } catch (e) { toast.error("Piano risorse non salvato", { description: e instanceof Error ? e.message : String(e) }); }
    finally { setSalvando(false); }
  };
  return <div className="space-y-3" aria-label="Proposte di noleggi e servizi">
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span>{proposte.length} proposte · {proposte.filter(p => p.da_rivedere).length} da rivedere</span>
      <select aria-label="Filtra risorse per fase" className="rounded border bg-background p-1" value={fase} onChange={e => setFase(e.target.value)}>
        <option value="">Tutte le fasi</option>{dati.fasi.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
      </select>
      <select aria-label="Filtra tipo risorsa" className="rounded border bg-background p-1" value={tipo} onChange={e => setTipo(e.target.value)}>
        <option value="">Tutte le risorse</option>{Object.entries(TIPI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      {puoModificare && <Button size="sm" className="ml-auto" disabled={salvando || (!modificata && !!dati.salvato)} onClick={salva}>
        {salvando ? "Salvataggio…" : "Salva proposte"}
      </Button>}
    </div>
    {dati.salvato && <p className="text-xs text-muted-foreground">Salvato il {new Date(dati.salvato.salvato_il).toLocaleString("it-IT")} · revisione {dati.salvato.revisione}{modificata ? " · modifiche da salvare" : ""}</p>}
    <p className="text-xs text-muted-foreground">{noleggi ? "Apri la voce da pianificare e controlla quantità, unità e periodo." : "Completa fornitore e date, poi gestisci prenotazioni e affidamenti dai moduli della commessa."}</p>
    <div className="flex flex-wrap gap-4 text-xs underline">
      {!noleggi && <a href={`?tab=cantiere&vista_cantiere=lavorazioni#section-mezzi`}>Apri Mezzi e noleggi</a>}
      <a href={`?tab=costi&section=section-subappaltatori#section-subappaltatori`}>Apri Ditte e contratti</a>
    </div>
    <div className="max-h-[38rem] space-y-2 overflow-y-auto">
      {visibili.map(p => <details key={p.id} className="rounded-md border p-2" data-risorsa={p.id}>
        <summary className="cursor-pointer text-sm"><span className="font-medium">{TIPI[p.tipo]} · voci {p.fonti.map(f => f.numero ?? "—").join(", ")} · {p.descrizione}</span>
          <span className="ml-2 text-xs text-muted-foreground">{noleggi?.collegato(computoId, p) ? "Prenotazione collegata" : STATI[p.scelta.stato]}{p.da_rivedere ? " · fonte cambiata: ricontrolla" : ""}</span>
        </summary>
        <p className="mt-2 text-xs">Fasi: {p.fase_ids.map(id => dati.fasi.find(f => f.id === id)?.name ?? "Fase").join(" · ") || "Da collegare"} · {p.sottofase_ids.length} sottofasi collegate</p>
        <p className="mt-1 text-xs font-medium">{p.periodi.length ? p.periodi.map(t => `${n(t.quantita)} ${t.unita} × ${n(t.mesi)} mesi`).join(" + ") : p.quantita != null ? `${n(p.quantita)} ${p.unita}` : "Quantità fisica da completare"}</p>
        {p.note_origine.map(t => <p key={t} className="mt-1 text-xs text-muted-foreground">{t}</p>)}
        <fieldset disabled={!puoModificare || salvando} className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          <label>Stato proposta<select className="mt-1 h-8 w-full rounded border bg-background px-2" value={p.scelta.stato} onChange={e => cambia(p.id, { stato: e.target.value as StatoPropostaRisorsa })}>
            {Object.entries(STATI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>Fornitore o ditta<Input aria-label={`Fornitore voci ${p.fonti.map(f => f.numero).join(", ")}`} value={p.scelta.fornitore} onChange={e => cambia(p.id, { fornitore: e.target.value })} /></label>
          <label>Dal<Input type="date" value={p.scelta.dal} onChange={e => cambia(p.id, { dal: e.target.value })} /></label>
          <label>Al<Input type="date" value={p.scelta.al} onChange={e => cambia(p.id, { al: e.target.value })} /></label>
          <label>Quantità da richiedere<Input type="number" min="0.0001" step="any" placeholder={p.quantita != null ? String(p.quantita) : "Da completare"} value={p.scelta.quantita ?? ""} onChange={e => cambia(p.id, { quantita: e.target.value === "" ? null : Number(e.target.value) })} /></label>
          <label>Unità<Input placeholder={p.unita} value={p.scelta.unita ?? ""} onChange={e => cambia(p.id, { unita: e.target.value })} /></label>
          {(p.scelta.periodi ?? p.periodi).map((t, i, tutte) => <div key={i} className="flex gap-2 sm:col-span-2">
            <label className="flex-1">Quantità periodo {i + 1}<Input type="number" min="0.0001" step="any" value={t.quantita} onChange={e => cambia(p.id, { periodi: tutte.map((x, j) => j === i ? { ...x, quantita: Number(e.target.value) } : x) })} /></label>
            <label className="flex-1">Mesi periodo {i + 1}<Input type="number" min="0.0001" step="any" value={t.mesi} onChange={e => cambia(p.id, { periodi: tutte.map((x, j) => j === i ? { ...x, mesi: Number(e.target.value) } : x) })} /></label>
          </div>)}
          <label className="sm:col-span-2">Note e inclusioni<textarea className="mt-1 min-h-16 w-full rounded border bg-background p-2" value={p.scelta.note} onChange={e => cambia(p.id, { note: e.target.value })} /></label>
          {p.da_rivedere && <label className="sm:col-span-2"><input type="checkbox" onChange={e => { if (e.target.checked) { setProposte(rr => rr.map(r => r.id === p.id ? { ...r, da_rivedere: false } : r)); setModificata(true); } }} /> Ho ricontrollato la fonte e le mie scelte</label>}
        </fieldset>
        {p.tipo === "nolo" && noleggi && (noleggi.collegato(computoId, p) || p.scelta.stato !== "esclusa") &&
          <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => noleggi.apri(computoId, p)}>
            {noleggi.collegato(computoId, p) ? "Apri prenotazione" : "Pianifica noleggio"}
          </Button>}
      </details>)}
    </div>
  </div>;
}

function RisorseDelComputo({ companyId, orderId, computoId, faseId, noleggi }: { companyId: string; orderId: string; computoId: string; faseId?: string; noleggi?: AzioniNoleggiComputo }) {
  const { user } = useAuth();
  const permessi = usePermissions();
  const voci = useVociComputo(computoId, true);
  const query = usePianoRisorseComputo(companyId, orderId, computoId, voci.data);
  if (voci.isError || query.isError) return <p role="alert" className="text-sm text-amber-800">Non riesco a leggere il piano risorse. <button className="underline" onClick={() => { void voci.refetch(); void query.refetch(); }}>Riprova</button></p>;
  if (!query.data) return <p role="status" className="text-xs">Preparo risorse e collegamenti alle fasi…</p>;
  return <EditorRisorse key={`${computoId}:${query.data.salvato?.revisione ?? 0}`} companyId={companyId} orderId={orderId} computoId={computoId}
    userId={user?.id ?? ""} puoModificare={!!user && !!permessi.canEditOrders} dati={query.data} faseIniziale={faseId} noleggi={noleggi} />;
}

export function PianoRisorseComputo({ companyId, orderId, integrato = false, faseId, computoId, noleggi }: { companyId: string; orderId: string; integrato?: boolean; faseId?: string; computoId?: string; noleggi?: AzioniNoleggiComputo }) {
  const [aperto, setAperto] = useState(false);
  const [scelto, setScelto] = useState("");
  const computi = useComputiCommessa(orderId, companyId);
  const letti = (computi.data ?? []).filter(computoLetto).filter(c => c.stato !== "archiviato");
  const computo = letti.find(c => c.id === (computoId ?? scelto)) ?? letti.find(c => c.stato === "contrattuale") ?? letti[0];
  if (!computo) return null;
  if (integrato) return <RisorseDelComputo key={computo.id + (faseId ?? "")} companyId={companyId} orderId={orderId} computoId={computo.id} faseId={faseId} noleggi={noleggi} />;
  return <section className="space-y-3 rounded-lg border bg-card p-3" aria-label="Piano noleggi e servizi dal computo">
    <Button type="button" size="sm" variant="outline" aria-expanded={aperto} onClick={() => setAperto(v => !v)}>{aperto ? "Chiudi piano noleggi e servizi" : "Noleggi e servizi dal computo"}</Button>
    {aperto && <>
      {letti.length > 1 && <select aria-label="Computo del piano risorse" value={computo.id} onChange={e => setScelto(e.target.value)}>{letti.map(c => <option key={c.id} value={c.id}>{c.titolo ?? c.file_name}</option>)}</select>}
      <RisorseDelComputo key={computo.id} companyId={companyId} orderId={orderId} computoId={computo.id} />
    </>}
  </section>;
}
