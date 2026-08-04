import { AppwriteException, type TablesDB } from 'node-appwrite'

import { COLLECTIONS } from '../config/constants.js'

/**
 * Gapless, unique sequence numbers from a counter row.
 *
 * Shared by the two places that allocate human-facing references — ledger entries
 * and member payment declarations. Extracted rather than copied because the
 * interesting part is the race, and a race handled correctly in one copy and
 * carelessly in the other is worse than not sharing at all.
 *
 * `incrementRowColumn` is atomic and returns the counter's new value, so a block
 * of `count` numbers is `value - count + 1 … value`. There is no read-modify-write
 * to interleave with, which is what makes two officers saving in the same instant
 * unable to be handed the same reference.
 *
 * The counter row is created on first use. If two requests race to create it, the
 * loser retries against the row the winner made rather than failing somebody's
 * save — the counter existing is not the caller's problem.
 */
export async function allocateSequence(
  tables: TablesDB,
  databaseId: string,
  rowId: string,
  count = 1
): Promise<number> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const row = await tables.incrementRowColumn({
        databaseId,
        tableId: COLLECTIONS.settings,
        rowId,
        column: 'value',
        value: count,
      })
      const next = Number((row as unknown as { value: unknown }).value)
      return next - count + 1
    } catch (error) {
      if (!isNotFound(error) || attempt === 1) throw error

      try {
        await tables.createRow({
          databaseId,
          tableId: COLLECTIONS.settings,
          rowId,
          data: { key: rowId, value: count },
        })
        return 1
      } catch (createError) {
        // Another request created it first — fall through and increment it.
        if (!isConflict(createError)) throw createError
      }
    }
  }

  throw new Error(`Could not allocate a number from the counter ${rowId}.`)
}

function isNotFound(error: unknown): boolean {
  return error instanceof AppwriteException && error.code === 404
}

/** 409 is Appwrite's "already exists". */
function isConflict(error: unknown): boolean {
  return error instanceof AppwriteException && error.code === 409
}
