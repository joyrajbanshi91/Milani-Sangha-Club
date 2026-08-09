import { api } from '@/lib/api'

/**
 * Public facts about the club, for the public website.
 *
 * The one call on the site that a visitor makes without signing in for anything other
 * than the contact form. It returns a count and nothing else — see
 * `backend/src/routes/club.routes.ts` for why that line is drawn where it is.
 */
export interface ClubStats {
  /**
   * How many members the club has, or `null` when there is no real register to count —
   * a deployment running on demo sign-in, or an API that could not be reached.
   *
   * `null` means "no answer", and the caller shows whatever site.ts says instead. It is
   * never 0: a club with no members and a club whose API is unreachable must not look
   * the same on the front page.
   */
  members: number | null
}

/**
 * The count, or null — this never throws for the caller's purposes.
 *
 * `anonymous` because the home page has no token and attaching one would be a wasted
 * round trip to mint a JWT for a public number.
 *
 * The shape is checked rather than trusted. On Appwrite the site and the API sit on
 * separate domains, so a deployment whose `VITE_API_BASE_URL` is unset asks its own
 * origin, gets `index.html` back, and would otherwise hand the banner a chunk of HTML
 * where a number belongs.
 */
export const clubApi = {
  async stats(): Promise<ClubStats> {
    const payload = await api.get<unknown>('/club/stats', { anonymous: true })
    const members = (payload as ClubStats | null)?.members
    return { members: typeof members === 'number' ? members : null }
  },
}
