import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  idAttivitaValido, type AttivitaAi, type AvanzamentoAi, type FaseAi, type FlussoAi,
  type PassaggioAi, type RichiestaAi, type StatoAi,
} from "../../../shared/aiAttivita.ts";

export interface AttivitaLive {
  collegaBolla(id: string): void;
  collegaRichiesta(richiesta: RichiestaAi): void;
  avanzamento(lotti: AvanzamentoAi): void;
  misura<T>(fase: FaseAi, esegui: () => Promise<T>): Promise<T>;
  passo(fase: FaseAi, modello?: string): void;
  chiudi(stato: Exclude<StatoAi, "in_corso">, fase: FaseAi, modello?: string): void;
}

function nomeVisibile(nome?: string | null) {
  return nome?.replace(/\s+/g, " ").trim().slice(0, 120) || null;
}

export function avviaAttivitaAi(
  db: Pick<SupabaseClient, "from">,
  input: {
    companyId: string;
    userId?: string | null;
    attore?: string | null;
    assistente?: string | null;
    bollaId?: string;
    richiesta?: RichiestaAi;
    flusso: FlussoAi;
    fase: FaseAi;
    ricevutaIl?: string | null;
  },
): AttivitaLive {
  const adesso = new Date().toISOString();
  const ricevutaMs = Date.parse(input.ricevutaIl ?? "");
  const started = Number.isFinite(ricevutaMs) && ricevutaMs <= Date.parse(adesso)
    ? new Date(ricevutaMs).toISOString()
    : adesso;
  const riga: AttivitaAi = {
    id: crypto.randomUUID(),
    company_id: input.companyId,
    actor_user_id: input.userId ?? null,
    attore: nomeVisibile(input.attore),
    assistente: nomeVisibile(input.assistente),
    bolla_id: idAttivitaValido(input.bollaId) ? input.bollaId : null,
    richiesta: null,
    lotti: null,
    flusso: input.flusso,
    stato: "in_corso",
    fase: input.fase,
    modello: null,
    passaggi: [{ fase: input.fase, at: started }],
    started_at: started,
    updated_at: adesso,
    finished_at: null,
  };
  let inScrittura = false;
  let prossimo: AttivitaAi | null = null;
  let nomeLetto = !!riga.attore || !input.userId;
  let erroreSegnalato = false;

  async function scrivi() {
    // Accorpa aggiornamenti ravvicinati: ogni snapshot contiene la cronologia.
    while (prossimo) {
      const snapshot = prossimo;
      prossimo = null;
      try {
        if (!nomeLetto) {
          nomeLetto = true;
          const { data } = await db.from("profiles").select("first_name,last_name")
            .eq("id", input.userId!).abortSignal(AbortSignal.timeout(1200)).maybeSingle();
          riga.attore = nomeVisibile([data?.first_name, data?.last_name].filter(Boolean).join(" "));
        }
        const { error } = await db.from("ai_attivita_live")
          .upsert({ ...snapshot, attore: riga.attore }).abortSignal(AbortSignal.timeout(2200));
        if (error) throw error;
      } catch {
        if (!erroreSegnalato) {
          erroreSegnalato = true;
          console.warn("[ai-attivita] Aggiornamento non disponibile", input.flusso);
        }
      }
    }
    inScrittura = false;
  }

  function pubblica() {
    prossimo = { ...riga };
    if (inScrittura) return;
    inScrittura = true;
    const coda = scrivi();
    const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
    runtime?.waitUntil(coda);
  }

  function aggiorna(stato: StatoAi, fase: FaseAi, modello?: string, registraPassaggio = false): PassaggioAi | undefined {
    if (riga.finished_at) return;
    const slug = modello && /^[a-z0-9_./:+-]{1,120}$/i.test(modello) ? modello : riga.modello;
    if (!registraPassaggio && riga.stato === stato && riga.fase === fase && riga.modello === slug) return;
    const at = new Date(Math.max(Date.now(), Date.parse(riga.updated_at))).toISOString();
    let passaggio: PassaggioAi | undefined;
    if (riga.fase !== fase || registraPassaggio) {
      passaggio = { fase, at };
      riga.passaggi = [riga.passaggi[0], ...riga.passaggi.slice(1).slice(-14), passaggio];
    }
    Object.assign(riga, { stato, fase, modello: slug, updated_at: at, finished_at: stato === "in_corso" ? null : at });
    pubblica();
    return passaggio;
  }

  function collegaRichiesta(richiesta: RichiestaAi, pubblicare = true) {
    if (riga.finished_at || !idAttivitaValido(richiesta.id)) return;
    const precedente = riga.richiesta;
    if (precedente && (precedente.id !== richiesta.id || precedente.tipo !== richiesta.tipo)) return;
    const risorsa = idAttivitaValido(richiesta.risorsa_id) ? richiesta.risorsa_id : precedente?.risorsa_id;
    const esito = idAttivitaValido(richiesta.esito_id) ? richiesta.esito_id : precedente?.esito_id;
    if (precedente && precedente.risorsa_id === risorsa && precedente.esito_id === esito) return;
    riga.richiesta = { tipo: richiesta.tipo, id: richiesta.id, risorsa_id: risorsa, esito_id: esito };
    if (pubblicare) pubblica();
  }

  if (input.richiesta) collegaRichiesta(input.richiesta, false);
  pubblica();
  return {
    collegaBolla(id) {
      if (riga.finished_at || riga.bolla_id || !idAttivitaValido(id)) return;
      riga.bolla_id = id;
      pubblica();
    },
    collegaRichiesta,
    avanzamento(lotti) {
      if (riga.finished_at || !Number.isInteger(lotti.totale) || !Number.isInteger(lotti.completati)
        || lotti.totale < 1 || lotti.completati < 0 || lotti.completati > lotti.totale) return;
      if (riga.lotti?.completati === lotti.completati && riga.lotti.totale === lotti.totale) return;
      riga.lotti = lotti;
      pubblica();
    },
    async misura(fase, esegui) {
      const passaggio = aggiorna("in_corso", fase, undefined, true);
      const avvio = performance.now();
      try {
        return await esegui();
      } finally {
        if (passaggio && riga.passaggi.includes(passaggio)) {
          const durata_ms = Math.round(performance.now() - avvio);
          riga.passaggi = riga.passaggi.map(p => p === passaggio ? { ...p, durata_ms } : p);
          pubblica();
        }
      }
    },
    passo: (fase, modello) => aggiorna("in_corso", fase, modello),
    chiudi: aggiorna,
  };
}
