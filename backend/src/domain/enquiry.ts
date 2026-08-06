import { ENQUIRY_LIMITS, type EnquiryStatus } from '../config/constants.js'

/**
 * A visitor's message to the club, and what the office did about it.
 *
 * ## Why this is stored rather than emailed
 *
 * It was emailed, and email is a dependency the club does not control: an app password
 * that expires, 2-step verification switched off, a message in a spam folder. Every one
 * of those loses an enquiry silently, and the visitor has no way to know. Stored, the
 * message is on a screen the secretary and president open, and it stays there until
 * somebody marks it dealt with.
 *
 * Email still goes out when it is configured, but it is now a *notification* rather than
 * the record. If it fails, the enquiry is still safe.
 *
 * ## The lengths, which are deliberate
 *
 * The club pays for its database by the row and the byte, and an enquiry is the one
 * thing on this site a stranger can write into it. Every field is capped, and the caps
 * are chosen to be generous for a real enquiry and useless for anything else:
 *
 *   name       80   longer than any name the club will receive
 *   email     120   the longest address anybody actually has
 *   phone      20
 *   subject   120   chosen from a list on the form anyway
 *   message  1000   about 150 words — enough to explain anything a club is asked
 *   note      500   what the office did about it
 *
 * A thousand characters is roughly a kilobyte. Ten thousand enquiries would be about
 * ten megabytes, which is a rounding error against the free tier — the cap exists so
 * that somebody pasting a novel, or a bot pasting a dictionary, cannot make it otherwise.
 */

export { ENQUIRY_LIMITS }

export interface Enquiry {
  id: string
  /** 'ENQ-2026-000042'. What the office quotes when they reply. */
  reference: string
  status: EnquiryStatus

  name: string
  email: string
  phone?: string
  subject: string
  message: string

  /** ISO timestamp. */
  receivedAt: string

  /** Set when an officer marked it dealt with. */
  resolvedAt?: string
  resolvedBy?: string
  resolvedByName?: string
  /** What was done about it — the club's own record of the answer. */
  resolutionNote?: string
}

export type EnquiryDraft = Omit<Enquiry, 'id' | 'reference' | 'status' | 'receivedAt'>

/** 'ENQ-2026-000042'. */
export function formatEnquiryReference(year: number, sequence: number): string {
  return `ENQ-${year}-${String(sequence).padStart(6, '0')}`
}

/**
 * Count words the way a person would, for the form's counter.
 *
 * The club asked for a word limit; the database needs a character limit, because that
 * is what costs bytes. Both are enforced — the character cap is the rule, and the word
 * count is what a visitor is shown, because "about 150 words" means something to a
 * person writing and "1000 characters" does not.
 */
export function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length
}

export type Outcome<T> = { ok: true; value: T } | { ok: false; code: string; reason: string }

/**
 * Mark an enquiry dealt with.
 *
 * The note is optional but asked for: six months later, "resolved" on its own tells the
 * next secretary nothing, and the whole reason for keeping these is that the club has a
 * record of what it said.
 *
 * Resolving an already-resolved enquiry is refused rather than silently overwriting the
 * first answer. Two officers acting on the same message at the same time is exactly how
 * one person's note disappears.
 */
export function resolve(
  enquiry: Enquiry,
  actor: { uid: string; name: string },
  now: string,
  note?: string
): Outcome<Enquiry> {
  if (enquiry.status === 'resolved') {
    return {
      ok: false,
      code: 'already_resolved',
      reason: `${enquiry.resolvedByName ?? 'Somebody'} already marked this one dealt with.`,
    }
  }

  const trimmed = note?.trim()

  if (trimmed && trimmed.length > ENQUIRY_LIMITS.note) {
    return {
      ok: false,
      code: 'note_too_long',
      reason: `Please keep the note under ${ENQUIRY_LIMITS.note} characters.`,
    }
  }

  return {
    ok: true,
    value: {
      ...enquiry,
      status: 'resolved',
      resolvedAt: now,
      resolvedBy: actor.uid,
      resolvedByName: actor.name,
      ...(trimmed ? { resolutionNote: trimmed } : {}),
    },
  }
}

/** Put a resolved enquiry back in the open list, when it turns out not to be finished. */
export function reopen(enquiry: Enquiry): Outcome<Enquiry> {
  if (enquiry.status !== 'resolved') {
    return { ok: false, code: 'not_resolved', reason: 'This enquiry is already open.' }
  }

  // The note and who wrote it are kept. It is a record of what was done, and it
  // remains true after the enquiry is reopened.
  return { ok: true, value: { ...enquiry, status: 'new' } }
}
