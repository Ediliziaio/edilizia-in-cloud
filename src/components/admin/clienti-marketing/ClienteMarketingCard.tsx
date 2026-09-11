/**
 * La scheda di un cliente marketing nel mese scelto: cosa è collegato, quanti
 * lead sono arrivati e come sono stati seguiti, quanto è costato ogni lead,
 * appuntamento e vendita, il venduto su cui matura la provvigione e la
 * provvigione a scaglioni. Le azioni portano dentro l'azienda, ai costi del
 * mese, al registro incassi e alla scheda del contratto.
 */
import type { ReactNode } from "react";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarCheck, ClipboardList, Coins, FileText, Globe, Inbox, Loader2, LogIn,
  Megaphone, Pencil, Percent, Receipt, Trophy, UserRoundCheck, Users, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { alProssimoScaglione, leggiMese, scaglioneCorrente, variazione, type ClienteMarketing } from "./provvigioni";
import { dataBreve, eur, numero, ore } from "./formato";

const STATO: Record<string, { etichetta: string; classe: string }> = {
  attivo: { etichetta: "attivo", classe: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  pausa: { etichetta: "in pausa", classe: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  cessato: { etichetta: "cessato", classe: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
};

interface Props {
  c: ClienteMarketing;
  meseCorrente: boolean;
  meseLeggibile: string;
  oggi: Date;
  entraInCorso: boolean;
  puoEntrare: boolean;
  onEntra: () => void;
  onCosti: () => void;
  onIncassi: () => void;
  onModifica: () => void;
}

function Delta({ adesso, prima }: { adesso: number; prima: number }) {
  const v = variazione(adesso, prima);
  if (v == null) return <span className="text-muted-foreground">mese prima: {numero(prima)}</span>;
  const Icona = v >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-medium", v === 0 ? "text-muted-foreground" : v > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400")}>
      <Icona className="h-3 w-3" />{v > 0 ? "+" : ""}{numero(v)}%
      <span className="font-normal text-muted-foreground"> vs {numero(prima)}</span>
    </span>
  );
}

function Stat({ etichetta, icona: Icona, valore, righe, tono }: { etichetta: string; icona: typeof Coins; valore: ReactNode; righe: ReactNode[]; tono?: "ok" | "attenzione" }) {
  return (
    <div className={cn("min-w-0 rounded-lg px-3 py-2.5", tono === "attenzione" ? "bg-rose-50 dark:bg-rose-950/40" : "bg-muted/40")}>
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icona className="h-3 w-3 shrink-0" /> {etichetta}
      </div>
      <div className="mt-0.5 text-lg font-bold leading-tight tabular-nums">{valore}</div>
      {righe.filter(Boolean).map((r, i) => (
        <div key={i} className="mt-0.5 truncate text-[11px] leading-snug text-muted-foreground" title={typeof r === "string" ? r : undefined}>{r}</div>
      ))}
    </div>
  );
}

function Chip({ stato, icona: Icona, children, titolo }: { stato: "ok" | "no" | "neutro"; icona: typeof Coins; children: ReactNode; titolo?: string }) {
  return (
    <span title={titolo} className={cn("inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
      stato === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300"
        : stato === "no" ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300"
        : "border-border bg-background text-muted-foreground")}>
      <Icona className="h-3 w-3 shrink-0" /><span className="truncate">{children}</span>
    </span>
  );
}

export function ClienteMarketingCard({ c, meseCorrente, meseLeggibile, oggi, entraInCorso, puoEntrare, onEntra, onCosti, onIncassi, onModifica }: Props) {
  const l = leggiMese(c, meseCorrente);
  const stato = STATO[c.stato] ?? { etichetta: c.stato, classe: "" };
  const spento = c.stato === "cessato";
  const canali = [
    c.lead_meta > 0 && `Meta ${numero(c.lead_meta)}`,
    c.lead_google > 0 && `Google ${numero(c.lead_google)}`,
    c.lead_form > 0 && `moduli ${numero(c.lead_form)}`,
    c.lead_altri > 0 && `altri ${numero(c.lead_altri)}`,
  ].filter(Boolean).join(" · ");
  const fontiSpesa = [
    c.spesa_meta > 0 && `Meta ${eur(c.spesa_meta)}`,
    c.spesa_google > 0 && `Google ${eur(c.spesa_google)}`,
    c.spesa_manuale > 0 && `a mano ${eur(c.spesa_manuale)}`,
  ].filter(Boolean).join(" · ");
  const scaglione = scaglioneCorrente(l.venduto, l.scaglioni);
  const alProssimo = alProssimoScaglione(l.venduto, l.scaglioni);
  const prossimo = scaglione && alProssimo != null ? l.scaglioni[l.scaglioni.indexOf(scaglione) + 1] : null;
  const meta: { stato: "ok" | "no" | "neutro"; testo: string } =
    c.meta_stato === "connected" && c.meta_account_id ? { stato: "ok", testo: `Meta · ${c.meta_account_nome ?? c.meta_account_id}` }
      : c.meta_stato === "connected" ? { stato: "no", testo: "Meta collegato, nessun account scelto" }
      : c.meta_stato === "token_expired" ? { stato: "no", testo: "Meta scaduto" }
      : c.meta_stato ? { stato: "no", testo: `Meta ${c.meta_stato}` }
      : { stato: "neutro", testo: "Meta non collegato" };

  return (
    <article className={cn("rounded-xl border bg-card shadow-sm", spento && "opacity-60")}>
      <header className="flex flex-col gap-3 p-4 pb-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <Avatar className="h-11 w-11 shrink-0 rounded-lg">
            {c.logo_url && <AvatarImage src={c.logo_url} alt="" className="object-contain" />}
            <AvatarFallback className="rounded-lg bg-primary/10 text-sm font-semibold text-primary">{(c.cliente_nome || "?").charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold leading-tight">{c.cliente_nome}</h3>
              <Badge variant="secondary" className={cn("border-0 text-[10px]", stato.classe)}>{stato.etichetta}</Badge>
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {c.servizio ?? "Marketing"}{c.data_inizio ? ` · dal ${dataBreve(c.data_inizio, false, oggi)}` : ""}{c.commerciale ? ` · comm. ${c.commerciale}` : ""}
              {c.pipeline_aperta > 0 && <> · {numero(c.pipeline_aperta)} opportunità aperte per {eur(c.valore_pipeline_aperta)}</>}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Chip stato={meta.stato} icona={Megaphone} titolo={c.meta_pagine ? `Pagine: ${c.meta_pagine}` : undefined}>{meta.testo}</Chip>
              {c.meta_pagine && <Chip stato="neutro" icona={Megaphone} titolo={c.meta_pagine}>{c.meta_pagine.split(", ").length === 1 ? c.meta_pagine : `${c.meta_pagine.split(", ").length} pagine`}</Chip>}
              <Chip stato={c.google_account ? "ok" : "neutro"} icona={Globe} titolo={c.google_account ?? undefined}>{c.google_account ? `Google · ${c.google_account}` : "Google non collegato"}</Chip>
              <Chip stato={c.fatture_collegate ? "ok" : "neutro"} icona={FileText}>{c.fatture_collegate ? "Fatture collegate" : "Fatture non collegate"}</Chip>
              <Chip stato={c.form_attivi > 0 ? "ok" : "neutro"} icona={ClipboardList}>{c.form_attivi > 0 ? `${numero(c.form_attivi)} ${c.form_attivi === 1 ? "modulo attivo" : "moduli attivi"}` : "Nessun modulo"}</Chip>
              <Chip stato={c.utenti > 0 && c.ultimo_accesso ? "ok" : "neutro"} icona={Users}>
                {numero(c.utenti)} {c.utenti === 1 ? "utente" : "utenti"}{c.ultimo_accesso ? ` · ultimo accesso ${dataBreve(c.ultimo_accesso, false, oggi)}` : c.utenti > 0 ? " · mai entrati" : ""}
              </Chip>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 lg:justify-end">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onEntra} disabled={!puoEntrare || entraInCorso}>
            {entraInCorso ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />} Entra nell'azienda
          </Button>
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={onCosti}><Receipt className="h-3.5 w-3.5" /> Costi del mese</Button>
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={onIncassi}><Wallet className="h-3.5 w-3.5" /> Incassi</Button>
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={onModifica} aria-label="Modifica contratto"><Pencil className="h-3.5 w-3.5" /> Contratto</Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 px-4 pb-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat etichetta="Lead nuovi" icona={Inbox} valore={numero(c.lead_mese)} tono={meseCorrente && c.stato === "attivo" && c.lead_mese === 0 ? "attenzione" : undefined}
          righe={[<Delta key="d" adesso={c.lead_mese} prima={c.lead_prec} />, canali || (c.lead_mese > 0 ? "fonte non riconosciuta" : "nessun lead nel mese"), c.lead_meta_dichiarati > 0 ? `Meta ne dichiara ${numero(c.lead_meta_dichiarati)}` : null]} />
        <Stat etichetta="Seguiti" icona={UserRoundCheck} valore={<>{numero(c.lead_lavorati)}{c.lead_mese > 0 && c.lead_lavorati <= c.lead_mese && <span className="text-sm font-medium text-muted-foreground"> / {numero(c.lead_mese)}</span>}</>}
          tono={c.lead_non_gestiti >= 5 ? "attenzione" : undefined}
          righe={[c.ore_mediane_primo_contatto != null ? `primo contatto in ${ore(c.ore_mediane_primo_contatto)} (mediana)` : "nessuna azione registrata",
            c.lead_non_gestiti > 0 ? <span key="f" className="font-medium text-rose-700 dark:text-rose-400">{numero(c.lead_non_gestiti)} fermi da più di 2 giorni</span> : "nessun lead fermo"]} />
        <Stat etichetta="Appuntamenti" icona={CalendarCheck} valore={numero(c.appuntamenti_mese)}
          righe={[<Delta key="d" adesso={c.appuntamenti_mese} prima={c.appuntamenti_prec} />, l.costoAppuntamento != null ? `${eur(l.costoAppuntamento)} ad appuntamento` : l.spesa > 0 ? "nessun appuntamento: costo non calcolabile" : "senza costi: costo non calcolabile"]} />
        <Stat etichetta="Vendite" icona={Trophy} valore={numero(c.vinte_mese)}
          righe={[<Delta key="d" adesso={c.vinte_mese} prima={c.vinte_prec} />, c.valore_vinto_mese > 0 ? `valore ${eur(c.valore_vinto_mese)}` : "nessun valore nel CRM", l.cpa != null ? `CPA ${eur(l.cpa)}` : null]} />
        <Stat etichetta="Spesa ads" icona={Coins} valore={eur(l.spesa)}
          righe={[fontiSpesa || (c.meta_account_id ? "Meta: costi non ancora scaricati" : "nessun costo caricato"),
            l.cpl != null ? `CPL ${eur(l.cpl, 2)}${l.roas != null ? ` · ${l.roas.toLocaleString("it-IT")}× ritorno` : ""}` : null,
            c.spesa_meta_al ? `Meta aggiornato ${dataBreve(c.spesa_meta_al, true, oggi)}` : null]} />
        <Stat etichetta="Provvigione" icona={Percent} valore={l.scaglioni.length ? eur(l.provvigione) : "—"}
          righe={[
            l.fonteVenduto === "nessuna" ? `nessun venduto in ${meseLeggibile}` : `su ${eur(l.venduto)} ${l.fonteVenduto === "fatture" ? "di fatture" : "di vendite CRM"}${scaglione ? ` · scaglione ${scaglione.pct.toLocaleString("it-IT")}%` : ""}`,
            !l.scaglioni.length ? "senza scaglioni: si calcola alla chiusura" : c.mese_chiuso
              ? <span key="c" className={cn("font-medium", Number(c.mese_incassato ?? 0) >= Number(c.mese_dovuto ?? 0) ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400")}>
                  mese chiuso: {eur(c.mese_dovuto)} dovuti{Number(c.mese_incassato ?? 0) > 0 ? `, ${eur(c.mese_incassato)} incassati` : ", da incassare"}
                </span>
              : prossimo && alProssimo != null && alProssimo > 0 ? `${eur(alProssimo)} al ${prossimo.pct.toLocaleString("it-IT")}% · ${meseCorrente ? "mese aperto" : "da chiudere"}` : meseCorrente ? "mese aperto" : "da chiudere",
          ]} />
      </div>

      {l.avvisi.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 border-t px-4 py-2 text-xs">
          {l.avvisi.map((a) => (
            <li key={a.tipo} className={cn("inline-flex items-center gap-1.5", a.grave ? "text-rose-700 dark:text-rose-400" : "text-amber-700 dark:text-amber-400")}>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {a.testo}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
