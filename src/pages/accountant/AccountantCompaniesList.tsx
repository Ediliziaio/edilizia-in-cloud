/**
 * /commercialista/aziende — legacy route.
 *
 * La lista aziende clienti è ora integrata nel Cruscotto (AccountantDashboard).
 * Questa rotta sopravvive per retrocompatibilità link esterni / bookmark
 * e fa redirect immediato.
 */

import { Navigate } from "react-router-dom";

export default function AccountantCompaniesList() {
  return <Navigate to="/commercialista" replace />;
}
