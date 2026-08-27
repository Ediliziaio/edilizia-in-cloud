export interface AdminRevenuePlanLike {
  name?: string | null;
  price_monthly?: number | null;
  price_yearly?: number | null;
}

export interface AdminRevenueSubscriptionLike {
  status?: string | null;
  stripe_subscription_id?: string | null;
  billing_period?: string | null;
  billing_cycle?: string | null;
  current_period_end?: string | null;
  subscription_plans?: AdminRevenuePlanLike | null;
}

export interface AdminRevenueCompanyLike {
  id?: string;
  status?: string | null;
  payment_method?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_status?: string | null;
  is_platform_admin_company?: boolean | null;
  subscription_plans?: AdminRevenuePlanLike | AdminRevenuePlanLike[] | null;
  company_subscriptions?:
    | AdminRevenueSubscriptionLike
    | AdminRevenueSubscriptionLike[]
    | null;
}

export type AdminRevenueState =
  | "paying"
  | "complimentary"
  | "free_plan"
  | "not_active"
  | "platform";

// Tutti i valori che identificano un'azienda NON pagante:
// - vuoto/none → metodo non configurato
// - free/trial/gift/gifted/omaggio/gratis → legacy values
// - manual_free/complimentary/comp/comped → policy di regalo (demo, partner, early adopter)
// Il valore canonico in UI è "comped" (selectable in PaymentMethodCard);
// gli altri restano per retrocompatibilità con dati pre-esistenti.
const NON_PAYING_METHODS = new Set([
  "",
  "none",
  "free",
  "trial",
  "gift",
  "gifted",
  "gratis",
  "omaggio",
  "manual_free",
  "complimentary",
  "comp",
  "comped",
]);

const PAID_STRIPE_STATUSES = new Set(["active"]);
const BAD_STRIPE_STATUSES = new Set(["canceled", "cancelled", "unpaid", "past_due"]);

function firstOrSelf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function normalize(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function getCompanyPlan(company: AdminRevenueCompanyLike): AdminRevenuePlanLike | null {
  return firstOrSelf(company.subscription_plans);
}

export function getCompanySubscription(
  company: AdminRevenueCompanyLike
): AdminRevenueSubscriptionLike | null {
  return firstOrSelf(company.company_subscriptions);
}

export function getPlanMonthlyPrice(
  plan: AdminRevenuePlanLike | null | undefined,
  subscription?: AdminRevenueSubscriptionLike | null
): number {
  if (!plan) return 0;
  const billingPeriod = normalize(subscription?.billing_period ?? subscription?.billing_cycle);
  const monthly = Number(plan.price_monthly ?? 0);
  if (billingPeriod === "yearly" || billingPeriod === "annual") {
    const yearly = Number(plan.price_yearly ?? 0);
    return yearly > 0 ? yearly / 12 : monthly;
  }
  return monthly;
}

export function getCompanyMonthlyRevenue(company: AdminRevenueCompanyLike): number {
  const subscription = getCompanySubscription(company);
  const plan = subscription?.subscription_plans ?? getCompanyPlan(company);
  return getPlanMonthlyPrice(plan, subscription);
}

function hasConfiguredManualPayment(company: AdminRevenueCompanyLike): boolean {
  const method = normalize(company.payment_method);
  if (!method || NON_PAYING_METHODS.has(method)) return false;
  if (method === "stripe") {
    const stripeStatus = normalize(company.stripe_subscription_status);
    const subscription = getCompanySubscription(company);
    return (
      PAID_STRIPE_STATUSES.has(stripeStatus) ||
      (normalize(subscription?.status) === "active" && !!subscription?.stripe_subscription_id)
    );
  }
  return true;
}

function hasPaidStripeSubscription(company: AdminRevenueCompanyLike): boolean {
  const stripeStatus = normalize(company.stripe_subscription_status);
  if (PAID_STRIPE_STATUSES.has(stripeStatus)) return true;
  if (BAD_STRIPE_STATUSES.has(stripeStatus)) return false;

  const subscription = getCompanySubscription(company);
  return normalize(subscription?.status) === "active" && !!subscription?.stripe_subscription_id;
}

export function getAdminRevenueState(company: AdminRevenueCompanyLike): AdminRevenueState {
  if (company.is_platform_admin_company) return "platform";
  if (company.status !== "active") return "not_active";

  const monthlyRevenue = getCompanyMonthlyRevenue(company);
  if (monthlyRevenue <= 0) return "free_plan";

  // Marcare un'azienda come regalata e' una decisione esplicita ("questa non la
  // fatturo") e batte un eventuale abbonamento Stripe rimasto attivo da prima.
  // Il metodo vuoto non dichiara niente: quello lo decide Stripe piu' sotto.
  const declaredMethod = normalize(company.payment_method);
  if (declaredMethod && NON_PAYING_METHODS.has(declaredMethod)) return "complimentary";

  if (hasPaidStripeSubscription(company) || hasConfiguredManualPayment(company)) {
    return "paying";
  }

  return "complimentary";
}

export function isRevenueEligibleCompany(company: AdminRevenueCompanyLike): boolean {
  return getAdminRevenueState(company) === "paying";
}

export function getAdminRevenueBreakdown(companies: AdminRevenueCompanyLike[]) {
  return companies.reduce(
    (acc, company) => {
      if (company.is_platform_admin_company) return acc;

      const state = getAdminRevenueState(company);
      const monthlyRevenue = getCompanyMonthlyRevenue(company);

      acc.totalCompanies += 1;
      if (company.status === "active") acc.accessActiveCompanies += 1;

      if (state === "paying") {
        acc.payingCompanies += 1;
        acc.mrr += monthlyRevenue;
      } else if (state === "complimentary") {
        acc.nonPayingActiveCompanies += 1;
        acc.excludedMrr += monthlyRevenue;
      } else if (state === "free_plan") {
        acc.freeActiveCompanies += 1;
      }

      return acc;
    },
    {
      totalCompanies: 0,
      accessActiveCompanies: 0,
      payingCompanies: 0,
      nonPayingActiveCompanies: 0,
      freeActiveCompanies: 0,
      mrr: 0,
      excludedMrr: 0,
    }
  );
}
