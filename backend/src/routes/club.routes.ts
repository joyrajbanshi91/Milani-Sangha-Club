import { Router, type Request, type Response } from 'express'

import { getContainer } from '../services/container.js'

/**
 * Public facts about the club, for the public website.
 *
 * One route, and it returns one number: how many members the club has. That is all it
 * may ever return. The public site needs a figure for its banner and nothing else here
 * is anybody's business — so this router deliberately has no access to names, emails,
 * roles or payments, and adding a field to it should feel like the decision it is.
 *
 * **Why a count is publishable when the register is not.** A club advertises its size;
 * that is a fact about the institution. The register is a list of identified people and
 * what they owe, which is why `/finance/members` sits behind two guards. The line
 * between the two is the whole reason this is a separate router rather than an
 * unauthenticated hole in that one.
 *
 * Two things keep it cheap. It is **cached in the process** for five minutes, because
 * counting means paginating every account out of the authentication service and a
 * popular home page would otherwise do that on every visit. And it sends a
 * `Cache-Control` of the same length, so a browser returning to the site does not ask
 * again at all.
 */
export const clubRouter = Router()

const { auth } = getContainer()

/** How long a count is reused before it is looked up again. */
const CACHE_MS = 5 * 60_000

let cached: { members: number; at: number } | null = null

/**
 * `members` is `null`, never 0, when there is no real register to count.
 *
 * A deployment with no credentials runs on demo sign-in, where the accounts are a
 * handful of fixtures. Publishing *that* as the club's membership would put a wrong
 * number on the front page of the website, which is worse than putting none there: the
 * site treats null as "no answer" and shows whatever the content file says instead.
 * Zero would have been indistinguishable from a club that has genuinely lost everybody.
 */
async function memberCount(req: Request): Promise<number | null> {
  if (auth.mode === 'demo') return null

  const now = Date.now()
  if (cached && now - cached.at < CACHE_MS) return cached.members

  try {
    const accounts = await auth.listAccounts()
    cached = { members: accounts.length, at: now }
    return cached.members
  } catch (error) {
    // A stale count beats no count: the number moves a few times a year, so last
    // period's answer is still true enough for a banner, and the alternative is the
    // figure disappearing from the website every time the auth service hiccups.
    req.log.error({ err: error }, 'member count failed')
    return cached?.members ?? null
  }
}

clubRouter.get('/stats', async (req: Request, res: Response) => {
  const members = await memberCount(req)

  res.set('Cache-Control', `public, max-age=${Math.round(CACHE_MS / 1000)}`)
  res.json({ members })
})

/** Test seam: the cache is process-wide, so a suite must be able to empty it. */
export function resetClubStatsCache(): void {
  cached = null
}
