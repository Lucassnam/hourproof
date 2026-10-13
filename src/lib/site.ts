// Facts about the project that the About and Privacy pages state. One place, so the pages
// and the README can't drift apart. If one of these changes, the copy in messages/*.json
// under "about" and "privacy" may need to change with it.

export const REPO_URL = 'https://github.com/Lucassnam/hourproof'
export const ISSUES_URL = `${REPO_URL}/issues`
export const AI_USE_URL = `${REPO_URL}/blob/main/docs/AI-USE.md`

// Where people can write to the team. Deliberately not hard-coded: it is the team's call
// which address to publish, so it comes from NEXT_PUBLIC_CONTACT_EMAIL (set it in Vercel and
// in .env.local). Until it is set, the About page offers the GitHub issues page instead.
// The variable is read with a literal `process.env.NEXT_PUBLIC_…` access on purpose: that is
// the only form Next inlines for the browser.
export function contactEmail(): string | null {
  const value = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim()
  return value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null
}
