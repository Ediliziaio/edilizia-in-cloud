/** Il service role non deve rendere leggibile un file scelto nel JSON inbox. */
export function allegatoDentroAzienda(path: string, companyId: string, ownerId: string | null): boolean {
  if (!path || path.startsWith('/') || path.includes('\\') || /%(?:2e|2f|5c)/i.test(path)) return false;
  const parts=path.split('/');
  if (parts.length<2 || parts.some(p=>p==='.' || p==='..' || p==='')) return false;
  return parts[0]===companyId || (!!ownerId && parts[0]===ownerId);
}
