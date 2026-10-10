/** Resolve a company_admin, never an arbitrary worker or billing contact. */
export async function platformCompanyAdmin(supabase: any, companyId: string): Promise<{ userId: string; email: string; firstName: string } | null> {
  for (let offset = 0; offset < 10000; offset += 250) {
    const { data: profiles, error } = await supabase.from("profiles").select("id, first_name")
      .eq("company_id", companyId).order("id").range(offset, offset + 249);
    if (error) throw error;
    if (!profiles?.length) return null;
    const { data: roles, error: roleError } = await supabase.from("user_roles").select("user_id")
      .in("user_id", profiles.map((p: any) => p.id)).eq("role", "company_admin").order("user_id");
    if (roleError) throw roleError;
    for (const role of roles ?? []) {
      const { data, error: userError } = await supabase.auth.admin.getUserById(role.user_id);
      if (userError) throw userError;
      if (data?.user?.email) return { userId: role.user_id, email: data.user.email, firstName: profiles.find((p: any) => p.id === role.user_id)?.first_name || "" };
    }
    if (profiles.length < 250) return null;
  }
  throw new Error("Troppi profili per determinare l’amministratore: verifica manualmente");
}
