import { COLLECTIONS } from '../config/constants.js'
import { getDb } from '../config/firebase.js'
import { hasFirebaseCredentials, isProduction } from '../config/env.js'

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

/** Development store. Lost on restart, like the rest of the demo data. */
export class InMemoryProfileStore implements ProfileStore {
  private readonly profiles = new Map<string, MemberProfile>()

  constructor() {
    if (isProduction) throw new Error('InMemoryProfileStore must not run in production.')
  }

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

export class FirestoreProfileStore implements ProfileStore {
  async get(uid: string, fallbackName: string): Promise<MemberProfile> {
    const doc = await getDb().collection(COLLECTIONS.members).doc(uid).get()
    const data = doc.data()

    return {
      uid,
      name: (data?.name as string | undefined) ?? fallbackName,
      photo: (data?.photo as string | undefined) ?? null,
      photoUpdatedAt: (data?.photoUpdatedAt as string | undefined) ?? null,
    }
  }

  async setPhoto(uid: string, photo: string | null): Promise<MemberProfile> {
    const updatedAt = photo ? new Date().toISOString() : null
    await getDb()
      .collection(COLLECTIONS.members)
      .doc(uid)
      .set({ photo, photoUpdatedAt: updatedAt }, { merge: true })

    return this.get(uid, 'Member')
  }
}

export function buildProfileStore(): ProfileStore {
  return hasFirebaseCredentials ? new FirestoreProfileStore() : new InMemoryProfileStore()
}
