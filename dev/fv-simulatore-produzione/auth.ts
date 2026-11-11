export * from "../../src/contexts/AuthContext";
import type {useAuth as AuthHook} from "../../src/contexts/AuthContext";
const ctx={user:null,company:null,effectiveCompany:{id:"00000000-0000-4000-a000-000000000001",name:"Azienda di collaudo locale"},profile:null,role:null,isLoading:false,isImpersonating:false,impersonatedCompany:null} as ReturnType<typeof AuthHook>;
export const useAuth=()=>ctx;
export function useAuthSelector<T>(fn:(c:ReturnType<typeof AuthHook>)=>T){return fn(ctx);}
