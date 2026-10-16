// The monthly proof packet: one PDF with a month's hours and the proof saved for it, made on
// the phone with pdf-lib. Nothing here touches the network; the PDF goes wherever the person
// saves or shares it.
//
// It is in English, like the CF 888: the county is who reads it.
//
// Pages:
//   1. A summary: the hours logged by activity, the hours that count toward the 80-hour rule
//      (from summarizeMonth, the same numbers as the hour log), and how many of those a
//      kitchen supervisor confirmed in HourProof.
//   2. Every entry of the month, with where it came from (the person's own log, or a kitchen
//      check-in and who confirmed it).
//   3. The list of proof files, then the files themselves: JPEG and PNG photos as full pages,
//      PDFs page by page. Anything else (HEIC, WebP, an encrypted or broken PDF) is listed as
//      not attached, so the person knows to bring it separately.
//
// It never says the person must reach 80 hours (they may not be subject to the rule), and
// says plainly that it is the person's own record, not a county form.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { ActivityType, Entry, MonthSummary } from '@/lib/hours/types'
import type { ProofFile } from './files'

export type PacketInput = {
  month: string /* YYYY-MM */
  summary: MonthSummary
  entries: readonly Entry[] /* the month's entries that count or wait (proofEntries) */
  files: readonly ProofFile[] /* the month's proof files, in the order to attach them */
  madeOn: string /* YYYY-MM-DD, California */
}

export type FileOutcome = { name: string; attached: boolean }

const TYPE_LABEL: Record<ActivityType, string> = {
  work: 'Paid work',
  volunteer: 'Volunteering',
  program: 'Job training or program',
  job_search: 'Job search',
  workfare: 'Workfare',
}

const PAGE_W = 612 // US Letter, in points
const PAGE_H = 792
const MARGIN = 54
const TEXT_W = PAGE_W - 2 * MARGIN
const INK = rgb(0.1, 0.1, 0.12)
const MUTED = rgb(0.35, 0.35, 0.4)
const RULE = rgb(0.75, 0.75, 0.78)

function monthName(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)))
}

function longDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  )
}

function shortDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  )
}

// Whole quarter hours, so two decimals show them exactly.
export function hoursLabel(n: number): string {
  const text = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n)
  return `${text} ${n === 1 ? 'hour' : 'hours'}`
}

export function packetFileName(month: string): string {
  return `HourProof-${month}.pdf`
}

function sourceText(entry: Entry): string {
  if (entry.source !== 'shift') return 'Own log'
  if (entry.verification === 'confirmed') {
    return entry.confirmedBy ? `Kitchen check-in, confirmed by ${entry.confirmedBy}` : 'Kitchen check-in, confirmed'
  }
  return 'Kitchen check-in, waiting for the kitchen to confirm'
}

// The standard fonts only cover WinAnsi (English, Spanish and other Western European
// letters). A character outside it, such as in a name typed in Vietnamese or Chinese, would
// make pdf-lib throw, so it is replaced with "?" instead. Line breaks and tabs become spaces.
export function makeSafeText(font: PDFFont): (text: string) => string {
  const ok = new Map<string, boolean>()
  return (text: string) =>
    Array.from(text.replace(/[\t\r\n]+/g, ' '))
      .map((ch) => {
        let known = ok.get(ch)
        if (known === undefined) {
          try {
            font.encodeText(ch)
            known = true
          } catch {
            known = false
          }
          ok.set(ch, known)
        }
        return known ? ch : '?'
      })
      .join('')
}

// Splits text into lines no wider than `width` at `size`, breaking at spaces, and inside a
// word only when the word alone is too wide.
export function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const lines: string[] = []
  let line = ''
  const fits = (s: string) => font.widthOfTextAtSize(s, size) <= width
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word
    if (fits(candidate)) {
      line = candidate
      continue
    }
    if (line) lines.push(line)
    if (fits(word)) {
      line = word
      continue
    }
    let piece = ''
    for (const ch of word) {
      if (fits(piece + ch)) piece += ch
      else {
        lines.push(piece)
        piece = ch
      }
    }
    line = piece
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

// A cursor that writes down the page and starts a new page when it runs out of room.
class Writer {
  page: PDFPage
  y = PAGE_H - MARGIN

  constructor(
    private pdf: PDFDocument,
    private font: PDFFont,
    private bold: PDFFont,
    private safe: (text: string) => string,
  ) {
    this.page = pdf.addPage([PAGE_W, PAGE_H])
  }

  ensure(height: number): void {
    if (this.y - height < MARGIN) {
      this.page = this.pdf.addPage([PAGE_W, PAGE_H])
      this.y = PAGE_H - MARGIN
    }
  }

  gap(points: number): void {
    this.y -= points
  }

  text(text: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; width?: number } = {}): void {
    const size = opts.size ?? 11
    const font = opts.bold ? this.bold : this.font
    const x = opts.x ?? MARGIN
    const lineH = size * 1.35
    for (const line of wrap(font, this.safe(text), size, opts.width ?? TEXT_W - (x - MARGIN))) {
      this.ensure(lineH)
      this.page.drawText(line, { x, y: this.y - size, size, font, color: opts.color ?? INK })
      this.y -= lineH
    }
  }

  // One table row: each cell wraps in its own column; the row is as tall as its tallest cell.
  row(cells: { text: string; x: number; width: number; bold?: boolean; color?: ReturnType<typeof rgb> }[], size = 10): void {
    const lineH = size * 1.35
    const wrapped = cells.map((c) => wrap(c.bold ? this.bold : this.font, this.safe(c.text), size, c.width))
    const height = Math.max(...wrapped.map((l) => l.length)) * lineH
    this.ensure(height + 4)
    cells.forEach((c, i) => {
      wrapped[i].forEach((line, j) => {
        this.page.drawText(line, {
          x: c.x,
          y: this.y - size - j * lineH,
          size,
          font: c.bold ? this.bold : this.font,
          color: c.color ?? INK,
        })
      })
    })
    this.y -= height + 4
  }

  rule(): void {
    this.ensure(8)
    this.page.drawLine({ start: { x: MARGIN, y: this.y - 2 }, end: { x: PAGE_W - MARGIN, y: this.y - 2 }, thickness: 0.75, color: RULE })
    this.y -= 8
  }
}

function attachable(file: ProofFile): 'jpg' | 'png' | 'pdf' | null {
  if (file.mime === 'image/jpeg' || file.mime === 'image/jpg') return 'jpg'
  if (file.mime === 'image/png') return 'png'
  if (file.mime === 'application/pdf') return 'pdf'
  return null
}

async function fileBytes(file: ProofFile): Promise<ArrayBuffer> {
  return file.blob ? file.blob.arrayBuffer() : file.bytes
}

// Appends one proof file. Returns false (and adds nothing) if it can't be attached.
async function attach(pdf: PDFDocument, file: ProofFile, caption: string, font: PDFFont, safe: (t: string) => string): Promise<boolean> {
  const kind = attachable(file)
  if (!kind) return false
  try {
    const bytes = await fileBytes(file)
    if (kind === 'pdf') {
      // Encrypted PDFs throw here (pdf-lib can't copy their pages): listed, not attached.
      const source = await PDFDocument.load(bytes)
      const pages = await pdf.copyPages(source, source.getPageIndices())
      if (pages.length === 0) return false
      pages.forEach((p) => pdf.addPage(p))
      return true
    }
    const image = kind === 'jpg' ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes)
    const page = pdf.addPage([PAGE_W, PAGE_H])
    const captionSize = 10
    page.drawText(wrap(font, safe(caption), captionSize, TEXT_W)[0], { x: MARGIN, y: PAGE_H - MARGIN + 18, size: captionSize, font, color: MUTED })
    const boxW = TEXT_W
    const boxH = PAGE_H - 2 * MARGIN
    const scale = Math.min(boxW / image.width, boxH / image.height, 1)
    const w = image.width * scale
    const h = image.height * scale
    page.drawImage(image, { x: MARGIN + (boxW - w) / 2, y: MARGIN + (boxH - h) / 2, width: w, height: h })
    return true
  } catch {
    return false
  }
}

export async function buildPacket(input: PacketInput): Promise<{ bytes: Uint8Array; files: FileOutcome[] }> {
  const pdf = await PDFDocument.create()
  const name = monthName(input.month)
  pdf.setTitle(`HourProof hours for ${name}`)
  pdf.setCreator('HourProof')
  pdf.setProducer('HourProof (pdf-lib)')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const safe = makeSafeText(font)
  const w = new Writer(pdf, font, bold, safe)
  const s = input.summary

  // Summary.
  w.text(`Hours for ${name}`, { size: 22, bold: true })
  w.gap(4)
  w.text(`Made on ${longDate(input.madeOn)} with HourProof, on the person's own phone.`, { color: MUTED })
  w.text(
    "This is the person's own record of their hours, not a county form. Hours marked as confirmed were confirmed by a supervisor at the kitchen in HourProof; the county may still ask the organization to confirm them.",
    { color: MUTED },
  )
  w.gap(14)

  w.text('Hours logged this month', { size: 14, bold: true })
  w.gap(4)
  const typeX = MARGIN
  const hoursX = MARGIN + 300
  for (const type of Object.keys(TYPE_LABEL) as ActivityType[]) {
    if (s.byType[type] <= 0) continue
    w.row([
      { text: TYPE_LABEL[type], x: typeX, width: 290 },
      { text: hoursLabel(s.byType[type]), x: hoursX, width: TEXT_W - 300 },
    ], 11)
  }
  w.rule()
  w.row([
    { text: 'Hours that count toward the 80-hour work rule', x: typeX, width: 290, bold: true },
    { text: `${hoursLabel(s.counted)} of 80`, x: hoursX, width: TEXT_W - 300, bold: true },
  ], 12)
  if (s.verifiedCounted > 0) {
    w.text(`${hoursLabel(s.verifiedCounted)} of these were confirmed by a kitchen supervisor in HourProof.`)
  }
  if (s.byType.job_search > 0) {
    w.text(
      `Job search counts only as part of a job training program, and only while it is less than the program's own hours: ${hoursLabel(s.jobSearchCounted)} of it counts here.`,
      { color: MUTED },
    )
  }
  if (s.byType.workfare > 0) {
    w.text('Workfare is not added to the total here: it cannot be combined with other activities. Ask the county how it counts.', {
      color: MUTED,
    })
  }

  // Every entry.
  w.gap(18)
  w.text('Every entry', { size: 14, bold: true })
  w.gap(4)
  const cols = { date: MARGIN, activity: MARGIN + 82, place: MARGIN + 200, hours: MARGIN + 330, source: MARGIN + 392 }
  const widths = { date: 78, activity: 114, place: 126, hours: 58, source: PAGE_W - MARGIN - (MARGIN + 392) }
  w.row(
    [
      { text: 'Date', x: cols.date, width: widths.date, bold: true },
      { text: 'Activity', x: cols.activity, width: widths.activity, bold: true },
      { text: 'Place', x: cols.place, width: widths.place, bold: true },
      { text: 'Hours', x: cols.hours, width: widths.hours, bold: true },
      { text: 'Recorded by', x: cols.source, width: widths.source, bold: true },
    ],
    10,
  )
  w.rule()
  const sorted = [...input.entries].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1))
  if (sorted.length === 0) w.text('No hours were logged this month.', { color: MUTED })
  for (const entry of sorted) {
    const activity = entry.type === 'job_search' && entry.inProgram ? 'Job search (in a program)' : TYPE_LABEL[entry.type]
    w.row(
      [
        { text: shortDate(entry.date), x: cols.date, width: widths.date },
        { text: activity, x: cols.activity, width: widths.activity },
        { text: entry.place?.trim() || '-', x: cols.place, width: widths.place },
        { text: hoursLabel(entry.hours), x: cols.hours, width: widths.hours },
        { text: sourceText(entry), x: cols.source, width: widths.source, color: entry.source === 'shift' ? INK : MUTED },
      ],
      10,
    )
    if (entry.note?.trim()) w.text(`Note: ${entry.note.trim()}`, { size: 9, color: MUTED, x: cols.activity })
  }

  // Proof files: attach first, so the list can say which made it in.
  const outcomes: FileOutcome[] = []
  const summaryEnd = pdf.getPageCount()
  for (const file of input.files) {
    const caption = `${TYPE_LABEL[file.type]}: ${file.name}`
    outcomes.push({ name: file.name, attached: await attach(pdf, file, caption, font, safe) })
  }
  // The list goes on the summary's last page. Pages it overflows onto are added at the end,
  // after the attachments, so they are moved back to just after the summary.
  const before = pdf.getPageCount()
  w.gap(18)
  w.text('Proof files', { size: 14, bold: true })
  w.gap(4)
  if (outcomes.length === 0) {
    w.text('No proof files were saved for this month.', { color: MUTED })
  } else {
    w.text('Attached after this summary, in this order. Files marked "not attached" are not in this PDF.', { color: MUTED })
    input.files.forEach((file, i) => {
      const line = `- ${TYPE_LABEL[file.type]}: ${file.name}`
      if (outcomes[i].attached) w.text(line)
      else w.text(`${line} (not attached: bring or send it separately)`, { color: MUTED })
    })
  }
  const added = pdf.getPageCount() - before
  for (let i = 0; i < added; i++) {
    const page = pdf.getPage(before + i)
    pdf.removePage(before + i)
    pdf.insertPage(summaryEnd + i, page)
  }

  // Page numbers on the summary pages (attached pages are left as they are).
  const summaryPages = summaryEnd + added
  for (let i = 0; i < summaryPages; i++) {
    const page = pdf.getPage(i)
    const label = `HourProof, ${name} - page ${i + 1} of ${summaryPages} (summary), ${pdf.getPageCount()} pages in all`
    page.drawText(label, { x: MARGIN, y: MARGIN / 2, size: 8, font, color: MUTED })
  }

  return { bytes: await pdf.save(), files: outcomes }
}
