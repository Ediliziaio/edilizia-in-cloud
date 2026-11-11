/** Solo l’anteprima locale: query aziendali disabilitate, nessuna sessione reale. */
export function useEffectiveCompanyId(): string | null { return null; }
export function usePermissions() { return { canViewMargins: true, canViewCosts: true,canViewSettingsFinanziamenti:true,canEditSettingsFinanziamenti:true }; }
