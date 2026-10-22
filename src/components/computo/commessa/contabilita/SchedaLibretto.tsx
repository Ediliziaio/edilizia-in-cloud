/**
 * Libretto delle misure: registrazioni di cantiere sulle voci del computo
 * contrattuale, con le righe di misura come nel computo (par.ug., lung., larg.,
 * H/peso), annotazioni, foto e firma del direttore dei lavori. Progressivo per
 * voce e avviso quando si supera la quantità di contratto. Una registrazione
 * non ancora entrata in un SAL si modifica; ogni modifica o cancellazione
 * resta nello storico (chi, quando, cosa è cambiato).
 */
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Camera, FileDown, History, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  numeroDigitato, progressiviLibretto, quantitaRighe, riassuntoModificaLibretto, type RigaMisura, type VoceContratto,
} from "@/lib/computo/contabilitaLavori";
import {
  apriAllegato, useEliminaRegistrazione, useFirmaRegistrazione, useLibretto, useModificaRegistrazione, useRegistraMisura, useSal,
  useStoricoLibretto, type ModificaLibrettoDb, type RegistrazioneLibrettoDb,
} from "@/hooks/useContabilitaLavori";
import { comeRegistrazioni, dataIt, intestazioneDa, oggi, quant, type PropsScheda } from "./comune";

type RigaBozza = { descrizione: string; parti_uguali: string; lunghezza: string; larghezza: string; altezza_peso: string; quantita: string };
const rigaVuota = (): RigaBozza => ({ descrizione: "", parti_uguali: "", lunghezza: "", larghezza: "", altezza_peso: "", quantita: "" });
const numero = numeroDigitato;
const testo = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));
const daRiga = (m: RigaMisura): RigaBozza => ({ descrizione: m.descrizione ?? "", parti_uguali: testo(m.parti_uguali), lunghezza: testo(m.lunghezza),
  larghezza: testo(m.larghezza), altezza_peso: testo(m.altezza_peso), quantita: testo(m.quantita) });
const aRiga = (r: RigaBozza): RigaMisura => ({ descrizione: r.descrizione.trim() || null, parti_uguali: numero(r.parti_uguali), lunghezza: numero(r.lunghezza),
  larghezza: numero(r.larghezza), altezza_peso: numero(r.altezza_peso), quantita: numero(r.quantita) });

/** Nuova registrazione, o modifica di `iniziale` (non ancora in un SAL). */
function FormRegistrazione({ contratto, progressivoVoce, orderId, companyId, direttore, onFatto, iniziale }: {
  contratto: VoceContratto[]; progressivoVoce: Map<string, number>; orderId: string; companyId: string; direttore: string | null; onFatto: () => void;
  iniziale?: RegistrazioneLibrettoDb;
}) {
  const registra = useRegistraMisura(orderId, companyId);
  const modifica = useModificaRegistrazione(orderId, companyId);
  const inCorso = registra.isPending || modifica.isPending;
  const [cerca, setCerca] = useState("");
  const [voceId, setVoceId] = useState(iniziale?.voce_id ?? "");
  const [data, setData] = useState(iniziale?.data ?? oggi());
  const [righe, setRighe] = useState<RigaBozza[]>(iniziale?.righe.length ? iniziale.righe.map(daRiga) : [rigaVuota()]);
  const [annotazioni, setAnnotazioni] = useState(iniziale?.annotazioni ?? "");
  const [firmatario, setFirmatario] = useState(iniziale ? iniziale.firmatario ?? "" : direttore ?? "");
  const [firma, setFirma] = useState(!!iniziale?.firmato_at);
  const [foto, setFoto] = useState<File[]>([]);
  const c = cerca.trim().toLowerCase();
  const opzioni = c ? contratto.filter(v => `${v.numero} ${v.tariffa} ${v.descrizione}`.toLowerCase().includes(c)) : contratto;
  const voce = contratto.find(v => v.voce_id === voceId);
  const misure = righe.map(aRiga);
  const invalide = misure.some(m => [m.parti_uguali, m.lunghezza, m.larghezza, m.altezza_peso, m.quantita].some(x => Number.isNaN(x)));
  const quantita = invalide ? 0 : quantitaRighe(misure);
  // In modifica la registrazione stessa non conta fra quelle già fatte.
  const gia = voce ? (progressivoVoce.get(voce.radice) ?? 0) - (iniziale && iniziale.voce_radice === voce.radice ? iniziale.quantita : 0) : 0;
  const dopo = voce ? gia + quantita : 0;
  const oltre = voce && Math.abs(dopo) > Math.abs(voce.quantita) + 1e-9;
  const salva = () => {
    if (!voce) { toast.error("Scegli la voce del computo."); return; }
    if (invalide) { toast.error("Ci sono misure non valide: usa la virgola per i decimali."); return; }
    if (!quantita) { toast.error("La registrazione non ha quantità."); return; }
    const dati = { voce_id: voce.voce_id, data, righe: misure.filter(m => quantitaRighe([m]) !== 0 || m.descrizione), annotazioni: annotazioni.trim() || null,
      firmatario: firmatario.trim() || null, firma: firma && !!firmatario.trim(), foto };
    if (iniziale) {
      modifica.mutate({ ...dati, id: iniziale.id, allegati: iniziale.allegati, giaFirmata: !!iniziale.firmato_at }, {
        onSuccess: () => { toast.success(`Registrazione n. ${iniziale.numero} modificata`, { description: "La modifica resta nello storico." }); onFatto(); },
        onError: e => toast.error(e instanceof Error ? e.message : "Modifica non riuscita."),
      });
      return;
    }
    registra.mutate(dati, {
      onSuccess: () => { toast.success("Misura registrata"); onFatto(); },
      onError: e => toast.error(e instanceof Error ? e.message : "Registrazione non riuscita."),
    });
  };
  const campo = (i: number, k: keyof RigaBozza, etichetta: string, largo = false) => (
    <Input aria-label={`${etichetta}, riga ${i + 1}`} placeholder={etichetta} value={righe[i][k]} inputMode={largo ? undefined : "decimal"}
      className={largo ? "h-8 min-w-[10rem] flex-1" : "h-8 w-20 text-right"}
      onChange={e => setRighe(rr => rr.map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r)))} />
  );
  return (
    <div className="space-y-3 rounded-lg border bg-slate-50/60 p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
        <div className="space-y-1">
          <Label htmlFor="libretto-voce">Voce del computo contrattuale</Label>
          <Input type="search" placeholder="Cerca per numero, tariffa o descrizione" value={cerca} onChange={e => setCerca(e.target.value)} aria-label="Cerca la voce" className="h-8" />
          <select id="libretto-voce" value={voceId} onChange={e => setVoceId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm" size={Math.min(6, Math.max(2, opzioni.length))}>
            {opzioni.slice(0, 300).map(v => <option key={v.voce_id} value={v.voce_id}>{v.numero} · {v.tariffa} · {v.descrizione.slice(0, 110)}</option>)}
          </select>
        </div>
        <div className="space-y-1"><Label htmlFor="libretto-data">Data</Label><Input id="libretto-data" type="date" value={data} onChange={e => setData(e.target.value)} className="h-8" /></div>
      </div>
      {voce && (
        <p className="text-xs text-slate-600">Contratto: <strong>{quant(voce.quantita)} {voce.unita_misura}</strong> · già registrati {quant(gia)} · dopo questa {quant(dopo)} {voce.unita_misura}
          {voce.a_corpo && " · voce a corpo: registra la quota eseguita (es. 0,25 = 25%)"}</p>
      )}
      <div className="space-y-1">
        <p className="text-sm font-medium">Righe di misura</p>
        {righe.map((_, i) => (
          <div key={i} className="flex flex-wrap items-center gap-1">
            {campo(i, "descrizione", "Descrizione (es. piano terra, vano scala)", true)}
            {campo(i, "parti_uguali", "par.ug.")}{campo(i, "lunghezza", "lung.")}{campo(i, "larghezza", "larg.")}{campo(i, "altezza_peso", "H/peso")}
            {campo(i, "quantita", "quantità")}
            <span className="w-20 text-right text-xs tabular-nums text-slate-600">{invalide ? "—" : quant(quantitaRighe([misure[i]]))}</span>
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={`Togli la riga ${i + 1}`} disabled={righe.length === 1}
              onClick={() => setRighe(rr => rr.filter((__, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => setRighe(rr => [...rr, rigaVuota()])}><Plus className="mr-1 h-4 w-4" />Riga</Button>
          <span className="text-sm">Quantità della registrazione: <strong className="tabular-nums">{quant(quantita)} {voce?.unita_misura}</strong></span>
        </div>
        <p className="text-xs text-slate-500">Quantità = par.ug. × lung. × larg. × H/peso (i campi compilati); se scrivi la quantità vale quella. Una riga negativa detrae.</p>
      </div>
      {oltre && <p role="alert" className="flex items-center gap-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0" />Si supera la quantità di contratto di {quant(Math.abs(dopo) - Math.abs(voce!.quantita))} {voce!.unita_misura}: serve una perizia di variante o l'ordine del DL.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="libretto-note">Annotazioni</Label><Textarea id="libretto-note" rows={2} value={annotazioni} onChange={e => setAnnotazioni(e.target.value)} /></div>
        <div className="space-y-2">
          <div className="space-y-1"><Label htmlFor="libretto-firmatario">Direttore dei lavori / firmatario</Label>
            <Input id="libretto-firmatario" value={firmatario} onChange={e => setFirmatario(e.target.value)} className="h-8" /></div>
          {iniziale?.firmato_at
            ? <p className="text-sm text-emerald-800">Firmata il {dataIt(iniziale.firmato_at)}: la modifica resta nello storico.</p>
            : <label className="flex items-center gap-2 text-sm"><Checkbox checked={firma} onCheckedChange={v => setFirma(v === true)} disabled={!firmatario.trim()} />Misura firmata dal direttore dei lavori</label>}
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"><Camera className="h-4 w-4" />
            <span className="underline">{foto.length ? `${foto.length} foto scelte` : iniziale?.allegati.length ? `Aggiungi foto (ne ha ${iniziale.allegati.length})` : "Aggiungi foto"}</span>
            <input type="file" accept="image/*,application/pdf" multiple className="sr-only" onChange={e => setFoto(Array.from(e.target.files ?? []))} /></label>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onFatto}>Annulla</Button>
        <Button type="button" onClick={salva} disabled={inCorso}>{inCorso && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{iniziale ? "Salva le modifiche" : "Registra"}</Button>
      </div>
    </div>
  );
}

export default function SchedaLibretto({ computo, contratto, orderId, companyId, canEdit, impostazioni, orderLabel }: PropsScheda) {
  const confirm = useConfirm();
  const { data: libretto = [], isLoading } = useLibretto(orderId);
  const { data: salDati } = useSal(orderId);
  const elimina = useEliminaRegistrazione(orderId);
  const firma = useFirmaRegistrazione(orderId);
  const { data: storico = [] } = useStoricoLibretto(orderId);
  const [nuova, setNuova] = useState(false);
  const [inModifica, setInModifica] = useState<string | null>(null);
  const [storiaAperta, setStoriaAperta] = useState<string | null>(null);
  const [storicoTutto, setStoricoTutto] = useState(false);
  const perRegistrazione = new Map<string, ModificaLibrettoDb[]>();
  for (const m of storico) perRegistrazione.set(m.libretto_id, [...(perRegistrazione.get(m.libretto_id) ?? []), m]);
  const numeroVoce = (id: string) => contratto.find(v => v.voce_id === id)?.numero ?? "?";
  const elencoStorico = (voci: ModificaLibrettoDb[], conNumero: boolean) => (
    <ul className="space-y-0.5 rounded border bg-slate-50 p-2 text-xs text-slate-700">
      {voci.map(m => (
        <li key={m.id}>
          <span className="tabular-nums text-slate-500">{new Date(m.modificato_at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}</span>
          {" · "}{m.autore ?? "utente non più presente"}
          {conNumero && <> · n. {m.numero}</>}
          {" · "}{riassuntoModificaLibretto(m.prima, m.dopo, numeroVoce).join(" · ") || "nessuna differenza nelle misure"}
        </li>
      ))}
    </ul>
  );
  const [filtro, setFiltro] = useState("");
  const [stampa, setStampa] = useState(false);
  const perRadice = new Map(contratto.map(v => [v.radice, v]));
  const progressivi = progressiviLibretto(comeRegistrazioni(libretto), contratto);
  const totaliVoce = new Map<string, number>();
  for (const r of libretto) totaliVoce.set(r.voce_radice, (totaliVoce.get(r.voce_radice) ?? 0) + r.quantita);
  const numeroSal = new Map((salDati?.sal ?? []).map(s => [s.id, s.numero]));
  const f = filtro.trim().toLowerCase();
  const visibili = [...libretto].reverse().filter(r => !f || `${perRadice.get(r.voce_radice)?.numero} ${perRadice.get(r.voce_radice)?.descrizione} ${r.annotazioni ?? ""}`.toLowerCase().includes(f));

  const stampaPdf = async () => {
    setStampa(true);
    try {
      const { stampaLibretto } = await import("@/lib/computo/stampeContabilita");
      await stampaLibretto(libretto.map(r => {
        const v = perRadice.get(r.voce_radice);
        return { numero: r.numero, data: r.data, voce: v?.numero ?? "?", tariffa: v?.tariffa ?? "", descrizione: v?.descrizione ?? "", unita_misura: v?.unita_misura ?? "",
          righe: r.righe, quantita: r.quantita, annotazioni: r.annotazioni, firmatario: r.firmatario, firmato: !!r.firmato_at,
          progressivo: progressivi.get(r.id), sal: r.sal_id ? numeroSal.get(r.sal_id) ?? null : null };
      }), intestazioneDa(computo, impostazioni, orderLabel));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Stampa non riuscita."); } finally { setStampa(false); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-base">Libretto delle misure <span className="text-sm font-normal text-slate-500">· {libretto.length} registrazioni</span></CardTitle>
        <div className="flex flex-wrap gap-2">
          {libretto.length > 0 && <Button type="button" size="sm" variant="outline" onClick={stampaPdf} disabled={stampa}>
            {stampa ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileDown className="mr-1 h-4 w-4" />}PDF</Button>}
          {storico.length > 0 && <Button type="button" size="sm" variant="outline" aria-expanded={storicoTutto} onClick={() => setStoricoTutto(v => !v)}>
            <History className="mr-1 h-4 w-4" />Storico ({storico.length})</Button>}
          {canEdit && !nuova && <Button type="button" size="sm" onClick={() => setNuova(true)}><Plus className="mr-1 h-4 w-4" />Nuova misura</Button>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {storicoTutto && (
          <section aria-label="Storico delle modifiche del libretto" className="space-y-1">
            <p className="text-sm font-medium">Storico delle modifiche e delle cancellazioni</p>
            {elencoStorico(storico, true)}
          </section>
        )}
        {nuova && <FormRegistrazione contratto={contratto} progressivoVoce={totaliVoce} orderId={orderId} companyId={companyId}
          direttore={impostazioni.direttore_lavori} onFatto={() => setNuova(false)} />}
        {isLoading ? <div className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Carico il libretto…</div>
          : libretto.length === 0 ? <p className="text-sm text-slate-600">Nessuna misura registrata. Ogni registrazione indica la voce del computo, le misure prese in cantiere e chi le ha firmate.</p> : (
          <>
            <Input type="search" value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Cerca per voce o annotazione" aria-label="Cerca nel libretto" className="sm:w-80" />
            <ul className="divide-y rounded-lg border text-sm">
              {visibili.map(r => {
                const v = perRadice.get(r.voce_radice);
                const p = progressivi.get(r.id);
                const sal = r.sal_id ? numeroSal.get(r.sal_id) : null;
                const modifiche = perRegistrazione.get(r.id) ?? [];
                if (inModifica === r.id) {
                  return (
                    <li key={r.id} className="space-y-1 px-3 py-2">
                      <p className="text-sm font-medium">Modifica della registrazione n. {r.numero}</p>
                      <FormRegistrazione contratto={contratto} progressivoVoce={totaliVoce} orderId={orderId} companyId={companyId}
                        direttore={impostazioni.direttore_lavori} iniziale={r} onFatto={() => setInModifica(null)} />
                    </li>
                  );
                }
                return (
                  <li key={r.id} className="space-y-1 px-3 py-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium"><span className="tabular-nums text-slate-500">n. {r.numero} · {new Date(`${r.data}T12:00:00`).toLocaleDateString("it-IT")}</span> · voce {v?.numero ?? "?"} <span className="font-normal text-slate-700">{v?.descrizione.slice(0, 120)}</span></p>
                        <p className="text-xs text-slate-600">
                          {r.righe.map(m => m.descrizione).filter(Boolean).join(" · ")}
                          {r.annotazioni && <> · <em>{r.annotazioni}</em></>}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold tabular-nums">{quant(r.quantita)} {v?.unita_misura}</p>
                        {p && <p className="text-xs tabular-nums text-slate-500">progressivo {quant(p.progressivo)} / {quant(p.quantita_contratto)}</p>}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {p?.eccedenza ? <Badge variant="outline" className="border-amber-300 text-amber-800"><AlertTriangle className="mr-1 h-3 w-3" />oltre il contratto di {quant(p.eccedenza)}</Badge> : null}
                      {r.firmato_at ? <Badge variant="outline" className="border-emerald-300 text-emerald-800">Firmata · {r.firmatario}</Badge>
                        : <Badge variant="outline">Da firmare{r.firmatario ? ` · ${r.firmatario}` : ""}</Badge>}
                      {sal && <Badge variant="outline" className="border-sky-300 text-sky-800">SAL n. {sal}</Badge>}
                      {r.allegati.map(a => <button key={a.path} type="button" className="text-xs underline" onClick={() => apriAllegato(a.path).catch(e => toast.error(e.message))}>{a.nome}</button>)}
                      {canEdit && !r.sal_id && !r.firmato_at && r.firmatario && (
                        <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => firma.mutate({ id: r.id, firmatario: r.firmatario! }, { onError: e => toast.error(e.message) })}>Segna firmata</Button>
                      )}
                      {modifiche.length > 0 && (
                        <Button type="button" size="sm" variant="ghost" className="h-7" aria-expanded={storiaAperta === r.id}
                          onClick={() => setStoriaAperta(storiaAperta === r.id ? null : r.id)}>
                          <History className="mr-1 h-3.5 w-3.5" />Modificata {modifiche.length === 1 ? "una volta" : `${modifiche.length} volte`}
                        </Button>
                      )}
                      {canEdit && !r.sal_id && (
                        <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => { setNuova(false); setInModifica(r.id); }}>
                          <Pencil className="mr-1 h-3.5 w-3.5" />Modifica
                        </Button>
                      )}
                      {canEdit && !r.sal_id && (
                        <Button type="button" size="sm" variant="ghost" className="h-7 text-rose-700" onClick={async () => {
                          if (await confirm({ title: `Eliminare la registrazione n. ${r.numero}?`, description: "Si cancellano le misure e le foto allegate. Nello storico resta cosa c'era.", confirmLabel: "Elimina", variant: "destructive" })) {
                            elimina.mutate(r, { onError: e => toast.error(e.message) });
                          }
                        }}>Elimina</Button>
                      )}
                    </div>
                    {storiaAperta === r.id && elencoStorico(modifiche, false)}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
