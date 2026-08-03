import { describe, expect, it } from 'vitest'

import { COLLECTIONS, ROLES, ROLE_RANK, STAFF_ROLES } from '@/config/constants'

describe('domain constants', () => {
  it('assigns a rank to every role', () => {
    expect(Object.keys(ROLE_RANK).sort()).toEqual([...ROLES].sort())
  })

  it('ranks roles in strictly ascending privilege order', () => {
    const ranks = ROLES.map((role) => ROLE_RANK[role])
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    expect(new Set(ranks).size).toBe(ranks.length)
  })

  it('treats every staff role as more privileged than a member', () => {
    for (const role of STAFF_ROLES) {
      expect(ROLE_RANK[role]).toBeGreaterThan(ROLE_RANK.member)
    }
  })

  it('maps each collection key to a unique Firestore collection name', () => {
    const names = Object.values(COLLECTIONS)
    expect(new Set(names).size).toBe(names.length)
  })
})
