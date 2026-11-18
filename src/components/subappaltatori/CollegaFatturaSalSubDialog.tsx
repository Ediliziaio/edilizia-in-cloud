import { useRef, useState } from "react";
import { Link2, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { OfficeSelect } from "@/components/orders/OfficeSelect";
import { controllaFatturaSubappalto, imponibileFattura, proveTraccia, salDalTesto } from "@/lib/subappaltatori/controlloFatturaSubappalto";
import { fatturePerSalSub, type ContestoFattureSalSub, type FatturaContrattoSub } from "@/lib/subappaltatori/fattureSalContratto";
import { euroSub } from "@/lib/subappaltatori/lavoriMisure";

export type ConfermaFatturaSalSub = {
  fatturaId: string;
  salId: string | null;
  acconto: boolean;
  prove: ReturnType<typeof proveTraccia>;
};

const nome = (f: FatturaContrattoSub) => [f.tipo_documento === "TD04" ? "Nota di credito" : "Fattura", f.numero_fattura].filter(Boolean).join(" ");
const soloContratto = "contratto";

export function CollegaFatturaSalSubDialog({
  contesto, disponibili, salIniziale, fatturaIniziale, onConferma, onChiudi,
}: {
  contesto: ContestoFattureSalSub;
  disponibili: FatturaContrattoSub[];
  salIniziale?: string;
  fatturaIniziale?: FatturaContrattoSub;
  onConferma: (scelta: ConfermaFatturaSalSub) => Promise<void>;
  onChiudi: () => void;
}) {
  const { contratto, sal, collegate } = contesto;
  const [ricerca, setRicerca] = useState("");
  const [fatturaId, setFatturaId] = useState(fatturaIniziale?.id ?? "");
  const [destinazione, setDestinazione] = useState(salIniziale ?? "");
  const [errore, setErrore] = useState("");
  const [salvataggio, setSalvataggio] = useState(false);
  const inCorso = useRef(false);
  const fattura = fatturaIniziale ?? disponibili.find(f => f.id === fatturaId);
  const configurazione = { contratti: [contratto, ...(contesto.altriContratti ?? [])], sal, altreFatture: collegate };
  const imponibile = fattura ? imponibileFattura(fattura) : 0;
  const riepilogoSal = fatturePerSalSub(sal, collegate);
  const opzioniSal = riepilogoSal.map(({ sal: s }) => ({ value: s.id, label: `SAL ${s.numero_sal} · ${euroSub(Number(s.importo_netto ?? 0))} attesi` }));
  const proposta = fattura ? controllaFatturaSubappalto({ ...fattura, contratto_subappalto_id: contratto.id }, configurazione) : null;
  const destinazioneValida = destinazione === soloContratto || opzioniSal.some(o => o.value === destinazione);
  const suggerita = proposta?.salId && opzioniSal.some(o => o.value === proposta.salId)
    ? proposta.salId : soloContratto;
  const valore = destinazioneValida ? destinazione : destinazione ? "" : suggerita;
  const salScelto = riepilogoSal.find(r => r.sal.id === valore);
  const verifica = fattura ? controllaFatturaSubappalto({
    ...fattura, contratto_subappalto_id: contratto.id, sal_subappaltatore_id: salScelto?.sal.id ?? null,
  }, configurazione) : null;
  const giaCoperto = salScelto && imponibile > 0 && fattura && !fattura.sal_subappaltatore_id
    && salScelto.fatturato > 0 && salScelto.differenza <= 0;
  const citaSalValido = fattura && riepilogoSal.some(r => r.sal.numero_sal === salDalTesto(fattura.testo));
  const blocco = verifica?.problemi.find(p => p.blocca)?.testo
    ?? (giaCoperto ? "Questo SAL ha già fatture che coprono il netto atteso." : null)
    ?? (destinazione && !destinazioneValida ? "Il SAL selezionato non è più disponibile. Scegli un’altra destinazione." : null)
    ?? (valore === soloContratto && citaSalValido ? "La fattura cita un SAL verificato. Scegli il SAL indicato." : null);
  const filtro = ricerca.trim().toLocaleLowerCase("it");
  const visibili = disponibili.filter(f => [nome(f), f.cedente_ragione_sociale, f.data_fattura, euroSub(imponibileFattura(f))]
    .some(testo => testo?.toLocaleLowerCase("it").includes(filtro)));
  const chiudi = () => { if (!inCorso.current) onChiudi(); };
  const conferma = async () => {
    if (!fattura || !verifica || blocco || inCorso.current) return;
    inCorso.current = true;
    setSalvataggio(true);
    setErrore("");
    try {
      await onConferma({
        fatturaId: fattura.id, salId: salScelto?.sal.id ?? null,
        acconto: valore === soloContratto && verifica.acconto, prove: proveTraccia(verifica),
      });
      onChiudi();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Collegamento non riuscito. Riprova.");
      setSalvataggio(false);
    } finally {
      inCorso.current = false;
    }
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) chiudi(); }}>
      <DialogContent className="flex max-h-[90dvh] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-4 pb-3 pt-4 pr-12 text-left">
          <DialogTitle>Collega fattura ricevuta</DialogTitle>
          <DialogDescription>{contratto.numero_contratto ?? "Contratto di subappalto"}{fattura ? " · Verifica il collegamento" : " · Scegli la fattura"}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-3 overflow-y-auto p-4">
          {fattura ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
                <div><p className="font-medium">{nome(fattura)}</p><p className="text-xs text-muted-foreground">{fattura.cedente_ragione_sociale}</p></div>
                <div className="text-right"><p className="text-xs text-muted-foreground">Imponibile</p><p className="font-semibold tabular-nums">{euroSub(imponibile)}</p></div>
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Collega a</p>
                <OfficeSelect label="Collega a" value={valore} placeholder="Scegli il SAL o il contratto" disabled={salvataggio}
                  onValueChange={v => { setDestinazione(v); setErrore(""); }}
                  options={[...opzioniSal, { value: soloContratto, label: "Solo al contratto" }]} />
              </div>
              {salScelto && (
                <p className="text-sm text-muted-foreground">
                  Imponibile atteso <strong className="text-foreground">{euroSub(Number(salScelto.sal.importo_netto ?? 0))}</strong>
                  {salScelto.fatturato > 0 && <> · Già collegato {euroSub(salScelto.fatturato)}</>}
                </p>
              )}
              {valore === soloContratto && verifica?.acconto && <p className="text-sm text-muted-foreground">Collegamento come fattura d’acconto.</p>}
              {blocco && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{blocco}</p>}
              {!blocco && verifica?.problemi.filter(p => !p.blocca && p.codice !== "sal_mancante").map(p => (
                <p key={p.codice + p.testo} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{p.testo}</p>
              ))}
              {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
            </>
          ) : (
            <>
              {disponibili.length > 5 && (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
                  <Input aria-label="Cerca fattura" placeholder="Numero, fornitore o importo" value={ricerca} onChange={e => setRicerca(e.target.value)} className="pl-9" />
                </div>
              )}
              {visibili.length ? <ul className="divide-y rounded-lg border">
                {visibili.map(f => (
                  <li key={f.id}><button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                    onClick={() => { setFatturaId(f.id); setDestinazione(salIniziale ?? ""); }}>
                    <span className="min-w-0 break-words"><span className="block font-medium">{nome(f)}</span><span className="text-xs text-muted-foreground">{f.data_fattura?.split("-").reverse().join("/")}</span></span>
                    <span className="shrink-0 tabular-nums">{euroSub(imponibileFattura(f))}</span>
                  </button></li>
                ))}
              </ul> : <p className="text-sm text-muted-foreground">{disponibili.length ? "Nessuna fattura corrisponde alla ricerca." : "Nessuna fattura disponibile per questa partita IVA."}</p>}
            </>
          )}
        </div>
        <DialogFooter className="border-t px-4 py-3">
          {fattura && !fatturaIniziale ? <Button variant="outline" disabled={salvataggio} onClick={() => { setFatturaId(""); setErrore(""); }}>Indietro</Button>
            : <Button variant="outline" disabled={salvataggio} onClick={chiudi}>Chiudi</Button>}
          {fattura && <Button disabled={salvataggio || !!blocco} onClick={() => void conferma()}>
            {salvataggio ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}Conferma collegamento
          </Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
