import { createContext, useContext } from "react";

export const SurveyAccessContext = createContext({
  field: false,
  canEdit: true,
});
export const useSurveyAccess = () => useContext(SurveyAccessContext);
