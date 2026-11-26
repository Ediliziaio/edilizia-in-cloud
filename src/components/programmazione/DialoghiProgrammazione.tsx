/**
 * Le finestre della Programmazione (26/11/2026): «Riempi i buchi»,
 * «Messaggi per chi non ha l'app», «Porta a domani» e la stampa.
 */
import { useState } from "react";
import { Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { coloreIntervento } from "@/components/programmazione/aspetto";
import {
  agendaPersone, ordina, testoProgramma, type Giornata, type Intervento, type MezzoGiorno, type PersonaGiorno, type Suggerimento,
} from "@/lib/programmazione/giornata";

// ── Riempi i buchi ──────────────────────────────────────────────────────────

export function RiempiBuchi({ aperto, onChiudi, suggerimenti, giornata, personaDi, onApplica }: {
  aperto: boolean;
  onChiudi: () => void;
  suggerimenti: Suggerimento[];
  giornata: Giornata;
  personaDi: Map<string, PersonaGiorno>;
  onApplica: (scelti: Suggerimento[]) => void;
}) {
  const chiave = (s: Suggerimento) => `${s.interventoId}:${s.personaId}`;
  const [tolti, setTolti] = useState<Set<string>>(new Set());
  const perIntervento = new Map<string, Suggerimento[]>();
  for (const s of suggerimenti) perIntervento.set(s.interventoId, [...(perIntervento.get(s.interventoId) ?? []), s]);
  const scelti = suggerimenti.filter((s) => !tolti.has(chiave(s)));
  return (
    <Dialog open={aperto} onOpenChange={(v) => !v && onChiudi()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Riempi i buchi</DialogTitle>
          <DialogDescription>
            Chi è libero, dove manca qualcuno. Prima la stessa squadra e chi è previsto lì, poi le abilitazioni e la vicinanza. Mai assenti né documenti scaduti.
          </DialogDescription>
        </DialogHeader>
        {suggerimenti.length === 0 ? (
          <div className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-700">
            <p className="font-medium">Nessuno da proporre.</p>
            <p className="mt-1 text-xs text-slate-500">
              O non mancano persone, o chi esce ha già un intervento a quell'ora. Un intervento senza orario vale per tutto il giorno:
              dagli un orario (vista Giorno) e la stessa persona potrà andare anche altrove.
            </p>
          </div>
        ) : (
          <div className="max-h-[55vh] space-y-2 overflow-y-auto">
            {[...perIntervento.entries()].map(([id, lista]) => {
              const i = giornata.interventi.find((x) => x.id === id)!;
              return (
                <div key={id} className="rounded-lg border-l-[3px] bg-slate-50 px-2.5 py-1.5" style={{ borderLeftColor: coloreIntervento(i) }}>
                  <p className="truncate text-xs font-semibold text-slate-800">{i.inizio ? `${i.inizio} · ` : ""}{i.titolo}</p>
                  {lista.map((s) => {
                    const p = personaDi.get(s.personaId);
                    const ok = !tolti.has(chiave(s));
                    return (
                      <label key={chiave(s)} className="mt-1 flex cursor-pointer items-center gap-2 text-xs">
                        <input type="checkbox" className="accent-orange-500" checked={ok}
                          onChange={() => setTolti((t) => { const n = new Set(t); if (ok) n.add(chiave(s)); else n.delete(chiave(s)); return n; })} />
                        <span className="font-medium text-slate-800">{p ? `${p.nome} ${p.cognome}` : "?"}</span>
                        <span className="truncate text-[11px] text-slate-500">{s.motivo}</span>
                      </label>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onChiudi}>Chiudi</Button>
          {suggerimenti.length > 0 && (
            <Button size="sm" className="bg-orange-500 hover:bg-orange-600" disabled={scelti.length === 0} onClick={() => { onApplica(scelti); onChiudi(); }}>
              Metti {scelti.length} {scelti.length === 1 ? "persona" : "persone"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Messaggi per chi non ha l'app ───────────────────────────────────────────

function numeroWhatsApp(tel: string | null | undefined): string | null {
  const cifre = (tel ?? "").replace(/[^\d+]/g, "").replace(/^\+/, "").replace(/^00/, "");
  if (cifre.length < 8) return null;
  return cifre.length <= 10 && cifre.startsWith("3") ? `39${cifre}` : cifre;
}

export function MessaggiSenzaApp({ aperto, onChiudi, giornata, personaDi, mezzoDi, giornoTesto, tutti }: {
  aperto: boolean;
  onChiudi: () => void;
  giornata: Giornata;
  personaDi: Map<string, PersonaGiorno>;
  mezzoDi: Map<string, MezzoGiorno>;
  giornoTesto: string;
  /** true = a tutti, non solo a chi non ha l'app. */
  tutti?: boolean;
}) {
  const [aTutti, setATutti] = useState(!!tutti);
  const agenda = agendaPersone(giornata);
  const destinatari = [...agenda.keys()].map((id) => personaDi.get(id)).filter((p): p is PersonaGiorno => !!p && (aTutti || !p.haApp));
  const nomeDi = (id: string) => { const p = personaDi.get(id); return p ? `${p.nome} ${p.cognome?.[0] ? `${p.cognome[0]}.` : ""}`.trim() : "?"; };
  const mezzo = (id: string) => mezzoDi.get(id)?.nome ?? "mezzo";
  return (
    <Dialog open={aperto} onOpenChange={(v) => !v && onChiudi()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Il programma da mandare</DialogTitle>
          <DialogDescription>Un messaggio pronto per ciascuno. «WhatsApp» lo apre già scritto: lo mandi tu dal tuo telefono o computer.</DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" className="accent-orange-500" checked={aTutti} onChange={(e) => setATutti(e.target.checked)} />
          Anche a chi ha l'app
        </label>
        <div className="max-h-[55vh] space-y-2 overflow-y-auto">
          {destinatari.length === 0 && <p className="rounded-lg bg-emerald-50 px-3 py-4 text-center text-sm text-emerald-800">Tutti quelli in programma hanno l'app: ricevono la notifica con «Pubblica».</p>}
          {destinatari.map((p) => {
            const testo = testoProgramma(p.nome, giornoTesto, agenda.get(p.id)!, nomeDi, mezzo);
            const wa = numeroWhatsApp(p.telefono);
            return (
              <div key={p.id} className="rounded-lg border border-slate-200 p-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-800">{p.nome} {p.cognome}{!p.haApp && <span className="ml-1.5 text-[10px] font-normal text-amber-700">senza app</span>}</span>
                  <span className="flex gap-1">
                    <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={() => { void navigator.clipboard.writeText(testo); toast.success("Messaggio copiato"); }}>
                      <Copy className="h-3 w-3" /> Copia
                    </Button>
                    {wa ? (
                      <Button asChild size="sm" className="h-7 gap-1 bg-emerald-600 text-[11px] hover:bg-emerald-700">
                        <a href={`https://wa.me/${wa}?text=${encodeURIComponent(testo)}`} target="_blank" rel="noreferrer"><MessageCircle className="h-3 w-3" /> WhatsApp</a>
                      </Button>
                    ) : <span className="self-center text-[10px] text-slate-400">nessun telefono</span>}
                  </span>
                </div>
                <pre className="whitespace-pre-wrap rounded bg-slate-50 px-2 py-1.5 font-sans text-[11px] text-slate-700">{testo}</pre>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Porta a domani ──────────────────────────────────────────────────────────

export function PortaADomani({ aperto, onChiudi, giornata, domaniTesto, onConferma }: {
  aperto: boolean;
  onChiudi: () => void;
  giornata: Giornata;
  domaniTesto: string;
  onConferma: (interventi: Intervento[]) => void;
}) {
  // Di solito si continua sui cantieri e sulle commissioni non fatte; sopralluoghi e assistenze no.
  const [scelti, setScelti] = useState<Set<string>>(() => new Set(giornata.interventi.filter((i) => i.tipo === "commessa").map((i) => i.id)));
  return (
    <Dialog open={aperto} onOpenChange={(v) => !v && onChiudi()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Porta a {domaniTesto}</DialogTitle>
          <DialogDescription>Gli interventi scelti, con persone, mezzi e orari, si aggiungono al giorno dopo. Lì si ritoccano.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] space-y-1 overflow-y-auto">
          {ordina(giornata.interventi).map((i) => (
            <label key={i.id} className={cn("flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs ring-1", scelti.has(i.id) ? "bg-orange-50 ring-orange-200" : "ring-slate-200")}>
              <input type="checkbox" className="accent-orange-500" checked={scelti.has(i.id)}
                onChange={(e) => setScelti((s) => { const n = new Set(s); if (e.target.checked) n.add(i.id); else n.delete(i.id); return n; })} />
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: coloreIntervento(i) }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{i.inizio ? `${i.inizio} · ` : ""}{i.titolo}</span>
              <span className="shrink-0 text-[10px] text-slate-400">{i.persone.length} pers.</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onChiudi}>Annulla</Button>
          <Button size="sm" className="bg-orange-500 hover:bg-orange-600" disabled={scelti.size === 0}
            onClick={() => { onConferma(giornata.interventi.filter((i) => scelti.has(i.id))); onChiudi(); }}>
            Porta {scelti.size} a {domaniTesto}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Stampa ──────────────────────────────────────────────────────────────────

/** Il foglio della giornata: si vede solo in stampa (window.print). */
export function FoglioStampa({ giornata, titolo, personaDi, mezzoDi }: {
  giornata: Giornata;
  titolo: string;
  personaDi: Map<string, PersonaGiorno>;
  mezzoDi: Map<string, MezzoGiorno>;
}) {
  return (
    <>
      <style>{`@media print { body * { visibility: hidden !important; } #foglio-programmazione, #foglio-programmazione * { visibility: visible !important; } #foglio-programmazione { position: absolute; inset: 0 auto auto 0; width: 100%; display: block !important; } @page { margin: 12mm; } }`}</style>
      <div id="foglio-programmazione" className="hidden text-[11pt] text-black">
        <h1 className="mb-1 text-[16pt] font-bold capitalize">Programma · {titolo}</h1>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-black text-left text-[9pt] uppercase">
              <th className="w-20 py-1">Orario</th><th className="py-1">Dove</th><th className="py-1">Chi</th><th className="w-40 py-1">Mezzi</th>
            </tr>
          </thead>
          <tbody>
            {ordina(giornata.interventi).map((i) => (
              <tr key={i.id} className="border-b border-gray-400 align-top">
                <td className="py-1.5 pr-2 tabular-nums">{i.inizio ? `${i.inizio}${i.fine ? `–${i.fine}` : ""}` : "In giornata"}</td>
                <td className="py-1.5 pr-2"><strong>{i.titolo}</strong>{i.codice ? ` (${i.codice})` : ""}{i.indirizzo ? <><br />{i.indirizzo}</> : null}{i.note ? <><br /><em>{i.note}</em></> : null}</td>
                <td className="py-1.5 pr-2">{i.persone.map((p) => { const x = personaDi.get(p); return x ? `${x.nome} ${x.cognome}${i.capoId === p ? " (capo)" : ""}` : ""; }).filter(Boolean).join(", ") || "—"}</td>
                <td className="py-1.5">{i.mezzi.map((m) => mezzoDi.get(m)?.nome).filter(Boolean).join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
