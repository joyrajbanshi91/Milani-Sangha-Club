#!/usr/bin/env node
/**
 * Refuse to let the club's private data become tracked by git.
 *
 *   npm run check:private
 *
 * ## Why this is a build step and not a note in a README
 *
 * This repository is public, and `data/club/members.csv` was tracked for one commit
 * before anyone noticed. It happened to contain only `example.com` placeholders at the
 * time, so nothing real was published — but the next `git add -A` after the club filled
 * it in would have pushed four people's names and email addresses to a public GitHub
 * repository, permanently. Deleting a file does not remove it from the history.
 *
 * A `.gitignore` entry prevents that, and this check proves the entry is still doing its
 * job. The two failure modes it catches:
 *
 *   * a private data file that is tracked — usually because someone used
 *     `git add -f`, or the ignore rule was edited;
 *   * a real-looking email address inside any tracked file, which is how personal data
 *     reaches a public repository even when the obvious files are ignored.
 *
 * Runs in `npm run verify` and in CI.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

/** Paths that must never be tracked, as glob-ish prefixes and suffixes. */
const MUST_NOT_BE_TRACKED = [
  { match: (p) => p.startsWith('data/club/') && p.endsWith('.csv') && !p.endsWith('.csv.example'),
    why: "the club's own members, funds and ledger" },
  { match: (p) => p.startsWith('backups/'), why: 'a database dump containing member data' },
  { match: (p) => /(^|\/)\.env$/.test(p) || /(^|\/)\.env\.[^/]*$/.test(p) && !p.endsWith('.example'),
    why: 'credentials' },
  { match: (p) => /serviceAccount|service-account/i.test(p) && p.endsWith('.json'),
    why: 'a service account key' },
]

/**
 * Addresses that are obviously not real people.
 *
 * `example.com`, `example.org`, `.test` and `.invalid` are reserved for documentation by
 * RFC 2606 precisely so they can appear in public without belonging to anyone.
 * `demo.club` is added because the built-in demo accounts use it and they are fixtures,
 * not people. Everything else is treated as somebody's real address — including
 * plausible-looking domains like `club.org`, which is registrable and therefore belongs
 * to someone.
 */
const PLACEHOLDER =
  /@(example\.(com|org|net)|[a-z0-9-]+\.(test|invalid|example)|demo\.club|localhost)$/i
const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

/**
 * Files where an address is legitimately present.
 *
 * Commit trailers and the author's own address in git config are not in scope here, but
 * documentation that shows a contact address, and this file's own patterns, are.
 */
const ALLOWED_TO_HOLD_ADDRESSES = [
  'scripts/check-private-data.mjs',
  'frontend/src/content/site.ts', // the club's own published contact details
]

function tracked() {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
}

const files = tracked()
const problems = []

for (const path of files) {
  for (const rule of MUST_NOT_BE_TRACKED) {
    if (rule.match(path)) {
      problems.push(`${path} is tracked by git, and it holds ${rule.why}.`)
    }
  }
}

for (const path of files) {
  if (ALLOWED_TO_HOLD_ADDRESSES.includes(path)) continue
  if (!/\.(csv|json|md|ts|tsx|mjs|mts|js|txt|yml|yaml|env|example)$/.test(path)) continue
  // Lock files carry dependency maintainers' addresses. Not ours, not personal data we
  // are publishing, and not something this repository can do anything about.
  if (path.endsWith('package-lock.json')) continue

  let contents
  try {
    contents = readFileSync(`${root}${path}`, 'utf8')
  } catch {
    continue
  }

  const real = [...contents.matchAll(EMAIL_IN_TEXT)]
    .map((match) => match[0])
    .filter((address) => !PLACEHOLDER.test(address))
    // noreply addresses in commit trailers and package metadata are not personal data.
    .filter((address) => !/^(noreply|no-reply)@/i.test(address))

  if (real.length > 0) {
    const unique = [...new Set(real)]
    problems.push(
      `${path} contains ${unique.length} real-looking email address(es). ` +
        `First: ${unique[0].replace(/^(.).*(@.*)$/, '$1…$2')}`
    )
  }
}

if (problems.length > 0) {
  process.stderr.write(
    '\nPrivate data is about to be committed to a PUBLIC repository.\n\n' +
      problems.map((problem) => `  • ${problem}`).join('\n') +
      '\n\nA file removed in a later commit stays in the history, and personal data cannot\n' +
      'be recalled once pushed. To fix:\n\n' +
      '  git rm --cached <path>        # stop tracking it, keep it on disk\n\n' +
      'The live copy of the club\'s data belongs in the Appwrite database, and backups in\n' +
      'Google Drive via `bash scripts/backup-to-drive.sh`. Never here.\n' +
      'See docs/11-running-the-club-office.md § 7.\n\n'
  )
  process.exit(1)
}

process.stdout.write(
  `ok: no private data tracked (${files.length} files checked; ` +
    "data/club/*.csv, backups/, .env and service keys all untracked)\n"
)
