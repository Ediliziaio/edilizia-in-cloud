import { DOMANDE } from "../data/questionario";
import { calcolaProfiloV5, type RispostaInputV5 } from "./scoringV5";
import { calculateAllRolesCompatibilityV5, ROLE_PROFILES_V5, type RoleMatchResultV5 } from "./roleMatchingV5";
import { getActiveSyndromes } from "./syndromes";
import { TRAIT_LABELS, type ReliabilityIndex, type RispostaValueV5, type TraitCode } from "../types";

export type TalentReportCandidate = {
  id: string;
  ruolo_richiesto: string;
};

export type TalentReportPayload = {
  company_id: string;
  candidate_id: string;
  assessment_version: "v5";
  reliability_index: ReliabilityIndex;
  control_unexpected_count: number;
  profile_type: string;
  traits_v5: Record<string, number>;
  macro_areas: {
    essere_pct: number;
    fare_pct: number;
    avere_pct: number;
  };
  role_requested: string;
  role_match: RoleMatchResultV5;
  all_roles: { ruolo: string; compatibilita: number; verdict: string }[];
  syndromes_detected: unknown[];
  strengths: string[];
  improvements: string[];
  valleys: string[];
  generated_at: string;
};

export type TalentReportRecommendation = "ASSUMI" | "VALUTA" | "NON_CONSIGLIATO";

export type TalentReportDecision = {
  recommendation: TalentReportRecommendation;
  label: string;
  tone: "emerald" | "amber" | "red";
  executiveSummary: string;
  risks: string[];
  interviewQuestions: string[];
  nextActions: { title: string; detail: string; priority: "Alta" | "Media" | "Bassa" }[];
  onboardingPlan: { phase: "30 giorni" | "60 giorni" | "90 giorni"; focus: string; actions: string[] }[];
};

export type TalentReportDecisionInput = Omit<TalentReportPayload, "role_match" | "all_roles" | "syndromes_detected"> & {
  role_match?: Partial<RoleMatchResultV5> | null;
  all_roles?: { ruolo: string; compatibilita: number; verdict: string }[];
  syndromes_detected?: unknown[];
};

export type TalentReportPrintHtmlInput = {
  candidateName: string;
  companyName?: string;
  report: TalentReportDecisionInput;
};

type TalentReportSyndrome = {
  code?: string;
  name?: string;
  title?: string;
  severity?: string;
};

function toTalentReportSyndrome(value: unknown): TalentReportSyndrome | null {
  if (!value || typeof value !== "object") return null;
  return value as TalentReportSyndrome;
}

function buildNextActions(
  recommendation: TalentReportRecommendation,
  report: TalentReportDecisionInput,
  risks: string[],
): TalentReportDecision["nextActions"] {
  const missingRequirements = report.role_match?.requisitiMancanti || [];

  if (recommendation === "NON_CONSIGLIATO") {
    return [
      {
        title: "Blocca avanzamento automatico",
        detail: "Non procedere a offerta o inserimento senza validazione manuale di HR e responsabile diretto.",
        priority: "Alta",
      },
      {
        title: "Secondo colloquio di verifica",
        detail: "Usa le domande critiche del report per capire se il dato e confermato da esempi concreti.",
        priority: "Alta",
      },
      {
        title: "Referenze e prova tecnica",
        detail: "Richiedi riscontri esterni o una prova pratica prima di investire altro tempo nella selezione.",
        priority: "Media",
      },
    ];
  }

  if (recommendation === "ASSUMI") {
    return [
      {
        title: "Colloquio finale orientato all'offerta",
        detail: "Valida aspettative economiche, disponibilita, zona operativa e motivazione reale al ruolo.",
        priority: "Alta",
      },
      {
        title: "Offerta con obiettivi dei primi 90 giorni",
        detail: "Collega la proposta a KPI misurabili e al piano 30/60/90 gia suggerito dal report.",
        priority: "Alta",
      },
      {
        title: missingRequirements.length > 0 ? "Verifica requisito residuo" : "Controllo referenze rapido",
        detail: missingRequirements.length > 0
          ? `Approfondisci: ${missingRequirements.slice(0, 2).map((req) => req.label).join(", ")}.`
          : "Conferma esperienza, risultati dichiarati e affidabilita prima della firma.",
        priority: "Media",
      },
    ];
  }

  return [
    {
      title: "Colloquio mirato prima della decisione",
      detail: "Parti dalle domande suggerite e cerca prove comportamentali, non opinioni generiche.",
      priority: "Alta",
    },
    {
      title: "Mini prova o caso pratico",
      detail: "Assegna un task vicino al ruolo reale per verificare metodo, velocita e qualita del ragionamento.",
      priority: "Media",
    },
    {
      title: risks.length > 1 ? "Chiudi i punti di rischio" : "Confronto con responsabile diretto",
      detail: risks.length > 1
        ? "Non avanzare finche i punti di attenzione non sono spiegati con esempi e dati verificabili."
        : "Valuta fit culturale, stile di lavoro e compatibilita con il team che lo seguira.",
      priority: "Media",
    },
  ];
}

export function buildTalentReportPayload({
  companyId,
  candidate,
  answers,
  generatedAt = new Date().toISOString(),
}: {
  companyId: string;
  candidate: TalentReportCandidate;
  answers: Record<number, RispostaValueV5>;
  generatedAt?: string;
}): TalentReportPayload {
  const risposte: RispostaInputV5[] = DOMANDE.map((domanda) => ({
    domanda_id: domanda.id,
    valore: answers[domanda.id],
  })).filter((risposta) => Boolean(risposta.valore));

  const profilo = calcolaProfiloV5(risposte, DOMANDE, true);
  const matching = calculateAllRolesCompatibilityV5(candidate.ruolo_richiesto, profilo.traits_v5);
  const syndromes = getActiveSyndromes(profilo.traits_v5).filter((syndrome) => syndrome.isActive);

  return {
    company_id: companyId,
    candidate_id: candidate.id,
    assessment_version: "v5",
    reliability_index: profilo.reliability_index,
    control_unexpected_count: profilo.control_unexpected_count,
    profile_type: profilo.profilo_tipo_v5,
    traits_v5: profilo.traits_v5,
    macro_areas: {
      essere_pct: profilo.essere_pct,
      fare_pct: profilo.fare_pct,
      avere_pct: profilo.avere_pct,
    },
    role_requested: candidate.ruolo_richiesto,
    role_match: matching.ruoloRichiesto,
    all_roles: matching.tuttiRuoli,
    syndromes_detected: syndromes,
    strengths: profilo.strengths,
    improvements: profilo.improvements,
    valleys: profilo.valleys,
    generated_at: generatedAt,
  };
}

export function buildTalentReportDecision(report: TalentReportDecisionInput): TalentReportDecision {
  const roleMatch = report.role_match;
  const score = Number(roleMatch?.compatibilitaPct || 0);
  const verdict = roleMatch?.verdict || "DA_VALUTARE";
  const criticalReliability = report.reliability_index === "NO" || report.reliability_index === "ZERO" || report.reliability_index === "FORCED";
  const blockingFit = verdict === "NON_IDONEO";
  const redSyndromes = (report.syndromes_detected || [])
    .map(toTalentReportSyndrome)
    .filter((syndrome): syndrome is TalentReportSyndrome => syndrome?.severity === "RED");

  let recommendation: TalentReportRecommendation = "VALUTA";
  if (criticalReliability || blockingFit || redSyndromes.length > 0) {
    recommendation = "NON_CONSIGLIATO";
  } else if (report.reliability_index === "YES" && score >= 75 && verdict === "IDONEO") {
    recommendation = "ASSUMI";
  }

  const label = {
    ASSUMI: "Assumi / porta avanti",
    VALUTA: "Valuta con colloquio mirato",
    NON_CONSIGLIATO: "Non consigliato ora",
  }[recommendation];

  const tone = {
    ASSUMI: "emerald",
    VALUTA: "amber",
    NON_CONSIGLIATO: "red",
  }[recommendation] as TalentReportDecision["tone"];

  const risks = [
    ...(criticalReliability ? [`Attendibilita ${report.reliability_index}: profilo da non usare senza verifica manuale.`] : []),
    ...(blockingFit ? [`Fit ruolo bloccante: ${roleMatch?.motivazione || "ruolo non coerente con il profilo."}`] : []),
    ...redSyndromes.slice(0, 3).map((syndrome) => `Red flag ${syndrome.code || ""}: ${syndrome.name || syndrome.title || "sindrome critica rilevata"}.`),
    ...((roleMatch?.requisitiMancanti || []).slice(0, 3).map((req) => `Requisito da verificare: ${req.label} (${req.valore}/${req.soglia}).`)),
  ];

  const profile = ROLE_PROFILES_V5[report.role_requested];
  const interviewQuestions = [
    ...(roleMatch?.domandeColloquio || profile?.domandeColloquio || []),
    ...((roleMatch?.requisitiMancanti || []).slice(0, 3).map((req) => `Mi faccia un esempio concreto in cui ha dimostrato: ${req.label}.`)),
    ...(risks.length > 0 ? ["Quale situazione lavorativa recente conferma o smentisce questi punti di attenzione?"] : []),
  ].filter(Boolean).slice(0, 8);

  while (interviewQuestions.length < 5) {
    interviewQuestions.push("Quale risultato misurabile ha ottenuto negli ultimi 12 mesi in un ruolo simile?");
  }

  const executiveSummary = [
    `${label}: compatibilita ${score}% per ${report.role_requested}.`,
    `Attendibilita ${report.reliability_index}, profilo ${report.profile_type}.`,
    roleMatch?.motivazione || "Approfondire il colloquio usando le domande suggerite.",
  ].join(" ");

  return {
    recommendation,
    label,
    tone,
    executiveSummary,
    risks: risks.length > 0 ? risks : ["Nessuna red flag bloccante emersa: validare comunque esperienza, referenze e aspettative economiche."],
    interviewQuestions,
    nextActions: buildNextActions(recommendation, report, risks),
    onboardingPlan: [
      {
        phase: "30 giorni",
        focus: "Validazione sul campo",
        actions: [
          "Affiancamento con responsabile diretto e obiettivi settimanali misurabili.",
          "Verifica dei requisiti mancanti emersi dal report.",
        ],
      },
      {
        phase: "60 giorni",
        focus: "Autonomia operativa",
        actions: [
          "Assegnare un progetto o portafoglio reale con KPI chiari.",
          "Feedback strutturato su comunicazione, metodo e gestione pressione.",
        ],
      },
      {
        phase: "90 giorni",
        focus: "Decisione di conferma",
        actions: [
          "Confrontare risultati, fit culturale e capacita di apprendimento.",
          "Decidere conferma, cambio ruolo o piano correttivo.",
        ],
      },
    ],
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function traitLabel(value: string): string {
  return TRAIT_LABELS[value as TraitCode] || value;
}

function renderList(items: unknown[] | undefined, fallback: string): string {
  const safeItems = (items || []).filter(Boolean).slice(0, 8);
  if (safeItems.length === 0) {
    return `<li>${escapeHtml(fallback)}</li>`;
  }

  return safeItems.map((item) => `<li>${escapeHtml(traitLabel(String(item)))}</li>`).join("");
}

function renderNumber(value: unknown, fallback = 0): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

export function buildTalentReportPrintHtml({
  candidateName,
  companyName = "Edilizia in Cloud",
  report,
}: TalentReportPrintHtmlInput): string {
  const decision = buildTalentReportDecision(report);
  const score = Math.max(0, Math.min(100, renderNumber(report.role_match?.compatibilitaPct)));
  const topRoles = (report.all_roles || []).slice(0, 5);
  const generatedDate = report.generated_at ? new Date(report.generated_at) : new Date();
  const generatedLabel = Number.isNaN(generatedDate.getTime())
    ? escapeHtml(report.generated_at)
    : generatedDate.toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
  const macroAreas = [
    { label: "Essere", detail: "Obiettivi, energia e stabilita", value: renderNumber(report.macro_areas?.essere_pct) },
    { label: "Fare", detail: "Esecuzione, vendita e iniziativa", value: renderNumber(report.macro_areas?.fare_pct) },
    { label: "Avere", detail: "Relazione, influenza e collaborazione", value: renderNumber(report.macro_areas?.avere_pct) },
  ];
  const risks = decision.risks.map((risk) => `<li>${escapeHtml(risk)}</li>`).join("");
  const macroAreaRows = macroAreas.map((area) => {
    const value = Math.max(0, Math.min(100, area.value));
    return `
      <div class="macro-row">
        <div><b>${escapeHtml(area.label)}</b><span>${escapeHtml(area.detail)}</span></div>
        <div class="bar"><i style="width:${value}%"></i></div>
        <strong>${value}%</strong>
      </div>
    `;
  }).join("");
  const nextActions = decision.nextActions.map((action) => `
    <article class="action-card">
      <span>${escapeHtml(action.priority)}</span>
      <h3>${escapeHtml(action.title)}</h3>
      <p>${escapeHtml(action.detail)}</p>
    </article>
  `).join("");
  const interviewQuestions = decision.interviewQuestions
    .map((question, index) => `<li><span>${index + 1}</span>${escapeHtml(question)}</li>`)
    .join("");
  const onboardingPlan = decision.onboardingPlan
    .map((step) => `
      <article class="timeline-card">
        <p class="eyebrow">${escapeHtml(step.phase)}</p>
        <h3>${escapeHtml(step.focus)}</h3>
        <ul>${step.actions.map((action) => `<li>${escapeHtml(action)}</li>`).join("")}</ul>
      </article>
    `)
    .join("");
  const roleRows = topRoles.length > 0
    ? topRoles.map((role, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(role.ruolo)}</td>
        <td>${escapeHtml(role.verdict)}</td>
        <td class="right">${escapeHtml(role.compatibilita)}%</td>
      </tr>
    `).join("")
    : `<tr><td colspan="4">Nessun confronto ruolo disponibile.</td></tr>`;

  return `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Talent Assessment - ${escapeHtml(candidateName)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #eef2f7;
      color: #101828;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 20px auto;
      background: #ffffff;
      border: 1px solid #d9e2ef;
      border-radius: 18px;
      box-shadow: 0 24px 70px rgba(15, 23, 42, 0.15);
      overflow: hidden;
    }
    .hero {
      padding: 30px 34px;
      background: linear-gradient(135deg, #111827 0%, #1f2937 48%, #ea580c 100%);
      color: #ffffff;
    }
    .brand { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
    .brand strong { font-size: 13px; letter-spacing: .12em; text-transform: uppercase; color: #fed7aa; }
    .badge {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 6px 10px;
      background: rgba(255,255,255,.14);
      border: 1px solid rgba(255,255,255,.24);
      color: #fff7ed;
      font-size: 12px;
      font-weight: 700;
    }
    h1 { margin: 24px 0 6px; font-size: 32px; line-height: 1.1; letter-spacing: -0.02em; }
    .subtitle { max-width: 720px; margin: 0; color: #e5e7eb; font-size: 14px; }
    .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 24px; }
    .meta {
      border: 1px solid rgba(255,255,255,.2);
      border-radius: 14px;
      padding: 12px;
      background: rgba(255,255,255,.08);
    }
    .meta span, .eyebrow { display: block; margin-bottom: 4px; color: #64748b; font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    .meta span { color: #fed7aa; }
    .meta b { display: block; color: #ffffff; font-size: 14px; }
    .content { padding: 28px 34px 34px; }
    .grid { display: grid; gap: 16px; }
    .grid.two { grid-template-columns: 1.1fr .9fr; }
    .grid.three { grid-template-columns: repeat(3, 1fr); }
    .card {
      break-inside: avoid;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 18px;
      background: #ffffff;
    }
    .decision { border-color: #fed7aa; background: #fff7ed; }
    h2 { margin: 0 0 12px; font-size: 18px; letter-spacing: -0.01em; }
    h3 { margin: 0 0 8px; font-size: 14px; }
    p { margin: 0; }
    ul { margin: 0; padding-left: 18px; }
    li { margin: 6px 0; }
    .score-row { display: grid; grid-template-columns: 88px 1fr 44px; align-items: center; gap: 10px; margin: 14px 0 4px; }
    .bar { height: 10px; overflow: hidden; border-radius: 999px; background: #ffedd5; }
    .bar i { display: block; height: 100%; width: ${score}%; background: #ea580c; }
    .macro-row { display: grid; grid-template-columns: 145px 1fr 42px; gap: 10px; align-items: center; padding: 10px 0; border-top: 1px solid #e2e8f0; }
    .macro-row:first-of-type { border-top: 0; }
    .macro-row b { display: block; font-size: 13px; }
    .macro-row span { display: block; color: #64748b; font-size: 11px; }
    .macro-row strong { color: #c2410c; text-align: right; }
    .action-card { break-inside: avoid; border: 1px solid #fed7aa; border-radius: 14px; padding: 14px; background: #fff7ed; }
    .action-card span { display: inline-flex; margin-bottom: 8px; border-radius: 999px; padding: 3px 8px; background: #ffedd5; color: #9a3412; font-size: 10px; font-weight: 800; text-transform: uppercase; }
    .action-card p { color: #475569; font-size: 13px; }
    .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 14px; }
    .kpi { border: 1px solid #fed7aa; border-radius: 12px; padding: 10px; background: #ffffff; }
    .kpi span { display: block; color: #64748b; font-size: 10px; font-weight: 800; text-transform: uppercase; }
    .kpi b { display: block; margin-top: 4px; font-size: 13px; }
    .question-list { list-style: none; padding: 0; }
    .question-list li { display: grid; grid-template-columns: 26px 1fr; gap: 10px; padding: 9px 0; border-top: 1px solid #e2e8f0; }
    .question-list span {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #fff7ed;
      color: #c2410c;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 12px;
    }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: left; }
    th { color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: .1em; }
    .right { text-align: right; font-weight: 800; color: #c2410c; }
    .timeline-card { break-inside: avoid; border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px; }
    .note {
      margin-top: 18px;
      border: 1px solid #dbeafe;
      border-radius: 14px;
      padding: 14px;
      background: #eff6ff;
      color: #1e3a8a;
      font-size: 12px;
    }
    footer { padding-top: 20px; color: #64748b; font-size: 11px; }
    @media print {
      body { background: #ffffff; }
      .page { width: auto; min-height: auto; margin: 0; border: 0; border-radius: 0; box-shadow: none; }
      .hero { border-radius: 0; }
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="hero">
      <div class="brand">
        <strong>EdiliziaInCloud · Talent Assessment</strong>
        <span class="badge">Report HR V5</span>
      </div>
      <h1>Report Talent Assessment</h1>
      <p class="subtitle">Sintesi operativa per selezione, colloquio e piano di inserimento. Il report supporta la decisione HR, ma non sostituisce colloquio, referenze e valutazione umana.</p>
      <div class="meta-grid">
        <div class="meta"><span>Candidato</span><b>${escapeHtml(candidateName)}</b></div>
        <div class="meta"><span>Azienda</span><b>${escapeHtml(companyName)}</b></div>
        <div class="meta"><span>Ruolo</span><b>${escapeHtml(report.role_requested)}</b></div>
        <div class="meta"><span>Generato</span><b>${generatedLabel}</b></div>
      </div>
    </section>

    <section class="content grid">
      <div class="grid two">
        <article class="card decision">
          <p class="eyebrow">Decisione HR</p>
          <h2>${escapeHtml(decision.label)}</h2>
          <p>${escapeHtml(decision.executiveSummary)}</p>
          <div class="score-row">
            <b>Fit ruolo</b>
            <div class="bar"><i></i></div>
            <b class="right">${score}%</b>
          </div>
          <div class="kpis">
            <div class="kpi"><span>Profilo</span><b>${escapeHtml(report.profile_type)}</b></div>
            <div class="kpi"><span>Attendibilita</span><b>${escapeHtml(report.reliability_index)}</b></div>
            <div class="kpi"><span>Verdetto</span><b>${escapeHtml(report.role_match?.verdict || "Da valutare")}</b></div>
          </div>
        </article>

        <article class="card">
          <p class="eyebrow">Rischi e verifiche</p>
          <h2>Da validare in colloquio</h2>
          <ul>${risks}</ul>
        </article>
      </div>

      <div class="grid three">
        <article class="card">
          <p class="eyebrow">Punti forti</p>
          <h2>Leve da sfruttare</h2>
          <ul>${renderList(report.strengths, "Nessun punto forte dominante rilevato.")}</ul>
        </article>
        <article class="card">
          <p class="eyebrow">Aree da migliorare</p>
          <h2>Training consigliato</h2>
          <ul>${renderList(report.improvements, "Nessuna area critica dominante rilevata.")}</ul>
        </article>
        <article class="card">
          <p class="eyebrow">Tratti bassi</p>
          <h2>Punti sensibili</h2>
          <ul>${renderList(report.valleys, "Nessun tratto basso prioritario.")}</ul>
        </article>
      </div>

      <div class="grid two">
        <article class="card">
          <p class="eyebrow">Macro aree</p>
          <h2>Equilibrio del profilo</h2>
          ${macroAreaRows}
        </article>
        <article class="card">
          <p class="eyebrow">Prossime azioni HR</p>
          <h2>Checklist operativa</h2>
          <div class="grid">${nextActions}</div>
        </article>
      </div>

      <div class="grid two">
        <article class="card">
          <p class="eyebrow">Domande colloquio</p>
          <h2>Script operativo</h2>
          <ol class="question-list">${interviewQuestions}</ol>
        </article>

        <article class="card">
          <p class="eyebrow">Confronto ruoli</p>
          <h2>Ruoli piu compatibili</h2>
          <table>
            <thead><tr><th>#</th><th>Ruolo</th><th>Verdetto</th><th>Fit</th></tr></thead>
            <tbody>${roleRows}</tbody>
          </table>
        </article>
      </div>

      <article class="card">
        <p class="eyebrow">Piano 30/60/90</p>
        <h2>Inserimento e verifica sul campo</h2>
        <div class="grid three">${onboardingPlan}</div>
      </article>

      <div class="note">
        Questo documento e un supporto decisionale. La decisione finale deve restare in capo a HR/responsabile aziendale e va confermata con colloquio, referenze, competenze tecniche e requisiti contrattuali.
      </div>

      <footer>EdiliziaInCloud · Talent Assessment · ${escapeHtml(companyName)}</footer>
    </section>
  </main>
</body>
</html>`;
}
