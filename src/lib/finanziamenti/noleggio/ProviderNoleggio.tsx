import type {ReactNode} from "react";
import type {RepositoryNoleggio} from "./repository";
import {ContestoNoleggio} from "./contesto";
export function ProviderNoleggio({repository,companyId,children}:{repository:RepositoryNoleggio;companyId:string;children:ReactNode}){return <ContestoNoleggio.Provider value={{repository,companyId}}>{children}</ContestoNoleggio.Provider>;}
