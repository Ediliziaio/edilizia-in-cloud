/** Solo nell’anteprima Vite: nessuna sessione o azienda reale collegata. */
export * from "../../src/contexts/AuthContext";
import type {useAuth as AuthHook} from "../../src/contexts/AuthContext";
const contesto={user:null,company:null,effectiveCompany:null,profile:null,role:null,isLoading:false,isImpersonating:false,impersonatedCompany:null} as ReturnType<typeof AuthHook>;
export function useAuth(){return contesto;}
export function useAuthSelector<T>(selector:(ctx:ReturnType<typeof AuthHook>)=>T){return selector(contesto);}
