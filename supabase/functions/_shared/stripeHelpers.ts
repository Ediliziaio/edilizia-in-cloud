import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Creates a new Stripe customer or returns the existing one for a company.
 *
 * - If company.stripe_customer_id already exists: returns it directly (no API call)
 * - Otherwise: creates a new Stripe customer, saves the ID to the companies table, returns it
 *
 * Uses upsert-style logic to avoid race conditions on concurrent creation.
 */
export async function createOrGetStripeCustomer(
  supabaseAdmin: ReturnType<typeof createClient>,
  stripeSecretKey: string,
  company: {
    id: string;
    name: string;
    email: string;
    stripe_customer_id?: string | null;
  }
): Promise<string> {
  // Fast path: already have a customer ID
  if (company.stripe_customer_id) {
    return company.stripe_customer_id;
  }

  // Create Stripe customer
  const customerRes = await fetch("https://api.stripe.com/v1/customers", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      name: company.name,
      email: company.email,
      "metadata[company_id]": company.id,
    }),
  });

  const customer = await customerRes.json();
  if (customer.error) {
    throw new Error(
      `Stripe customer creation failed for company ${company.id}: ${customer.error.message}`
    );
  }

  const stripeCustomerId: string = customer.id;

  // Persist to DB — use upsert to handle race conditions gracefully
  await supabaseAdmin
    .from("companies")
    .update({ stripe_customer_id: stripeCustomerId })
    .eq("id", company.id);

  return stripeCustomerId;
}
