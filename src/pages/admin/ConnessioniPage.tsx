import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { Plug, KeyRound, Webhook, AlertTriangle, CheckCircle2, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface Integrazione {
  integrazione: string;
  controlli_7g: number;
  errori_7g: number;
  ultimo_controllo: string | null;
  stato_attuale: string | null;
  ultimo_errore: string | null;
  latenza_media_ms: number | null;
  controllo_fermo: boolean;
}

interface ChiaveApi {
  id: string;
  nome: string | null;
  prefisso: string | null;
  azienda: string | null;
  ambiti: string[] | null;
  attiva: boolean | null;
  revocata_il: string | null;
  scade_il: string | null;
  ultimo_uso: string | null;
  limite_minuto: number | null;
  chiamate_7g: number;
  errori_7g: number;
}

interface WebhookRiga {
  id: string;
  nome: string | null;
  url: string;
  ambito: string;
  azienda: string | null;
  attivo: boolean | null;
  fallimenti_consecutivi: number | null;
  ultimo_invio: string | null;
  in_pausa_dal: string | null;
  fallite_7g: number;
}

interface CasellaEmail {
  id: string;
  casella: string;
  provider: string;
  servizio: string | null;
  azienda: string | null;
  persona: string | null;
  stato: string;
  errori_di_fila: number | null;
  ultimo_scambio: string | null;
  ultimo_errore: string | null;
  giorni_ferma: number | null;
}

interface Connessioni {
  riepilogo: {
    integrazioni_monitorate: number;
    integrazioni_in_errore: number;
    integrazioni_senza_controlli: number;
    chiavi_totali: number;
    chiavi_attive: number;
    chiavi_dormienti: number;
    chiavi_in_scadenza_30g: number;
    webhook_totali: number;
    webhook_in_pausa: number;
    chiamate_api_7g: number;
    caselle_email_totali: number;
    caselle_email_ferme: number;
  };
  integrazioni: Integrazione[];
  chiavi_api: ChiaveApi[];
  webhook: WebhookRiga[];
  caselle_email?: CasellaEmail[];
  calcolato_il: string;
}

function quando(iso: string | null): string {
  if (!iso) return "mai";
  return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: it });
}

function Tessera({
  etichetta, valore, dettaglio, tono = "neutro",
}: {
  etichetta: string; valore: string | number; dettaglio?: string;
  tono?: "neutro" | "buono" | "attenzione" | "critico";
}) {
  const colori = {
    neutro: "text-foreground",
    buono: "text-emerald-600 dark:text-emerald-400",
    attenzione: "text-amber-600 dark:text-amber-400",
    critico: "text-destructive",
  }[tono];
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{etichetta}</p>
      <p className={`text-2xl font-semibold tabular-nums leading-tight ${colori}`}>{valore}</p>
      {dettaglio && <p className="text-xs text-muted-foreground mt-0.5">{dettaglio}</p>}
    </div>
  );
}

/**
 * Connessioni (F3-06 · F3-08).
 *
 * Tre cose che erano invisibili: quale integrazione sta funzionando e quale ha
 * smesso, chi usa le chiavi API e quali andrebbero revocate, quali webhook
 * stanno fallendo la consegna. Le tabelle esistevano già tutte; mancava chi le
 * leggesse insieme.
 */
export default function ConnessioniPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-stato-connessioni"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_stato_connessioni" as never);
      if (error) throw error;
      return data as unknown as Connessioni;
    },
    staleTime: 120_000,
  });

  const r = data?.riepilogo;
  const integrazioni = data?.integrazioni ?? [];
  const chiavi = data?.chiavi_api ?? [];
  const webhook = data?.webhook ?? [];
  const caselle = data?.caselle_email ?? [];
  // Se il database non ha ancora la migrazione che le conta, la sezione
  // semplicemente non compare invece di mostrare «NaN/undefined».
  const casellePresenti = typeof r?.caselle_email_totali === "number";
  const caselleFerme = r?.caselle_email_ferme ?? 0;

  return (
    <div className="p-3 md:p-6 space-y-4">
      <div className="hidden md:flex items-center gap-3">
        <Plug className="h-6 w-6 text-blue-500" />
        <div>
          <h1 className="text-xl font-semibold">Connessioni</h1>
          <p className="text-sm text-muted-foreground">
            Integrazioni, chiavi API e webhook: cosa funziona, cosa ha smesso, cosa va revocato
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {String((error as Error).message).includes("admin_stato_connessioni")
              ? "Questa pagina richiede la migrazione 20280904101900_connessioni_e_limiti.sql."
              : (error as Error).message}
          </AlertDescription>
        </Alert>
      )}

      {isLoading && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      )}

      {r && (
        <>
          {r.integrazioni_senza_controlli > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>{r.integrazioni_senza_controlli} integrazioni non vengono controllate
                da più di 36 ore.</strong>{" "}
                Il controllo è ora pianificato due volte al giorno: se il dato resta fermo,
                la funzione che lo scrive non sta rispondendo.
              </AlertDescription>
            </Alert>
          )}

          {caselleFerme > 0 && (
            <Alert>
              <Mail className="h-4 w-4" />
              <AlertDescription>
                <strong>{caselleFerme} caselle email collegate non funzionano più.</strong>{" "}
                Per quelle persone la posta non arriva in Edilizia in Cloud e non si può inviare dal
                loro indirizzo. Chi le ha collegate riceve un avviso e le ricollega dal suo profilo.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <Tessera
              etichetta="Integrazioni in errore"
              valore={`${r.integrazioni_in_errore}/${r.integrazioni_monitorate}`}
              dettaglio="negli ultimi 7 giorni"
              tono={r.integrazioni_in_errore > 0 ? "attenzione" : "buono"}
            />
            {casellePresenti && (
              <Tessera
                etichetta="Caselle email"
                valore={`${r.caselle_email_totali - caselleFerme}/${r.caselle_email_totali}`}
                dettaglio={caselleFerme > 0 ? `${caselleFerme} da ricollegare` : "tutte collegate"}
                tono={caselleFerme > 0 ? "attenzione" : "buono"}
              />
            )}
            <Tessera
              etichetta="Chiavi API attive"
              valore={`${r.chiavi_attive}/${r.chiavi_totali}`}
              dettaglio={`${r.chiamate_api_7g} chiamate in 7 giorni`}
            />
            <Tessera
              etichetta="Chiavi dormienti"
              valore={r.chiavi_dormienti}
              dettaglio="vive ma inutilizzate da 90 giorni"
              tono={r.chiavi_dormienti > 0 ? "attenzione" : "buono"}
            />
            <Tessera
              etichetta="Webhook in pausa"
              valore={r.webhook_in_pausa}
              dettaglio={`${r.webhook_totali} configurati`}
              tono={r.webhook_in_pausa > 0 ? "attenzione" : "buono"}
            />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Plug className="h-4 w-4 text-blue-500" />
                Integrazioni
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table className="min-w-[620px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Servizio</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead className="text-right">Errori 7g</TableHead>
                    <TableHead className="text-right">Latenza</TableHead>
                    <TableHead>Ultimo controllo</TableHead>
                    <TableHead>Errore</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {integrazioni.map((i) => (
                    <TableRow key={i.integrazione}>
                      <TableCell className="font-medium text-sm">{i.integrazione}</TableCell>
                      <TableCell>
                        {i.stato_attuale === "healthy" || i.stato_attuale === "ok" ? (
                          <Badge className="text-[10px] gap-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                            <CheckCircle2 className="h-3 w-3" /> {i.stato_attuale}
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">
                            {i.stato_attuale ?? "sconosciuto"}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${i.errori_7g > 0 ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                        {i.errori_7g}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        {i.latenza_media_ms ? `${i.latenza_media_ms} ms` : "—"}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        <span className={i.controllo_fermo ? "text-amber-600" : "text-muted-foreground"}>
                          {quando(i.ultimo_controllo)}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate" title={i.ultimo_errore ?? ""}>
                        {i.ultimo_errore ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {caselle.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Mail className="h-4 w-4 text-violet-500" />
                  Caselle email collegate
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table className="min-w-[680px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Casella</TableHead>
                      <TableHead>Azienda</TableHead>
                      <TableHead>Servizio</TableHead>
                      <TableHead>Stato</TableHead>
                      <TableHead>Ultimo scambio</TableHead>
                      <TableHead>Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {caselle.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="text-sm">
                          <span className="font-medium">{c.casella}</span>
                          {c.persona && (
                            <span className="block text-[11px] text-muted-foreground">{c.persona}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{c.azienda ?? "—"}</TableCell>
                        <TableCell className="text-xs capitalize">
                          {c.provider === "imap" ? (c.servizio ?? "IMAP") : c.provider}
                        </TableCell>
                        <TableCell>
                          {c.giorni_ferma === null ? (
                            <Badge className="text-[10px] gap-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                              <CheckCircle2 className="h-3 w-3" /> attiva
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[10px]">
                              ferma da {c.giorni_ferma} {c.giorni_ferma === 1 ? "giorno" : "giorni"}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                          {quando(c.ultimo_scambio)}
                        </TableCell>
                        <TableCell className="text-xs max-w-[220px] truncate" title={c.ultimo_errore ?? ""}>
                          {c.giorni_ferma === null
                            ? "—"
                            : c.provider === "imap"
                              ? "Credenziali rifiutate dal server"
                              : "Autorizzazione revocata o scaduta"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-amber-500" />
                Chiavi API
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {chiavi.length === 0 ? (
                <p className="text-sm text-muted-foreground px-6 pb-6">
                  Nessuna chiave API configurata.
                </p>
              ) : (
                <Table className="min-w-[620px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Chiave</TableHead>
                      <TableHead>Azienda</TableHead>
                      <TableHead>Stato</TableHead>
                      <TableHead className="text-right">Chiamate 7g</TableHead>
                      <TableHead>Ultimo uso</TableHead>
                      <TableHead>Scadenza</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {chiavi.map((k) => (
                      <TableRow key={k.id}>
                        <TableCell>
                          <p className="text-sm font-medium">{k.nome ?? "senza nome"}</p>
                          <p className="text-xs font-mono text-muted-foreground">{k.prefisso ?? "—"}</p>
                        </TableCell>
                        <TableCell className="text-sm">{k.azienda ?? "piattaforma"}</TableCell>
                        <TableCell>
                          {k.revocata_il ? (
                            <Badge variant="outline" className="text-[10px]">revocata</Badge>
                          ) : k.attiva ? (
                            <Badge className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                              attiva
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">disattivata</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {k.chiamate_7g}
                          {k.errori_7g > 0 && (
                            <span className="block text-xs text-destructive">{k.errori_7g} errori</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{quando(k.ultimo_uso)}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                          {k.scade_il ? quando(k.scade_il) : "nessuna"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Webhook className="h-4 w-4 text-violet-500" />
                Webhook
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {webhook.length === 0 ? (
                <p className="text-sm text-muted-foreground px-6 pb-6">
                  Nessun webhook configurato, né di piattaforma né di azienda.
                </p>
              ) : (
                <Table className="min-w-[620px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Webhook</TableHead>
                      <TableHead>Ambito</TableHead>
                      <TableHead>Stato</TableHead>
                      <TableHead className="text-right">Consegne fallite 7g</TableHead>
                      <TableHead>Ultimo invio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {webhook.map((w) => (
                      <TableRow key={w.id}>
                        <TableCell>
                          <p className="text-sm font-medium">{w.nome ?? "senza nome"}</p>
                          <p className="text-xs font-mono text-muted-foreground truncate max-w-[220px]" title={w.url}>
                            {w.url}
                          </p>
                        </TableCell>
                        <TableCell className="text-sm">
                          {w.ambito === "azienda" ? (w.azienda ?? "azienda") : "piattaforma"}
                        </TableCell>
                        <TableCell>
                          {w.in_pausa_dal ? (
                            <Badge variant="destructive" className="text-[10px]">in pausa</Badge>
                          ) : w.attivo ? (
                            <Badge className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                              attivo
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">disattivato</Badge>
                          )}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums ${w.fallite_7g > 0 ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                          {w.fallite_7g}
                          {(w.fallimenti_consecutivi ?? 0) > 0 && (
                            <span className="block text-xs">{w.fallimenti_consecutivi} di fila</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{quando(w.ultimo_invio)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
