import {createContext} from "react";
import type {RepositoryNoleggio} from "./repository";
export const ContestoNoleggio=createContext<{repository:RepositoryNoleggio;companyId:string}|null>(null);
