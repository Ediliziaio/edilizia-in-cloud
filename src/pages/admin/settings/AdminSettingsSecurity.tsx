import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import { it } from "date-fns/locale";
import {
  ShieldCheck, ShieldAlert, KeyRound, MonitorSmartphone, Ban, UserCog,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface Sicurezza {
  riepilogo: {
    admin_totali: number;
    mfa_attivi: number;
    utenti_totali: number;
    utenti_bloccati: number;
    account_lockati: number;
    con_tentativi_falliti: number;
    sessioni_attive_24h: number;
    tentativi_falliti_24h: number;
    aziende_con_ip_allowlist: number;
    impersonation_7g: number;
  };
  bloccati: Array<{
    id: string; email: string | null; nome: string | null; azienda: string | null;
    motivo: string | null; bloccato_il: string | null; bloccato_fino: string | null; tentativi: number;
  }>;
  sessioni_attive: Array<{
    id: string; email: string | null; azienda: string | null; ip: string | null;
    browser: string | null; sistema: string | null; dispositivo: string | null; ultima_attivita: string;
  }>;
  tentativi_falliti: Array<{
    email: string; tentativi: number; indirizzi_diversi: number; ultimo: string; motivi: string[];
  }>;
  amministratori: Array<{
    email: string | null; ruolo: string; nome: string | null;
    ha_mfa: boolean; ultimo_accesso: string | null;
  }>;
  calcolato_il: string;
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
 * Sicurezza della piattaforma (F2-04).
 *
 * Questa pagina era un file di cinque righe. Ora mostra i fatti che contano:
 * chi ha le chiavi e se le protegge con un secondo fattore, chi è bloccato,
 * quali sessioni sono aperte e da dove, quali email vengono attaccate.
 */
export default function AdminSettingsSecurity() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-security-overview"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_security_overview" as never);
      if (error) throw error;
      return data as unknown as Sicurezza;
    },
    staleTime: 120_000,
  });

  const r = data?.riepilogo;
  const adminSenzaMfa = (data?.amministratori ?? []).filter((a) => !a.ha_mfa);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Sicurezza</h1>
        <p className="text-muted-foreground">
          Accessi privilegiati, blocchi, sessioni e tentativi falliti su tutta la piattaforma
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>
            {/* La funzione arriva con una migrazione: finché non è applicata,
                è più utile dire cosa manca che mostrare un errore tecnico. */}
            {String((error as Error).message).includes("admin_security_overview")
              ? "Il cruscotto sicurezza richiede la migrazione 20280904101300_sicurezza_piattaforma.sql, non ancora applicata al database."
              : (error as Error).message}
          </AlertDescription>
        </Alert>
      )}

      {isLoading && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      )}

      {r && (
        <>
          {adminSenzaMfa.length > 0 && (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>
                <strong>{adminSenzaMfa.length} {adminSenzaMfa.length === 1 ? "amministratore protegge" : "amministratori proteggono"} l'accesso
                con la sola password.</strong>{" "}
                Un account amministrativo compromesso apre l'intera piattaforma: {r.utenti_totali} utenti
                e tutte le aziende. Attivare il secondo fattore è l'intervento che riduce di più il rischio.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <Tessera
              etichetta="Admin con 2FA"
              valore={`${r.mfa_attivi}/${r.admin_totali}`}
              dettaglio={r.mfa_attivi === 0 ? "nessuno protetto" : "secondo fattore attivo"}
              tono={r.mfa_attivi === 0 ? "critico" : r.mfa_attivi < r.admin_totali ? "attenzione" : "buono"}
            />
            <Tessera
              etichetta="Account bloccati"
              valore={r.utenti_bloccati + r.account_lockati}
              dettaglio={`${r.utenti_bloccati} manuali · ${r.account_lockati} automatici`}
              tono={r.utenti_bloccati + r.account_lockati > 0 ? "attenzione" : "buono"}
            />
            <Tessera
              etichetta="Tentativi falliti 24h"
              valore={r.tentativi_falliti_24h}
              dettaglio={`${r.con_tentativi_falliti} account con contatore aperto`}
              tono={r.tentativi_falliti_24h > 20 ? "critico" : r.tentativi_falliti_24h > 0 ? "attenzione" : "buono"}
            />
            <Tessera
              etichetta="Sessioni attive"
              valore={r.sessioni_attive_24h}
              dettaglio="nelle ultime 24 ore"
            />
            <Tessera
              etichetta="Assistenze 7 giorni"
              valore={r.impersonation_7g}
              dettaglio="accessi per conto di un cliente"
            />
            <Tessera
              etichetta="Aziende con IP allowlist"
              valore={r.aziende_con_ip_allowlist}
              dettaglio="accesso limitato a reti note"
            />
            <Tessera
              etichetta="Utenti totali"
              valore={r.utenti_totali}
              dettaglio="profili sulla piattaforma"
            />
            <Tessera
              etichetta="Ultimo calcolo"
              valore={data?.calcolato_il ? format(new Date(data.calcolato_il), "HH:mm") : "—"}
            />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <UserCog className="h-4 w-4 text-blue-500" />
                Chi ha le chiavi della piattaforma
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table className="min-w-[560px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Persona</TableHead>
                    <TableHead>Ruolo</TableHead>
                    <TableHead>Secondo fattore</TableHead>
                    <TableHead>Ultimo accesso</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.amministratori ?? []).map((a) => (
                    <TableRow key={`${a.email}-${a.ruolo}`}>
                      <TableCell>
                        <p className="font-medium text-sm">{a.nome ?? a.email}</p>
                        <p className="text-xs text-muted-foreground">{a.email}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">{a.ruolo}</Badge>
                      </TableCell>
                      <TableCell>
                        {a.ha_mfa ? (
                          <Badge className="text-[10px] gap-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                            <ShieldCheck className="h-3 w-3" /> attivo
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px] gap-1">
                            <KeyRound className="h-3 w-3" /> solo password
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {a.ultimo_accesso
                          ? formatDistanceToNow(new Date(a.ultimo_accesso), { addSuffix: true, locale: it })
                          : "mai"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {(data?.tentativi_falliti ?? []).length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-500" />
                  Tentativi di accesso falliti, ultimi 7 giorni
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table className="min-w-[520px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead className="text-right">Tentativi</TableHead>
                      <TableHead className="text-right">Indirizzi</TableHead>
                      <TableHead>Ultimo</TableHead>
                      <TableHead>Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data!.tentativi_falliti.map((t) => (
                      <TableRow key={t.email}>
                        <TableCell className="text-sm font-medium">{t.email}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {t.tentativi}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {t.indirizzi_diversi}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {formatDistanceToNow(new Date(t.ultimo), { addSuffix: true, locale: it })}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {(t.motivi ?? []).filter(Boolean).join(", ")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {(data?.bloccati ?? []).length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Ban className="h-4 w-4 text-destructive" />
                  Account bloccati
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table className="min-w-[520px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Persona</TableHead>
                      <TableHead>Azienda</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead>Da</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data!.bloccati.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell>
                          <p className="text-sm font-medium">{b.nome ?? b.email}</p>
                          <p className="text-xs text-muted-foreground">{b.email}</p>
                        </TableCell>
                        <TableCell className="text-sm">{b.azienda ?? "—"}</TableCell>
                        <TableCell className="text-xs">{b.motivo ?? "blocco automatico"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                          {b.bloccato_il
                            ? formatDistanceToNow(new Date(b.bloccato_il), { addSuffix: true, locale: it })
                            : "—"}
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
                <MonitorSmartphone className="h-4 w-4 text-muted-foreground" />
                Sessioni aperte adesso
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table className="min-w-[620px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Persona</TableHead>
                    <TableHead>Azienda</TableHead>
                    <TableHead>Indirizzo</TableHead>
                    <TableHead>Dispositivo</TableHead>
                    <TableHead>Attività</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.sessioni_attive ?? []).map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-sm">{s.email ?? "—"}</TableCell>
                      <TableCell className="text-sm">{s.azienda ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{s.ip ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {[s.browser, s.sistema, s.dispositivo].filter(Boolean).join(" · ") || "—"}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {formatDistanceToNow(new Date(s.ultima_attivita), { addSuffix: true, locale: it })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
