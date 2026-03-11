/**
 * Shared type guards for runtime type checking of Supabase join results.
 */

export interface CustomerProfile {
  first_name: string;
  last_name: string;
}

export function isCustomerProfile(obj: unknown): obj is CustomerProfile {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "first_name" in obj &&
    "last_name" in obj &&
    typeof (obj as CustomerProfile).first_name === "string" &&
    typeof (obj as CustomerProfile).last_name === "string"
  );
}
