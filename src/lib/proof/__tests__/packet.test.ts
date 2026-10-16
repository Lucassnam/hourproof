import { describe, expect, test } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { summarizeMonth } from '@/lib/hours/summarize'
import type { Entry } from '@/lib/hours/types'
import type { ProofFile } from '../files'
import { buildPacket, hoursLabel, makeSafeText, packetFileName, wrap } from '../packet'

// A 1x1 PNG.
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) =>
  c.charCodeAt(0),
)

function entry(over: Partial<Entry>): Entry {
  return { id: crypto.randomUUID(), date: '2026-10-05', type: 'work', hours: 4, createdAt: '2026-10-05T18:00:00.000Z', ...over }
}

function file(over: Partial<ProofFile> & { bytes: ArrayBuffer }): ProofFile {
  return { id: crypto.randomUUID(), month: '2026-10', type: 'work', name: 'f', mime: 'application/pdf', size: over.bytes.byteLength, addedAt: '2026-10-06T00:00:00Z', ...over }
}

async function twoPagePdf(): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create()
  doc.addPage()
  doc.addPage()
  const bytes = await doc.save()
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

describe('monthly proof packet', () => {
  test('summary pages, then a PNG as one page and a 2-page PDF; HEIC and a broken PDF are listed as not attached', async () => {
    const entries: Entry[] = [
      entry({ type: 'work', hours: 20, place: 'Café Nguyễn' }),
      entry({ type: 'volunteer', hours: 3, date: '2026-10-07', place: 'Community Kitchen', source: 'shift', verification: 'confirmed', confirmedBy: 'Rosa', shiftId: 's1' }),
      entry({ type: 'volunteer', hours: 2, date: '2026-10-08', place: 'Community Kitchen', source: 'shift', verification: 'pending', shiftId: 's2', note: 'Line one\nline two' }),
    ]
    const summary = summarizeMonth(entries, '2026-10', '2026-10-15')
    const files = [
      file({ name: 'stub.png', mime: 'image/png', bytes: PNG.buffer as ArrayBuffer }),
      file({ name: 'letter.pdf', bytes: await twoPagePdf(), type: 'volunteer' }),
      file({ name: 'photo.heic', mime: 'image/heic', bytes: new ArrayBuffer(10) }),
      file({ name: 'broken.pdf', bytes: new TextEncoder().encode('not a pdf').buffer as ArrayBuffer }),
    ]
    const { bytes, files: outcomes } = await buildPacket({ month: '2026-10', summary, entries, files, madeOn: '2026-10-16' })
    expect(outcomes).toEqual([
      { name: 'stub.png', attached: true },
      { name: 'letter.pdf', attached: true },
      { name: 'photo.heic', attached: false },
      { name: 'broken.pdf', attached: false },
    ])
    const doc = await PDFDocument.load(bytes)
    expect(doc.getTitle()).toBe('HourProof hours for October 2026')
    // One summary page here, then 1 (PNG) + 2 (PDF).
    expect(doc.getPageCount()).toBe(4)
    expect(doc.getPage(1).getSize()).toEqual({ width: 612, height: 792 })
  })

  test('a long month: the summary runs over several pages and they all come before the attachments', async () => {
    const entries = Array.from({ length: 120 }, (_, i) => entry({ date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`, hours: 1, note: 'x '.repeat(40) }))
    const summary = summarizeMonth(entries, '2026-10', '2026-10-31')
    const files = Array.from({ length: 30 }, (_, i) => file({ name: `pay-${i}.pdf`, bytes: new ArrayBuffer(4) }))
    files.push(file({ name: 'last.png', mime: 'image/png', bytes: PNG.buffer as ArrayBuffer }))
    const { bytes } = await buildPacket({ month: '2026-10', summary, entries, files, madeOn: '2026-10-31' })
    const doc = await PDFDocument.load(bytes)
    const pages = doc.getPageCount()
    expect(pages).toBeGreaterThan(3)
    // The PNG page is the very last one: every summary page (including the file list's
    // overflow) was moved before it.
    const last = doc.getPage(pages - 1)
    const ops = (last.node.Contents()?.toString() ?? '') + JSON.stringify(last.node.Resources()?.toString() ?? '')
    expect(ops).toMatch(/XObject/)
  })

  test('text the standard font cannot draw becomes "?", and wrap keeps lines inside the width', async () => {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const safe = makeSafeText(font)
    expect(safe('Café Nguyễn\n家')).toBe('Café Nguy?n ?')
    const lines = wrap(font, 'A very long line of text that has to wrap somewhere sensible '.repeat(3), 10, 120)
    expect(lines.length).toBeGreaterThan(3)
    for (const l of lines) expect(font.widthOfTextAtSize(l, 10)).toBeLessThanOrEqual(120)
    expect(wrap(font, 'x'.repeat(200), 10, 50).every((l) => font.widthOfTextAtSize(l, 10) <= 50)).toBe(true)
  })

  test('labels and file name', () => {
    expect(hoursLabel(1)).toBe('1 hour')
    expect(hoursLabel(2.75)).toBe('2.75 hours')
    expect(packetFileName('2026-10')).toBe('HourProof-2026-10.pdf')
  })
})
