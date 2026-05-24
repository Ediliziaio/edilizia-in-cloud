export type AccessRole =
  | "company_admin"
  | "company_staff"
  | "salesperson"
  | "call_center"
  | "employee"
  | "subcontractor";

export type AccessRiskLevel = "low" | "medium" | "high";

export type AccessRiskInput = {
  id?: string;
  roles: string[];
  require2fa: boolean;
  isBlocked: boolean;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  activeSessions: number;
  hasCrossCompanyAccess: boolean;
  hasCriticalPermissions: boolean;
};

export type AccessRiskResult = {
  level: AccessRiskLevel;
  score: number;
  reasons: string[];
  nextAction: string;
};

export type AccessGovernanceSummary = {
  totalUsers: number;
  admins: number;
  adminsWithout2fa: number;
  blockedUsers: number;
  lockedUsers: number;
  neverLoggedUsers: number;
  inactiveUsers: number;
  crossCompanyUsers: number;
  externalUsers: number;
  criticalPermissionUsers: number;
  highRiskUsers: number;
  mediumRiskUsers: number;
  lowRiskUsers: number;
  securityScore: number;
};

const ROLE_ORDER: AccessRole[] = [
  "company_admin",
  "company_staff",
  "employee",
  "subcontractor",
  "salesperson",
  "call_center",
];

const KNOWN_ROLES = new Set<string>([...ROLE_ORDER, "worker"]);

export function normalizeAccessRoles(roles: string[] | null | undefined): AccessRole[] {
  const normalized = new Set<AccessRole>();
  for (const role of roles ?? []) {
    if (!KNOWN_ROLES.has(role)) continue;
    normalized.add(role === "worker" ? "employee" : role as AccessRole);
  }
  return ROLE_ORDER.filter((role) => normalized.has(role));
}

export function hasAdminRole(roles: string[] | null | undefined): boolean {
  return normalizeAccessRoles(roles).includes("company_admin");
}

export function hasExternalRole(roles: string[] | null | undefined): boolean {
  const normalized = normalizeAccessRoles(roles);
  return normalized.includes("employee") || normalized.includes("subcontractor");
}

function daysSince(dateValue: string | null, now: Date): number | null {
  if (!dateValue) return null;
  const time = new Date(dateValue).getTime();
  if (Number.isNaN(time)) return null;
  return Math.max(0, Math.floor((now.getTime() - time) / 86_400_000));
}

function isLocked(lockedUntil: string | null, now: Date): boolean {
  if (!lockedUntil) return false;
  const time = new Date(lockedUntil).getTime();
  return Number.isFinite(time) && time > now.getTime();
}

export function evaluateAccessRisk(input: AccessRiskInput, now = new Date()): AccessRiskResult {
  const roles = normalizeAccessRoles(input.roles);
  const isAdmin = roles.includes("company_admin");
  const isExternal = roles.includes("employee") || roles.includes("subcontractor");
  const inactiveDays = daysSince(input.lastLoginAt, now);
  const reasons: string[] = [];
  let score = 0;

  if (input.isBlocked) {
    reasons.push("Accesso bloccato");
    score += 15;
  }

  if (isLocked(input.lockedUntil, now)) {
    reasons.push("Blocco temporaneo attivo");
    score += 20;
  }

  if (isAdmin && !input.require2fa) {
    reasons.push("Admin senza 2FA");
    score += 45;
  } else if (input.hasCriticalPermissions && !input.require2fa) {
    reasons.push("Permessi critici senza 2FA");
    score += 30;
  }

  if (!input.lastLoginAt) {
    reasons.push("Mai connesso");
    score += isAdmin ? 30 : 18;
  } else if (inactiveDays !== null && inactiveDays >= 90) {
    reasons.push(`Inattivo da ${inactiveDays} giorni`);
    score += isAdmin ? 28 : 18;
  } else if (inactiveDays !== null && inactiveDays >= 45 && input.hasCriticalPermissions) {
    reasons.push(`Permessi critici inattivi da ${inactiveDays} giorni`);
    score += 16;
  }

  if (input.hasCrossCompanyAccess) {
    reasons.push("Accesso multi-azienda");
    score += isAdmin ? 18 : 12;
  }

  if (isExternal && input.hasCriticalPermissions) {
    reasons.push("Accesso esterno con permessi critici");
    score += 32;
  }

  if (input.activeSessions > 3) {
    reasons.push(`${input.activeSessions} sessioni attive`);
    score += 12;
  }

  const level: AccessRiskLevel = score >= 55 ? "high" : score >= 25 ? "medium" : "low";
  const nextAction = level === "high"
    ? "Intervento richiesto"
    : level === "medium"
      ? "Da rivedere"
      : "Presidio ok";

  return {
    level,
    score,
    reasons: reasons.length ? reasons : ["Nessuna criticita evidente"],
    nextAction,
  };
}

export function buildAccessGovernanceSummary(
  users: AccessRiskInput[],
  now = new Date(),
): AccessGovernanceSummary {
  const initial: AccessGovernanceSummary = {
    totalUsers: users.length,
    admins: 0,
    adminsWithout2fa: 0,
    blockedUsers: 0,
    lockedUsers: 0,
    neverLoggedUsers: 0,
    inactiveUsers: 0,
    crossCompanyUsers: 0,
    externalUsers: 0,
    criticalPermissionUsers: 0,
    highRiskUsers: 0,
    mediumRiskUsers: 0,
    lowRiskUsers: 0,
    securityScore: 100,
  };

  const summary = users.reduce((acc, user) => {
    const roles = normalizeAccessRoles(user.roles);
    const risk = evaluateAccessRisk(user, now);
    const inactiveDays = daysSince(user.lastLoginAt, now);

    if (roles.includes("company_admin")) acc.admins += 1;
    if (roles.includes("company_admin") && !user.require2fa) acc.adminsWithout2fa += 1;
    if (user.isBlocked) acc.blockedUsers += 1;
    if (isLocked(user.lockedUntil, now)) acc.lockedUsers += 1;
    if (!user.lastLoginAt) acc.neverLoggedUsers += 1;
    if (inactiveDays !== null && inactiveDays >= 90) acc.inactiveUsers += 1;
    if (user.hasCrossCompanyAccess) acc.crossCompanyUsers += 1;
    if (roles.includes("employee") || roles.includes("subcontractor")) acc.externalUsers += 1;
    if (user.hasCriticalPermissions) acc.criticalPermissionUsers += 1;
    if (risk.level === "high") acc.highRiskUsers += 1;
    if (risk.level === "medium") acc.mediumRiskUsers += 1;
    if (risk.level === "low") acc.lowRiskUsers += 1;

    return acc;
  }, initial);

  const penalty = (summary.highRiskUsers * 18) + (summary.mediumRiskUsers * 7) + (summary.adminsWithout2fa * 8);
  summary.securityScore = Math.max(0, Math.min(100, 100 - penalty));
  return summary;
}
