import { PDFPage, type PDFFont } from 'pdf-lib'
import { vi } from 'vitest'

/**
 * Capture every piece of text a PDF renderer draws, so overlaps can be asserted.
 *
 * Shared by the statement and the receipt tests. It exists because the club's first
 * real statement was unreadable — descriptions wrapped by pdf-lib's `maxWidth` while
 * the cursor advanced a fixed row height, so text printed straight through the rows
 * beneath it. Page counts and byte lengths cannot see that; the rectangles can.
 *
 * Works by replacing `PDFPage.prototype.drawText` for the duration of one render,
 * recording position, font and size, then calling through. Nothing about the produced
 * PDF changes — this observes, it does not substitute.
 */
export interface TextBox {
  page: number
  x: number
  y: number
  width: number
  height: number
  text: string
}

export async function textBoxes(build: () => Promise<Uint8Array>): Promise<TextBox[]> {
  const boxes: TextBox[] = []
  const pageNumbers = new WeakMap<PDFPage, number>()
  let pageCount = 0

  const original = PDFPage.prototype.drawText
  const spy = vi
    .spyOn(PDFPage.prototype, 'drawText')
    .mockImplementation(function (this: PDFPage, text: string, options) {
      let page = pageNumbers.get(this)
      if (page === undefined) {
        pageCount += 1
        page = pageCount
        pageNumbers.set(this, page)
      }

      const size = (options?.size as number | undefined) ?? 8
      const font = options?.font as PDFFont | undefined

      if (text.trim() !== '' && font) {
        boxes.push({
          page,
          x: (options?.x as number | undefined) ?? 0,
          y: (options?.y as number | undefined) ?? 0,
          width: font.widthOfTextAtSize(text, size),
          height: size,
          text,
        })
      }

      return original.call(this, text, options)
    })

  try {
    await build()
  } finally {
    spy.mockRestore()
  }

  return boxes
}

/**
 * Every pair of boxes on a page whose rectangles intersect.
 *
 * Helvetica's ascender and descender, with a point of slack on each axis so text that
 * merely touches — adjacent table cells, a label beside its value — is not reported.
 */
export function overlaps(boxes: readonly TextBox[]): string[] {
  const top = (box: TextBox) => box.y + box.height * 0.72
  const bottom = (box: TextBox) => box.y - box.height * 0.21

  const problems: string[] = []

  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i] as TextBox
      const b = boxes[j] as TextBox
      if (a.page !== b.page) continue

      const x = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
      const y = Math.min(top(a), top(b)) - Math.max(bottom(a), bottom(b))

      if (x > 1 && y > 1) {
        problems.push(
          `page ${a.page}: "${a.text.slice(0, 40)}" (${a.x.toFixed(0)},${a.y.toFixed(0)}) ` +
            `overlaps "${b.text.slice(0, 40)}" (${b.x.toFixed(0)},${b.y.toFixed(0)}) ` +
            `by ${x.toFixed(1)}x${y.toFixed(1)}pt`
        )
      }
    }
  }

  return problems
}
