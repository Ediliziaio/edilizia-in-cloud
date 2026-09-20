/**
 * Una funzione con verify_jwt = false deve controllare da sé chi la chiama.
 *
 * Con verify_jwt = false il gateway lascia passare chiunque: la porta la tiene
 * chiusa solo il codice. Il 20/09/2026 otto funzioni erano pubblicate così e
 * dentro non guardavano niente: lavoravano con la chiave di servizio, quindi a
 * chi conosceva l'URL bastava una chiamata per far partire il report CFO di
 * tutte le aziende, o far rispondere l'AI su WhatsApp a spese di un'azienda.
 * (verify_jwt = true non sarebbe bastato: la chiave anon è un JWT valido ed è
 * pubblica, sta nel pacchetto dell'app.)
 *
 * Il test gemello, funzioniChiamateSenzaJwt, guarda il verso opposto: chi
 * viene chiamato senza JWT deve avere la voce. Questo guarda che la voce non
 * resti senza guardiano.
 *
 * Una funzione nuova con verify_jwt = false passa in due modi:
 *   1. usa un controllo riconosciuto (segreto del cron, utente, firma…);
 *   2. è aperta di proposito — un modulo pubblico, un pixel, una firma via
 *      token — e allora va scritta in PUBBLICHE_DI_PROPOSITO col motivo.
 * È lo stesso patto di `funzioni_pubbliche_di_proposito` nel database.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chiamataInternaValida } from "../../../supabase/functions/_shared/chiamataInterna";
import { funzioniSenzaJwt } from "./leggiConfigFunzioni";

const ROOT = join(__dirname, "../../..");
const FUNZIONI = join(ROOT, "supabase/functions");
const config = readFileSync(join(ROOT, "supabase/config.toml"), "utf8");

/** Le funzioni con verify_jwt = false, lette come le legge la CI. */
const aperte = funzioniSenzaJwt(config);

/**
 * Cosa conta come controllo. Si guarda la LETTURA di una credenziale in arrivo
 * o la chiamata a un aiutante che la verifica — non le parole: tutte le otto
 * funzioni del guasto nominavano SUPABASE_SERVICE_ROLE_KEY, e due scrivevano
 * «Authorization: Bearer …» nelle chiamate in USCITA.
 */
const CONTROLLI: Record<string, RegExp> = {
  aiutante:
    /\b(requireAuth|requireRole|requireCompanyAccess|requireInternalSecret|isInternalRequest|cronSecretValido|chiamataInternaValida|verifyServiceRoleOrSuperAdmin|verificaFirmaElevenLabs|chiaveUrlValida)\s*\(/,
  utente: /\bauth\s*\.\s*(getClaims|getUser)\s*\(/,
  autorizzazioneInArrivo: /headers\s*\.\s*get\(\s*["'`]authorization["'`]\s*\)/i,
  intestazioneSegreta:
    /headers\s*\.\s*get\(\s*["'`](x-[a-z0-9-]*(secret|key|signature|token)[a-z0-9-]*|stripe-signature|svix-signature|webhook-signature|elevenlabs-signature|xi-signature|telnyx-signature-ed25519)["'`]\s*\)/i,
  firma:
    /crypto\s*\.\s*subtle\s*\.\s*(sign|verify)\s*\(|\btimingSafeEqual\s*\(|\bverif(y|ica)\w*(Sig|Signature|Firma|SignedRequest)\w*\s*\(|\bfirmaValida\s*\(/,
};

/** I file .ts di una funzione, con i commenti a inizio riga tolti. */
function sorgente(funzione: string): string {
  const file: string[] = [];
  const gira = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const p = join(dir, nome);
      if (statSync(p).isDirectory()) gira(p);
      else if (nome.endsWith(".ts")) file.push(p);
    }
  };
  gira(join(FUNZIONI, funzione));
  return file.map((p) => readFileSync(p, "utf8")).join("\n");
}

/**
 * Un controllo citato in un commento non è un controllo. Si tolgono solo i
 * commenti che cominciano a inizio riga: una stringa come "image/*" in mezzo
 * al codice, presa per l'apertura di un commento, si mangerebbe mezzo file.
 */
function senzaCommenti(testo: string): string {
  return testo.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

function controlliRiconosciuti(testo: string): string[] {
  const codice = senzaCommenti(testo);
  return Object.entries(CONTROLLI).filter(([, re]) => re.test(codice)).map(([nome]) => nome);
}

/**
 * Aperte di proposito: chi chiama non ha e non può avere una credenziale
 * nostra. La difesa è un'altra, ed è scritta qui. Censite il 20/09/2026.
 */
const PUBBLICHE_DI_PROPOSITO: Record<string, string> = {
  "accountant-self-signup": "registrazione dal portale commercialisti: limite di 3 per IP al giorno, email da confermare",
  "referral-self-signup": "registrazione dal portale partner: limite di 3 per IP al giorno, email da confermare",
  "public-checkout": "pagina pubblica /offerta/:slug: crea l'azienda bloccata finché Stripe non conferma il pagamento",
  "public-lead-submit": "modulo contatti del sito pubblico: il visitatore è anonimo per definizione",
  "public-chat-widget": "chat incorporata nei siti dei clienti: widget_token dell'azienda, limite per visitatore e IP",
  "public-booking-crea": "prenotazione da /prenota/:slug: vale solo per calendari pubblici e attivi, regole lato server",
  "public-booking-gestisci": "il cliente sposta o disdice dal link personale: il token vale per quel solo appuntamento",
  "form-render": "mostra un modulo pubblico incorporabile: sola lettura della configurazione del modulo",
  "form-submit": "invio di un modulo pubblico: il visitatore è anonimo, scrive solo nel perimetro del modulo",
  "candidatura-submit": "modulo di candidatura /candidatura/:token: il token del modulo, revocabile, è l'unica porta",
  "quote-sign": "firma del preventivo dal link inviato al cliente: il token del preventivo è la chiave",
  "sr-firma-cliente": "firma del cliente dal microsito: il token del progetto è la chiave",
  "fea-documento-pubblico": "documento da firmare aperto dal link col token; l'email del firmatario esce mascherata",
  "email-sequenze-optout": "disiscrizione dal piede delle email: il token di uscita è il segreto",
  "email-inbound-reply": "posta in arrivo da Elastic Email: l'id della route è un uuid, più ?key= se INBOUND_EMAIL_SECRET è impostato",
  "check-login-security": "controllo PRIMA dell'accesso (tentativi falliti, blocco): per forza senza utente",
  "attribution-capture": "provenienza del visitatore sul sito pubblico: scrive solo righe di attribuzione, IP in hash",
  "site-track": "pagine viste sul sito pubblico: scrive solo sessioni e visite",
  "lead-scraper-track": "pixel e click delle email del lead scraper: aggiorna solo i contatori del record indicato",
  "track-referral-click": "click su un link partner: registra il click, IP in hash",
};

describe("verify_jwt = false: il controllo su chi chiama sta nel codice", () => {
  it("config.toml si legge, sezione per sezione", () => {
    expect(aperte.length).toBeGreaterThan(200);
    // Una sezione vuota non si prende la voce di quella dopo: era il difetto
    // della lettura con la regex, e nascondeva check-lifecycle-events.
    const prova = "[functions.vuota]\n\n[functions.aperta]\nverify_jwt = false\n\n[functions.chiusa]\nverify_jwt = true\n\n[auth]\nverify_jwt = false\n";
    expect(funzioniSenzaJwt(prova)).toEqual(["aperta"]);
    expect(aperte).toContain("check-lifecycle-events");
    expect(aperte).not.toContain("google-calendar-sync");
  });

  it("ogni funzione aperta ha un controllo riconosciuto, o è pubblica di proposito col motivo scritto", () => {
    const scoperte = aperte
      .filter((f) => existsSync(join(FUNZIONI, f, "index.ts")))
      .filter((f) => !(f in PUBBLICHE_DI_PROPOSITO))
      .filter((f) => controlliRiconosciuti(sorgente(f)).length === 0);
    // Se questo elenco non è vuoto: la funzione lavora per chiunque conosca
    // l'URL. Aggiungere il controllo (chiamataInternaValida per cron e funzioni,
    // requireAuth per l'app) oppure, se è pubblica di proposito, scriverla in
    // PUBBLICHE_DI_PROPOSITO col motivo.
    expect(scoperte).toEqual([]);
  });

  it("chi è pubblica di proposito esiste, è aperta davvero, e ha un motivo scritto", () => {
    for (const [funzione, motivo] of Object.entries(PUBBLICHE_DI_PROPOSITO)) {
      expect(existsSync(join(FUNZIONI, funzione, "index.ts")), funzione).toBe(true);
      expect(aperte, funzione).toContain(funzione);
      expect(motivo.length, funzione).toBeGreaterThan(30);
    }
  });

  it("le parole non bastano: chiave di servizio e Authorization in uscita non sono un controllo", () => {
    // Così erano fatte le otto funzioni del 20/09/2026.
    const comeIlGuasto = `
      Deno.serve(async (req) => {
        const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        // requireAuth(req) — citato in un commento, non chiamato
        await fetch(url, { headers: { "Authorization": \`Bearer \${serviceKey}\` } });
      });`;
    expect(controlliRiconosciuti(comeIlGuasto)).toEqual([]);
    expect(controlliRiconosciuti(`if (!chiamataInternaValida(req)) return rispostaNonAutorizzata();`)).toEqual(["aiutante"]);
    expect(controlliRiconosciuti(`const accept = "image/*"; const k = req.headers.get("x-cron-secret");`)).toEqual([
      "intestazioneSegreta",
    ]);
  });
});

describe("Le otto funzioni trovate aperte il 20/09/2026: tre chiuse, cinque eliminate", () => {
  const leggi = (funzione: string) => readFileSync(join(FUNZIONI, funzione, "index.ts"), "utf8");

  // Il controllo viene prima della chiave di servizio, cioè prima di ogni lavoro.
  const primaIlControllo = (funzione: string) => {
    const testo = senzaCommenti(leggi(funzione));
    const controllo = testo.indexOf("if (!chiamataInternaValida(req)) return rispostaNonAutorizzata(");
    expect(controllo).toBeGreaterThan(-1);
    expect(controllo).toBeLessThan(testo.indexOf("createClient("));
    expect(aperte).toContain(funzione);
  };

  // I due processori che rispondono ai clienti su WhatsApp: restano.
  it.each(["assistenza-ai-processor", "lead-ai-processor"])(
    "%s — prima il controllo, poi la chiave di servizio",
    primaIlControllo,
  );

  // Le cinque eliminate il 20/09/2026, col sì di Florin: quattro giri su tutte
  // le aziende per un cron mai creato (nessun chiamante fra i 143 job, l'app,
  // le altre funzioni e il database) e una che rispondeva solo 410.
  // Non devono tornare per sbaglio; e se tornano, la voce va con la cartella:
  // una voce senza cartella fa fallire la pubblicazione di TUTTE le funzioni.
  it.each([
    "ai-cfo-weekly-report",
    "ai-fiscal-report-generator",
    "ai-pipeline-forecaster",
    "subappaltatori-compliance-monitor",
    "ai-outbound-call",
  ])("%s — eliminata: niente cartella, niente voce", (funzione) => {
    expect(existsSync(join(FUNZIONI, funzione))).toBe(false);
    expect(config).not.toContain(`[functions.${funzione}]`);
  });

  it("get-openrouter-models — serve un utente, prima di chiamare OpenRouter", () => {
    const testo = senzaCommenti(leggi("get-openrouter-models"));
    const controllo = testo.indexOf("await requireAuth(req, cors)");
    expect(controllo).toBeGreaterThan(-1);
    expect(controllo).toBeLessThan(testo.indexOf("fetch(OR_MODELS_URL"));
    expect(aperte).toContain("get-openrouter-models");
  });
});

describe("chiamataInternaValida: chi passa e chi no", () => {
  const CHIAVE_DI_SERVIZIO = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.firma-vera-del-progetto";
  const SEGRETO = "segreto-del-cron-di-prova";

  const conAmbiente = (ambiente: Record<string, string>) =>
    vi.stubGlobal("Deno", { env: { get: (nome: string) => ambiente[nome] } });

  const richiesta = (headers: Record<string, string> = {}) =>
    new Request("https://esempio.supabase.co/functions/v1/assistenza-ai-processor", { method: "POST", headers });

  afterEach(() => vi.unstubAllGlobals());

  it("senza credenziali non passa: era il guasto", () => {
    conAmbiente({ SUPABASE_SERVICE_ROLE_KEY: CHIAVE_DI_SERVIZIO, INTERNAL_CRON_SECRET: SEGRETO });
    expect(chiamataInternaValida(richiesta())).toBe(false);
    expect(chiamataInternaValida(richiesta({ "Content-Type": "application/json" }))).toBe(false);
  });

  it("la chiave anon è pubblica: non passa, e nemmeno un JWT che si dichiara service_role", () => {
    conAmbiente({ SUPABASE_SERVICE_ROLE_KEY: CHIAVE_DI_SERVIZIO, INTERNAL_CRON_SECRET: SEGRETO });
    const anon = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.firma";
    // Stessa intestazione e stesso payload della chiave vera, firma inventata.
    const falso = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.firma-inventata-da-chi-chiama";
    expect(chiamataInternaValida(richiesta({ Authorization: `Bearer ${anon}` }))).toBe(false);
    expect(chiamataInternaValida(richiesta({ Authorization: `Bearer ${falso}` }))).toBe(false);
    expect(chiamataInternaValida(richiesta({ Authorization: CHIAVE_DI_SERVIZIO }))).toBe(false);
  });

  it("passa whatsapp-webhook, che manda la chiave di servizio", () => {
    conAmbiente({ SUPABASE_SERVICE_ROLE_KEY: CHIAVE_DI_SERVIZIO });
    expect(chiamataInternaValida(richiesta({ Authorization: `Bearer ${CHIAVE_DI_SERVIZIO}` }))).toBe(true);
  });

  it("passa il cron, con uno qualunque dei segreti configurati e dei due nomi di intestazione", () => {
    conAmbiente({ SUPABASE_SERVICE_ROLE_KEY: CHIAVE_DI_SERVIZIO, PROACTIVE_CRON_SECRET: SEGRETO });
    expect(chiamataInternaValida(richiesta({ "x-cron-secret": SEGRETO }))).toBe(true);
    expect(chiamataInternaValida(richiesta({ "x-internal-cron-secret": SEGRETO }))).toBe(true);
    expect(chiamataInternaValida(richiesta({ "x-cron-secret": "sbagliato" }))).toBe(false);
  });

  it("se mancano le variabili non passa nessuno: meglio ferma che aperta", () => {
    conAmbiente({});
    expect(chiamataInternaValida(richiesta({ Authorization: "Bearer undefined" }))).toBe(false);
    expect(chiamataInternaValida(richiesta({ Authorization: "Bearer " }))).toBe(false);
    expect(chiamataInternaValida(richiesta({ "x-cron-secret": "" }))).toBe(false);
  });
});
