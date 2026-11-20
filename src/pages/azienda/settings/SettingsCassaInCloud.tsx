import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ReceiptText } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { ARCHIVIO_CASSA, chiaveQueryCassa, invocaCassa, useCollegamentiCassa } from "@/lib/cassaInCloud";
import type { CollegamentoCassa, PuntoVenditaCassa } from "../../../../shared/cassaInCloud";

function ConfiguraCassa({ companyId }: { companyId: string }) {
  const permessi = usePermissions();
  const puoGestire = !permessi.isLoading && permessi.canEditSettingsIntegrations && !permessi.solaLettura;
  const collegamenti = useCollegamentiCassa(companyId);
  const queryClient = useQueryClient();
  const [chiave, setChiave] = useState("");
  const [punti, setPunti] = useState<PuntoVenditaCassa[] | null>(null);
  const [puntoId, setPuntoId] = useState("");
  const [occupato, setOccupato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [daScollegare, setDaScollegare] = useState<CollegamentoCassa | null>(null);
  const punto = punti?.find((p) => p.id === puntoId && p.compatibile);
  const esistente = collegamenti.data?.some((p) => p.punto_vendita_id === puntoId);

  async function avvia(operazione: () => Promise<void>) {
    if (occupato || !puoGestire) return;
    setOccupato(true);
    setErrore(null);
    try {
      await operazione();
    } catch (error) {
      setErrore(error instanceof Error ? error.message : "Operazione non riuscita.");
    } finally {
      setOccupato(false);
    }
  }

  function verifica(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chiave.trim()) return;
    void avvia(async () => {
      setPunti(null);
      setPuntoId("");
      const risultato = await invocaCassa<{ punti: PuntoVenditaCassa[] }>(companyId, "verifica", { api_key: chiave });
      setPunti(risultato.punti);
      const compatibili = risultato.punti.filter((p) => p.compatibile);
      if (compatibili.length === 1) setPuntoId(compatibili[0].id);
    });
  }

  function collega() {
    if (!punto || !chiave.trim()) return;
    void avvia(async () => {
      await invocaCassa(companyId, "collega", { api_key: chiave, punto_vendita_id: punto.id });
      setChiave("");
      setPunti(null);
      setPuntoId("");
      await queryClient.invalidateQueries({ queryKey: chiaveQueryCassa(companyId) });
      toast.success(`${punto.nome} collegato.`);
    });
  }

  function scollega() {
    if (!daScollegare) return;
    const selezionato = daScollegare;
    setDaScollegare(null);
    void avvia(async () => {
      await invocaCassa(companyId, "scollega", { punto_vendita_id: selezionato.punto_vendita_id });
      await queryClient.invalidateQueries({ queryKey: chiaveQueryCassa(companyId) });
      toast.success(`${selezionato.nome} scollegato.`);
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Cassa in Cloud</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Collega i punti vendita da cui vuoi importare gli scontrini.</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to={ARCHIVIO_CASSA}><ReceiptText className="mr-2 h-4 w-4" />Scontrini</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {collegamenti.isLoading && <p role="status" className="text-sm text-muted-foreground">Caricamento punti vendita…</p>}
        {collegamenti.isError && (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
            Impossibile caricare i collegamenti.
            <Button size="sm" variant="outline" onClick={() => void collegamenti.refetch()}>Riprova</Button>
          </div>
        )}
        {collegamenti.data?.length > 0 && (
          <ul aria-label="Punti vendita collegati" className="divide-y rounded-lg border">
            {collegamenti.data.map((p) => (
              <li key={p.punto_vendita_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">{p.nome} <span className="text-xs text-muted-foreground">· {p.punto_vendita_id}</span></div>
                  <div className="text-xs text-muted-foreground">
                    {p.ultimo_import ? `Ultimo import ${new Date(p.ultimo_import).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}` : "In attesa del primo import"}
                  </div>
                </div>
                {puoGestire && <Button size="sm" variant="ghost" disabled={occupato} onClick={() => setDaScollegare(p)}>Scollega</Button>}
              </li>
            ))}
          </ul>
        )}
        {puoGestire && (
          <>
            <form onSubmit={verifica} className="space-y-2">
              <Label htmlFor="cassa-api-key">Chiave API di Cassa in Cloud</Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="cassa-api-key"
                  className="min-w-48 max-w-sm"
                  type="password"
                  autoComplete="new-password"
                  spellCheck={false}
                  maxLength={512}
                  value={chiave}
                  disabled={occupato}
                  onChange={(e) => { setChiave(e.target.value); setPunti(null); setPuntoId(""); setErrore(null); }}
                />
                <Button type="submit" variant="outline" disabled={occupato || !chiave.trim()}>Verifica chiave</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Nel portale Cassa in Cloud, apri Impostazioni account → API e abilita la lettura dei punti vendita e degli scontrini.{" "}
                <a className="underline underline-offset-2" href="https://cassaincloud.zendesk.com/hc/it/articles/13265013971101-Portale-Impostazioni-account-API-Application-Programming-Interface" target="_blank" rel="noreferrer">Guida alla chiave API</a>
              </p>
            </form>
            {punti && (punti.length ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-48 max-w-full space-y-1">
                  <Label htmlFor="cassa-punto-collega">Punto vendita</Label>
                  <select id="cassa-punto-collega" className="block h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={puntoId} onChange={(e) => setPuntoId(e.target.value)} disabled={occupato}>
                    <option value="">Seleziona un punto vendita</option>
                    {punti.map((p) => (
                      <option key={p.id} value={p.id} disabled={!p.compatibile}>
                        {[p.nome, p.citta, p.partita_iva, `#${p.id}`, !p.compatibile && "Partita IVA diversa"].filter(Boolean).join(" · ")}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="button" disabled={occupato || !punto} onClick={collega}>{esistente ? "Aggiorna collegamento" : "Collega punto vendita"}</Button>
              </div>
            ) : <p role="status" className="text-sm text-muted-foreground">La chiave non ha accesso a punti vendita.</p>)}
          </>
        )}
        {!puoGestire && !permessi.isLoading && (
          <p className="text-sm text-muted-foreground">I collegamenti si modificano con il permesso Integrazioni e canali.</p>
        )}
        {occupato && <p role="status" className="text-sm text-muted-foreground">Operazione in corso…</p>}
        {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
      </CardContent>
      <AlertDialog open={!!daScollegare} onOpenChange={(open) => { if (!open) setDaScollegare(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Scollegare {daScollegare?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>La chiave viene rimossa. Gli scontrini già importati restano nell’archivio.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={scollega}>Scollega</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default function SettingsCassaInCloud() {
  const { effectiveCompany } = useAuth();
  return effectiveCompany?.id ? <ConfiguraCassa key={effectiveCompany.id} companyId={effectiveCompany.id} /> : null;
}
