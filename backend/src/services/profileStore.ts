import { AppwriteException } from 'node-appwrite'

import { databaseId, getTables } from '../config/appwrite.js'
import { COLLECTIONS } from '../config/constants.js'
import { hasAppwriteCredentials } from '../config/env.js'

/**
 * A member's own profile: the parts they may change themselves.
 *
 * Photographs are held as data URLs rather than in Cloud Storage. For a 512px
 * avatar that is a few hundred kilobytes, and it avoids a second set of storage
 * rules to get wrong — the picture is only ever readable by the member and the
 * office bearers, exactly like the rest of the profile document. Gallery media,
 * which is large and public, will use Storage.
 */
export interface MemberProfile {
  uid: string
  name: string
  /** `data:image/...;base64,...` or null when none has been set. */
  photo: string | null
  photoUpdatedAt: string | null
}

/** Roughly 700 KB of base64 — a 512px JPEG is far smaller. */
export const MAX_PHOTO_BYTES = 700_000

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'] as const

export class PhotoRejected extends Error {}

/**
 * Validate an incoming data URL.
 *
 * Checked on the server as well as in the browser: the client-side resize is a
 * courtesy to the member's data allowance, not a control. Anyone can post
 * whatever they like to this endpoint.
 */
export function assertValidPhoto(dataUrl: string): void {
  const match = /^data:([\w/+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!match?.[1] || !match[2]) {
    throw new PhotoRejected('That does not look like an image file.')
  }

  const [, mime, payload] = match
  if (!ALLOWED.includes(mime as (typeof ALLOWED)[number])) {
    throw new PhotoRejected('Please use a JPEG, PNG or WebP image.')
  }

  // base64 encodes 3 bytes per 4 characters.
  const bytes = Math.floor((payload.length * 3) / 4)
  if (bytes > MAX_PHOTO_BYTES) {
    throw new PhotoRejected('That image is too large. Please choose one under about 500 KB.')
  }
}

export interface ProfileStore {
  get(uid: string, fallbackName: string): Promise<MemberProfile>
  setPhoto(uid: string, photo: string | null): Promise<MemberProfile>
}

/**
 * Demo store. Lost on restart, like the rest of the demo data.
 *
 * No production guard, for the reason given in memoryStore.ts and container.ts: a
 * throw here stopped a credential-less deployment from starting at all, which is a
 * worse outcome than a profile photograph that does not survive a cold start. The
 * signed-in banner says which store is in use.
 */
export class InMemoryProfileStore implements ProfileStore {
  private readonly profiles = new Map<string, MemberProfile>()

  get(uid: string, fallbackName: string): Promise<MemberProfile> {
    return Promise.resolve(
      this.profiles.get(uid) ?? { uid, name: fallbackName, photo: null, photoUpdatedAt: null }
    )
  }

  async setPhoto(uid: string, photo: string | null): Promise<MemberProfile> {
    const existing = await this.get(uid, 'Member')
    const next: MemberProfile = {
      ...existing,
      photo,
      photoUpdatedAt: photo ? new Date().toISOString() : null,
    }
    this.profiles.set(uid, next)
    return next
  }
}

/**
 * Appwrite-backed profile store.
 *
 * Rows are keyed by the member's own account id rather than a generated one, so a
 * profile can be fetched in a single read with no query or index — and so a member
 * cannot end up with two.
 *
 * A profile row is created on first write, not at sign-up: a member who never sets a
 * photograph needs no row, and `get` answering from the account's own name is
 * correct rather than a placeholder.
 */
export class AppwriteProfileStore implements ProfileStore {
  async get(uid: string, fallbackName: string): Promise<MemberProfile> {
    try {
      const row = await getTables().getRow({
        databaseId: databaseId(),
        tableId: COLLECTIONS.members,
        rowId: uid,
      })

      const data = row as unknown as Partial<MemberProfile>

      return {
        uid,
        name: data.name ?? fallbackName,
        // Appwrite returns null for an unset column, which is already what
        // MemberProfile uses for "no photograph".
        photo: data.photo ?? null,
        photoUpdatedAt: data.photoUpdatedAt ?? null,
      }
    } catch (error) {
      // No row yet is the ordinary case for a member who has not set a photograph.
      if (error instanceof AppwriteException && error.code === 404) {
        return { uid, name: fallbackName, photo: null, photoUpdatedAt: null }
      }
      throw error
    }
  }

  async setPhoto(uid: string, photo: string | null): Promise<MemberProfile> {
    const photoUpdatedAt = photo ? new Date().toISOString() : null
    const existing = await this.get(uid, 'Member')

    // Upsert: the row may not exist yet, and this is also how a photograph is
    // removed — `photo: null` clears the column rather than deleting the profile.
    await getTables().upsertRow({
      databaseId: databaseId(),
      tableId: COLLECTIONS.members,
      rowId: uid,
      data: { uid, name: existing.name, photo, photoUpdatedAt },
    })

    return { uid, name: existing.name, photo, photoUpdatedAt }
  }
}

/** Appwrite when it is configured, the demo store otherwise. */
export function buildProfileStore(): ProfileStore {
  return hasAppwriteCredentials ? new AppwriteProfileStore() : new InMemoryProfileStore()
}
