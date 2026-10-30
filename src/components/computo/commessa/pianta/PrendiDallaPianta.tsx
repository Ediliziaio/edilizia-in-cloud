/**
 * «Prendi dalla pianta» su una voce del computo di commessa (Planimetrie, fase 4).
 *
 * Una finestra sola, dall'alto in basso: quale pianta → com'è adesso o dopo i lavori →
 * quale quantità → quali locali → le righe che nasceranno, con il totale della voce
 * prima e dopo. Niente si scrive finché non si preme «Aggiungi».
 */
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Map as IconaPianta } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { VoceComputo } from "@/lib/computo/alberoComputo";
import { numeroVoce } from "@/lib/computo/alberoComputo";
import { useElencoPlanimetrie, usePlanimetria } from "@/lib/planimetrie/archivio";
import {
  ETICHETTA_ORIGINE, QUANTITA_LOCALI, avvisoUnita, localiDelloStato, quantitaPianta, righeDaPianta, statiDellaPianta,
  unitaComputo, unitaLeggibile, voceDopo, type SceltaQuantita,
} from "@/lib/planimetrie/computo";
import { useAggiungiMisureDaPianta } from "@/hooks/useComputoPianta";
import { calcolaQuantita } from "../../../../../shared/planimetrie/quantita.ts";

const numero = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const selezione = "h-9 w-full rounded-md border bg-background px-2 text-sm";

export default function PrendiDallaPianta({ voce, uploadId, companyId, orderId, aperta, onChiudi }: {
  voce: VoceComputo; uploadId: string; companyId: string; orderId: string; aperta: boolean; onChiudi: () => void;
}) {
  const { data: piante = [], isLoading: elencoInCaricamento, error: erroreElenco } = useElencoPlanimetrie(aperta ? companyId : null);
  const diCommessa = piante.filter(p => p.order_id === orderId);
  const altre = piante.filter(p => p.order_id !== orderId);
  const [piantaScelta, setPiantaScelta] = useState<string | null>(null);
  const piantaId = piantaScelta ?? diCommessa[0]?.id ?? (piante.length === 1 ? piante[0].id : null);
  const { data: pianta, isLoading: piantaInCaricamento, error: errorePianta } = usePlanimetria(piantaId);
  const documento = pianta?.versione.documento;
  const mappa = documento ? calcolaQuantita(documento) : null;

  const stati = documento ? statiDellaPianta(documento) : [];
  const [statoScelto, setStatoScelto] = useState<string | null>(null);
  const stato = stati.find(s => s.chiave === statoScelto) ?? stati[0] ?? null;

  const scelte: SceltaQuantita[] = mappa && stato ? [...QUANTITA_LOCALI, ...quantitaPianta(mappa, stato.chiave)] : [];
  const [sceltaId, setSceltaId] = useState<string | null>(null);
  // Di partenza la prima quantità nell'unità della voce: mq → pavimento, m → battiscopa, mc → volume.
  const unitaVoce = unitaComputo(voce.unita_misura);
  const scelta = scelte.find(s => s.id === sceltaId) ?? scelte.find(s => s.unita === unitaVoce && s.id !== "perimetro_ml") ?? scelte[0] ?? null;

  const locali = documento && stato ? localiDelloStato(documento, stato.chiave) : [];
  const [esclusi, setEsclusi] = useState<Set<string>>(new Set());
  const scelti = locali.filter(l => !esclusi.has(l.id));
  const piuPiani = new Set(locali.map(l => l.livello)).size > 1;

  const esito = mappa && stato && scelta ? righeDaPianta({ mappa, stato, scelta, locali: scelti, negativa: voce.is_detrazione }) : null;
  const somma = esito ? esito.righe.reduce((s, r) => s + r.quantita, 0) : 0;
  const dopo = voceDopo(voce, somma);
  const stimate = esito?.righe.filter(r => r.origine === "stimata").length ?? 0;
  const avviso = scelta ? avvisoUnita(voce.unita_misura, scelta) : null;

  const aggiungi = useAggiungiMisureDaPianta(uploadId);
  const cambiaPianta = (id: string) => { setPiantaScelta(id); setStatoScelto(null); setSceltaId(null); setEsclusi(new Set()); };
  const conferma = () => {
    if (!esito || !pianta || !esito.righe.length) return;
    aggiungi.mutate({ voce, companyId, planimetriaId: pianta.riga.id, versione: pianta.versione.numero, righe: esito.righe }, {
      onSuccess: n => { toast.success(n === 1 ? "Aggiunta 1 riga dalla pianta" : `Aggiunte ${n} righe dalla pianta`); onChiudi(); },
      onError: e => toast.error(e instanceof Error ? e.message : "Righe non salvate."),
    });
  };
  const u = voce.unita_misura?.trim() ?? "";

  return (
    <Dialog open={aperta} onOpenChange={o => { if (!o) onChiudi(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Prendi le misure dalla pianta</DialogTitle>
          <DialogDescription>Voce {numeroVoce(voce)}: {voce.descrizione_breve.slice(0, 160)}</DialogDescription>
        </DialogHeader>

        {elencoInCaricamento && <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Cerco le piante…</p>}
        {erroreElenco && <p role="alert" className="text-sm text-rose-700">{(erroreElenco as Error).message}</p>}
        {!elencoInCaricamento && !erroreElenco && piante.length === 0 && (
          <p className="rounded-lg border bg-slate-50 p-3 text-sm text-slate-700">
            Non c'è ancora nessuna pianta. Disegnala o falla leggere da un PDF nella sezione Planimetrie, poi torna qui.
          </p>
        )}

        {piante.length > 0 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="pianta-scelta">1. Quale pianta</Label>
              <select id="pianta-scelta" className={selezione} value={piantaId ?? ""} onChange={e => cambiaPianta(e.target.value)}>
                {!piantaId && <option value="" disabled>Scegli la pianta</option>}
                {diCommessa.length > 0 && <optgroup label="Di questa commessa">{diCommessa.map(p => <option key={p.id} value={p.id}>{p.titolo}</option>)}</optgroup>}
                {altre.length > 0 && <optgroup label={diCommessa.length ? "Altre piante" : "Piante dell'azienda"}>{altre.map(p => <option key={p.id} value={p.id}>{p.titolo}</option>)}</optgroup>}
              </select>
              {pianta && <p className="text-xs text-slate-500">Versione {pianta.versione.numero} del {new Date(pianta.versione.created_at).toLocaleDateString("it-IT")}</p>}
            </div>

            {piantaInCaricamento && <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Apro la pianta…</p>}
            {errorePianta && <p role="alert" className="text-sm text-rose-700">{(errorePianta as Error).message}</p>}

            {stati.length > 1 && stato && (
              <fieldset className="space-y-1">
                <legend className="text-sm font-medium">2. Com'è adesso o dopo i lavori</legend>
                {stati.map(s => (
                  <label key={s.chiave} className="flex items-center gap-2 text-sm">
                    <input type="radio" name="stato-pianta" checked={stato.chiave === s.chiave} onChange={() => { setStatoScelto(s.chiave); setEsclusi(new Set()); }} />
                    {s.nome}
                  </label>
                ))}
                <p className="text-xs text-slate-500">Per demolire e togliere: com'è adesso. Per costruire e posare: dopo i lavori.</p>
              </fieldset>
            )}

            {scelta && (
              <div className="space-y-1">
                <Label htmlFor="quantita-scelta">{stati.length > 1 ? "3" : "2"}. Quale quantità</Label>
                <select id="quantita-scelta" className={selezione} value={scelta.id} onChange={e => setSceltaId(e.target.value)}>
                  <optgroup label="Per ogni stanza">
                    {QUANTITA_LOCALI.map(q => <option key={q.id} value={q.id}>{q.etichetta} ({unitaLeggibile(q.unita)})</option>)}
                  </optgroup>
                  {scelte.length > QUANTITA_LOCALI.length && (
                    <optgroup label="Per tutta la pianta">
                      {scelte.slice(QUANTITA_LOCALI.length).map(q => <option key={q.id} value={q.id}>{q.etichetta} ({unitaLeggibile(q.unita)})</option>)}
                    </optgroup>
                  )}
                </select>
                {avviso && <p className="flex items-start gap-1 text-xs text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{avviso}</p>}
              </div>
            )}

            {scelta?.per === "locale" && locali.length > 0 && (
              <fieldset className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <legend className="text-sm font-medium">{stati.length > 1 ? "4" : "3"}. Quali stanze</legend>
                  <div className="flex gap-1">
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEsclusi(new Set())}>Tutte</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEsclusi(new Set(locali.map(l => l.id)))}>Nessuna</Button>
                  </div>
                </div>
                <div className="grid gap-1 sm:grid-cols-2">
                  {locali.map(l => {
                    const q = mappa?.[`${stato!.chiave}:locale:${l.id}.${scelta.id}`];
                    return (
                      <label key={`${l.livello}-${l.id}`} className="flex items-center gap-2 rounded border px-2 py-1.5 text-sm">
                        <Checkbox checked={!esclusi.has(l.id)} onCheckedChange={v => setEsclusi(prev => { const n = new Set(prev); if (v) n.delete(l.id); else n.add(l.id); return n; })} />
                        <span className="min-w-0 flex-1 truncate">{l.nome}{piuPiani && <span className="text-xs text-slate-500"> · {l.livello}</span>}</span>
                        <span className="text-xs tabular-nums text-slate-600">{q ? `${numero(q.valore)} ${unitaLeggibile(q.unita)}` : "—"}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}
            {scelta?.per === "locale" && documento && locali.length === 0 && (
              <p className="text-sm text-slate-600">In questa pianta non ci sono ancora stanze chiuse.</p>
            )}

            {esito && (
              <section aria-label="Righe che verranno aggiunte" className="space-y-2 rounded-lg border bg-slate-50/60 p-3">
                <h4 className="text-sm font-semibold">Righe che verranno aggiunte ({esito.righe.length})</h4>
                {esito.righe.length > 0 ? (
                  <ul className="divide-y text-sm">
                    {esito.righe.map(r => (
                      <li key={r.chiavi.join()} className="flex items-center justify-between gap-2 py-1">
                        <span className="min-w-0">{r.descrizione}
                          {r.origine !== "rilevata" && <Badge variant="outline" className={`ml-2 ${r.origine === "stimata" ? "border-amber-300 text-amber-800" : ""}`}>{ETICHETTA_ORIGINE[r.origine]}</Badge>}
                        </span>
                        <span className="tabular-nums">{numero(r.quantita)}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-slate-600">Nessuna riga: scegli almeno una stanza.</p>}
                {esito.saltati.length > 0 && <p className="text-xs text-slate-600">Senza questa quantità, quindi saltate: {esito.saltati.join(", ")}.</p>}
                {stimate > 0 && (
                  <p className="flex items-start gap-1 text-xs text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {stimate === 1 ? "Una riga usa misure stimate" : `${stimate} righe usano misure stimate`}: la pianta non le ha misurate, controllale sul posto.</p>
                )}
                {esito.righe.length > 0 && (
                  <p className="border-t pt-2 text-sm">La voce passa da <strong className="tabular-nums">{numero(Number(voce.quantita ?? 0))}</strong> a <strong className="tabular-nums">{numero(dopo.quantita)} {u}</strong>.</p>
                )}
              </section>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onChiudi}>Annulla</Button>
          <Button type="button" onClick={conferma} disabled={!esito?.righe.length || aggiungi.isPending}>
            {aggiungi.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <IconaPianta className="mr-1 h-4 w-4" />}
            {esito?.righe.length === 1 ? "Aggiungi 1 riga" : `Aggiungi ${esito?.righe.length ?? 0} righe`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
