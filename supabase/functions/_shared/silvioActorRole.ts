import type{ToolContext}from'./silvioTools.ts';
/** Resolve current tenant roles for every call, including confirmations and long chats. */
export async function toolActorRoleIsCurrent(ctx:ToolContext):Promise<boolean>{
 try{const {data,error}=await ctx.supabase.rpc('silvio_context_actor_roles',{p_company_id:ctx.companyId,p_user_id:ctx.userId});
  return !error&&Array.isArray(data)&&data.includes(ctx.primaryRole);
 }catch{return false;}
}
