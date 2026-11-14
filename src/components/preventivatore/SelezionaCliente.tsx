/**
 * «Seleziona cliente» nel passo Cliente di tutti i preventivatori (07/11/2026).
 *
 * Florin: «quando devo fare Seleziona da CRM migliora la ricerca: si deve aprire un popup in cui scelgo tra i
 * contatti del CRM oppure, se ho la sezione sbloccata, anche dai clienti, e devo vedere i dati principali.
 * Il venditore che ha solo i dati assegnati a lui vede ovviamente solo quelli».
 *
 * Prima era una tendina stretta coi soli nomi, diversa in ogni preventivatore. Ora un popup solo: ricerca,
 * linguette «Contatti CRM» / «Clienti» secondo i permessi (`fontiVisibili`), e per ognuno nome, azienda,
 * telefono, email, città e partita IVA o codice fiscale. Le regole stanno in `lib/preventivatore/selezionaCliente`.
 *
 * Un contatto si COLLEGA al preventivo (`cliente_id`); un cliente ne compila i dati senza collegarlo, perché il
 * preventivo si aggancia ai contatti del CRM.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Check, Loader2, Search, UserRound, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useDebounce } from "@/hooks/useDebounce";
import { filtriRicercaContatti } from "@/lib/ricerca/ricercaContatti";
import {
  daCliente, daContatto, fontiVisibili, nomeDaMostrare, sottotitoloDaMostrare,
  type ClienteScelto, type OrigineScelta, type RigaClienteAnagrafica, type RigaContattoCrm,
} from "@/lib/preventivatore/selezionaCliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const QUANTI = 30;

interface Props {
  /** Il contatto del CRM già collegato al preventivo, se c'è. */
  collegatoId: string | null | undefined;
  onScegli: (scelto: ClienteScelto) => void;
  onScollega?: () => void;
  className?: string;
  /** Testo del bottone quando non c'è niente di collegato. */
  etichetta?: string;
  /**
   * Chi è collegato, quando non è un contatto del CRM (14/11/2026): il preventivo classico e il computo
   * si collegano anche a un cliente o committente dell'anagrafica. Con il nome, il riquadro lo dice.
   */
  collegatoOrigine?: OrigineScelta;
  collegatoNome?: string | null;
}

export function SelezionaCliente({ collegatoId, onScegli, onScollega, className, etichetta = "Seleziona cliente", collegatoOrigine = "contatto", collegatoNome }: Props) {
  const [aperto, setAperto] = useState(false);
  const titoloCollegato = collegatoOrigine === "cliente" ? "Cliente dell'anagrafica collegato" : "Contatto CRM collegato";
  return (
    <div className={cn("rounded-md border border-slate-200 bg-white px-3 py-2.5 max-sm:border-0 max-sm:bg-transparent max-sm:p-0", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 max-sm:hidden">
          <p className="text-xs font-semibold text-slate-900">{collegatoId ? titoloCollegato : "Da chi prendo i dati"}</p>
          <p className="truncate text-[11px] text-slate-500">
            {collegatoId ? (collegatoNome ? collegatoNome : "Anagrafica e recapiti presi dal contatto.") : "Un contatto del CRM o un cliente: anagrafica, recapiti e dati fiscali si compilano da soli."}
          </p>
        </div>
        <div className="flex shrink-0 gap-2 max-sm:w-full">
          {collegatoId && onScollega && (
            <Button variant="ghost" size="sm" onClick={onScollega} className="tap-compact h-8 px-2 text-xs text-slate-600">Scollega</Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setAperto(true)}
            className="tap-compact h-8 gap-1.5 px-3 text-xs hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 max-sm:flex-1">
            <Users className="h-3.5 w-3.5" />{collegatoId ? "Cambia" : etichetta}
          </Button>
        </div>
      </div>
      {/* Montato solo da aperto: a popup chiuso nessuna lettura di permessi o dati. */}
      {aperto && (
        <SelezionaClienteDialog aperto={aperto} onAperto={setAperto} collegatoId={collegatoId} collegatoOrigine={collegatoOrigine}
          onScegli={(s) => { onScegli(s); setAperto(false); }} />
      )}
    </div>
  );
}

export function SelezionaClienteDialog({ aperto, onAperto, collegatoId, collegatoOrigine = "contatto", onScegli }: {
  aperto: boolean; onAperto: (v: boolean) => void; collegatoId?: string | null; collegatoOrigine?: OrigineScelta; onScegli: (s: ClienteScelto) => void;
}) {
  const permessi = usePermissions();
  const fonti = fontiVisibili(permessi);
  const companyId = useEffectiveCompanyId();
  const [fonte, setFonte] = useState<OrigineScelta>("contatto");
  const [cerca, setCerca] = useState("");
  const ricerca = useDebounce(cerca, 250).trim();

  // Se i contatti non si vedono, si parte dai clienti (e viceversa).
  useEffect(() => {
    if (fonte === "contatto" && !fonti.contatti && fonti.clienti) setFonte("cliente");
    if (fonte === "cliente" && !fonti.clienti && fonti.contatti) setFonte("contatto");
  }, [fonte, fonti.contatti, fonti.clienti]);

  const contatti = useQuery({
    queryKey: ["seleziona-cliente", "contatti", companyId, ricerca],
    enabled: aperto && fonte === "contatto" && fonti.contatti && !!companyId,
    staleTime: 30_000,
    queryFn: async (): Promise<ClienteScelto[]> => {
      // «Solo i propri» lo applica il database: qui arrivano solo i contatti che l'utente può vedere.
      let q = supabase.from("marketing_contacts")
        .select("id, first_name, last_name, email, phone, address, city, province, postal_code, company_name, fiscal_code, vat_number")
        .eq("company_id", companyId!).is("deleted_at", null).limit(QUANTI);
      // Anche per partita IVA (14/11/2026): «IT01234567890» o le sole cifre.
      for (const filtro of filtriRicercaContatti(ricerca, { partitaIva: true })) q = q.or(filtro);
      const { data, error } = await q.order(ricerca ? "first_name" : "updated_at", { ascending: !!ricerca, nullsFirst: false });
      if (error) throw error;
      return ((data ?? []) as RigaContattoCrm[]).map(daContatto);
    },
  });

  // Il permesso e «Solo i propri» li applica il database (`get_customers_paginated`).
  const clienti = useQuery({
    queryKey: ["seleziona-cliente", "clienti", companyId, ricerca],
    enabled: aperto && fonte === "cliente" && fonti.clienti && !!companyId,
    staleTime: 30_000,
    queryFn: async (): Promise<ClienteScelto[]> => {
      const { data, error } = await supabase.rpc("get_customers_paginated" as never, {
        p_company_id: companyId, p_search: ricerca || null, p_limit: QUANTI, p_offset: 0,
        p_sort_field: ricerca ? "name" : "created_at", p_sort_dir: ricerca ? "asc" : "desc",
      } as never);
      if (error) throw error;
      return (((data as { rows?: RigaClienteAnagrafica[] } | null)?.rows) ?? []).map(daCliente);
    },
  });

  const elenco = fonte === "contatto" ? contatti : clienti;
  const righe = useMemo(() => elenco.data ?? [], [elenco.data]);
  const nessunaFonte = !permessi.isLoading && !fonti.contatti && !fonti.clienti;

  return (
    <Dialog open={aperto} onOpenChange={onAperto}>
      <DialogContent className="flex max-h-[85dvh] max-w-4xl flex-col gap-3 p-4">
        <DialogHeader>
          <DialogTitle className="text-base">Seleziona cliente</DialogTitle>
          <DialogDescription className="text-xs">Anagrafica, recapiti e dati fiscali si copiano nel preventivo: li puoi correggere dopo.</DialogDescription>
        </DialogHeader>

        {nessunaFonte ? (
          <p role="status" className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
            Non hai accesso né ai contatti del CRM né ai clienti: scrivi i dati a mano nel passo Cliente.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {fonti.contatti && fonti.clienti && (
                <div role="tablist" aria-label="Da dove prendo i dati" className="inline-flex rounded-lg border bg-slate-50 p-0.5">
                  {([["contatto", "Contatti CRM", UserRound], ["cliente", "Clienti", Building2]] as const).map(([v, nome, Icona]) => (
                    <button key={v} type="button" role="tab" aria-selected={fonte === v} onClick={() => setFonte(v)}
                      className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium",
                        fonte === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")}>
                      <Icona className="h-3.5 w-3.5" />{nome}
                    </button>
                  ))}
                </div>
              )}
              <div className="relative min-w-[12rem] flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input autoFocus value={cerca} onChange={(e) => setCerca(e.target.value)} className="h-9 pl-8"
                  placeholder="Nome, azienda, partita IVA, telefono, email…" aria-label="Cerca" />
              </div>
            </div>
            {fonte === "cliente" && fonti.soloMieiClienti && (
              <p className="text-[11px] text-muted-foreground">Vedi solo i clienti assegnati a te e quelli delle tue commesse.</p>
            )}

            <div className="min-h-[12rem] flex-1 overflow-y-auto rounded-md border" aria-busy={elenco.isFetching}>
              {elenco.isLoading ? (
                <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cerco…</p>
              ) : elenco.isError ? (
                <p role="alert" className="p-4 text-sm text-red-700">Non riesco a leggere {fonte === "contatto" ? "i contatti" : "i clienti"}: riprova.</p>
              ) : righe.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">{ricerca ? `Nessun risultato per «${ricerca}».` : fonte === "cliente" && fonti.soloMieiClienti ? "Non hai clienti assegnati: usa i contatti del CRM o chiedi all'amministratore." : "Nessuno da mostrare."}</p>
              ) : (
                <div role="table" aria-label={fonte === "contatto" ? "Contatti del CRM" : "Clienti"} className="text-sm">
                  {/* Una riga per persona, coi dati principali in colonna (07/11/2026): «—» dove il dato manca. */}
                  <div role="row" className="sticky top-0 z-10 hidden grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,1.3fr)_minmax(0,1fr)] gap-3 border-b bg-muted/60 px-3 py-1.5 text-[11px] font-medium text-muted-foreground md:grid">
                    <span role="columnheader">Nome</span><span role="columnheader">Telefono</span><span role="columnheader">Email</span><span role="columnheader">Città</span>
                  </div>
                  <ul className="divide-y">
                    {righe.map((r) => {
                      const collegato = r.origine === collegatoOrigine && r.id === collegatoId;
                      const sottotitolo = sottotitoloDaMostrare(r);
                      const citta = [r.citta, r.provincia ? `(${r.provincia})` : null].filter(Boolean).join(" ");
                      return (
                        <li key={`${r.origine}-${r.id}`} role="row">
                          <button type="button" onClick={() => onScegli(r)}
                            className="grid w-full grid-cols-1 items-center gap-x-3 gap-y-0.5 px-3 py-2 text-left hover:bg-orange-50/60 focus-visible:bg-orange-50 focus-visible:outline-none md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,1.3fr)_minmax(0,1fr)]">
                            <span role="cell" className="flex min-w-0 items-center gap-2">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                                {r.ragioneSociale && !r.nome ? <Building2 className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
                              </span>
                              <span className="min-w-0">
                                <span className="flex items-center gap-1.5">
                                  <span className="truncate font-medium text-slate-900">{nomeDaMostrare(r)}</span>
                                  {collegato && <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-emerald-700"><Check className="h-3 w-3" />collegato</span>}
                                </span>
                                {sottotitolo && <span className="block truncate text-[11px] text-muted-foreground">{sottotitolo}</span>}
                              </span>
                            </span>
                            <span role="cell" className={cn("truncate tabular-nums text-xs md:text-sm", !r.telefono && "text-muted-foreground/60")}>
                              <span className="md:hidden">Tel. </span>{r.telefono ?? "—"}
                            </span>
                            <span role="cell" className={cn("truncate text-xs md:text-sm", !r.email && "text-muted-foreground/60")} title={r.email ?? undefined}>
                              {r.email ?? "—"}
                            </span>
                            <span role="cell" className={cn("truncate text-xs md:text-sm", !citta && "text-muted-foreground/60")}>{citta || "—"}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {righe.length >= QUANTI ? `I primi ${QUANTI}: scrivi per restringere. ` : ""}
              {fonte === "cliente" ? "Un cliente compila i dati senza collegarsi: il preventivo si collega ai contatti del CRM." : "Il contatto resta collegato al preventivo."}
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default SelezionaCliente;
