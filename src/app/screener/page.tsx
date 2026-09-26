import { ruleSet } from "@/lib/rules/load";
import { Screener } from "./Screener";

// page.tsx is a Server Component, so the zod schema validation in
// @/lib/rules/load (and zod itself) runs on the server and never ships to
// the browser. The already-validated data is passed down as a plain prop;
// Screener.tsx only imports *types* from @/lib/rules/schema, which are
// erased at compile time. This keeps zod + the raw rules JSON's schema
// machinery out of the /screener client bundle.
export default function ScreenerPage() {
  return <Screener ruleSet={ruleSet} />;
}
