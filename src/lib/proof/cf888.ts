// Fills California's CF 888 (5/25), "CalFresh ABAWD Volunteer Work Hours Verification Form",
// in the browser. Nothing here touches the network except the caller's fetch of the blank
// template from /forms: the person's name, birthdate and address go into the PDF on this
// device and are never sent anywhere.
//
// The template is public/forms/cf888-template.pdf. The official CDSS file
// (https://cdss.ca.gov/Portals/9/Additional-Resources/Forms-and-Brochures/2020/A-D/CF888.pdf)
// is encrypted and has broken object references that pdf-lib can't load, so the template is
// an unencrypted copy of it. Its text is identical to the official 5/25 revision (checked
// with pdftotext on 2026-09-29).
//
// Only Section 1 (the participant) and the organization, month and hours are filled. The
// representative's name, address, phone, "Ongoing / One Time" and signature are theirs to
// complete: the form says Section 2 "must be completed by a representative of the
// organization", and the representative is the one certifying the hours.

import { PDFDocument } from 'pdf-lib'

export type Cf888Values = {
  name: string
  birthdate: string /* YYYY-MM-DD */
  address1: string
  address2?: string
  address3?: string
  organization: string
  month: string /* as printed, e.g. "October 2026" */
  hours: string
}

// Field names in the template, matched to the printed labels by their position on the page.
export const CF888_FIELDS = {
  name: 'CF 888_Text Field 0',
  birthdate: 'CF 888_Text Field 1',
  address1: 'CF 888_Text Field 2',
  address2: 'CF 888_Text Field 3',
  address3: 'CF 888_Text Field 4',
  organization: 'CF 888_Text Field 5',
  month: 'CF 888_Text Field 11',
  hours: 'CF 888_Text Field 12',
} as const satisfies Record<keyof Cf888Values, string>

// The form prints dates as MM/DD/YYYY.
export function formDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${match[2]}/${match[3]}/${match[1]}` : value
}

export async function fillCf888(template: ArrayBuffer | Uint8Array, values: Cf888Values): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(template)
  const form = pdf.getForm()
  for (const key of Object.keys(CF888_FIELDS) as (keyof Cf888Values)[]) {
    const raw = values[key] ?? ''
    form.getTextField(CF888_FIELDS[key]).setText(key === 'birthdate' ? formDate(raw) : raw.trim())
  }
  form.updateFieldAppearances()
  return pdf.save()
}

// "CF-888-Food-Bank-2026-10.pdf"
export function cf888FileName(organization: string, month: string): string {
  const safe = organization.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'volunteer'
  return `CF-888-${safe}-${month}.pdf`
}
