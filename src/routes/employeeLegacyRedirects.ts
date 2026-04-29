export const EMPLOYEE_LEGACY_REDIRECTS = {
  root: "/campo",
  ore: "/campo/timbratura",
  rapportini: "/campo",
  profilo: "/campo/profilo",
  ferie: "/campo/ferie",
  fallback: "/campo",
} as const;

export type EmployeeLegacyRedirectKey = keyof typeof EMPLOYEE_LEGACY_REDIRECTS;

