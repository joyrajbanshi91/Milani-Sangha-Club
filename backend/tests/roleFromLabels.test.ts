import { describe, expect, it } from 'vitest'

import { ROLES } from '../src/config/constants.js'
import { roleFromLabels } from '../src/services/authService.js'

/**
 * The label → role mapping decides what every request is allowed to do, so it is
 * tested directly rather than through a route.
 *
 * Written after getting it wrong: the first version assumed ROLES ran most
 * privileged first and picked the *highest* index, which on an account carrying two
 * role labels would have handed out the strongest one instead of the weakest. These
 * cases would have caught it.
 */
describe('roleFromLabels', () => {
  it('reads a role from the labels', () => {
    expect(roleFromLabels(['treasurer'])).toBe('treasurer')
    expect(roleFromLabels(['president'])).toBe('president')
  })

  it('treats an account with no labels as an ordinary member', () => {
    expect(roleFromLabels([])).toBe('member')
    expect(roleFromLabels(undefined)).toBe('member')
  })

  it('ignores labels that are not roles', () => {
    expect(roleFromLabels(['beta-tester'])).toBe('member')
    expect(roleFromLabels(['beta-tester', 'treasurer'])).toBe('treasurer')
  })

  it('picks the least privileged role when several are present', () => {
    // Order must not matter: both spellings of the same account agree.
    expect(roleFromLabels(['president', 'member'])).toBe('member')
    expect(roleFromLabels(['member', 'president'])).toBe('member')
    expect(roleFromLabels(['administrator', 'treasurer'])).toBe('treasurer')
  })

  it('never escalates beyond the labels actually set', () => {
    // The property that matters: whatever comes back was on the account.
    for (const role of ROLES) {
      expect(roleFromLabels([role])).toBe(role)
    }
    expect(ROLES).toContain(roleFromLabels(['nonsense']))
  })

  it('is not fooled by casing or padding', () => {
    // Appwrite labels are exact strings; anything else is not a role we set.
    expect(roleFromLabels(['Treasurer'])).toBe('member')
    expect(roleFromLabels([' treasurer'])).toBe('member')
  })
})
