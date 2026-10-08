import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, test } from 'vitest'
import { CF888_FIELDS, cf888FileName, fillCf888, formDate } from '../cf888'

const template = readFileSync(path.join(process.cwd(), 'public', 'forms', 'cf888-template.pdf'))

describe('fillCf888', () => {
  test('fills Section 1, the organization, month and hours, and leaves the representative’s part blank', async () => {
    const bytes = await fillCf888(template, {
      name: ' Ana Pérez ',
      birthdate: '1990-04-07',
      address1: '123 Main St',
      address2: 'San Jose, CA 95112',
      organization: 'Second Harvest',
      month: 'October 2026',
      hours: '24.5',
    })
    const form = (await PDFDocument.load(bytes)).getForm()
    const text = (name: string) => form.getTextField(name).getText() ?? ''
    expect(text(CF888_FIELDS.name)).toBe('Ana Pérez')
    expect(text(CF888_FIELDS.birthdate)).toBe('04/07/1990')
    expect(text(CF888_FIELDS.address1)).toBe('123 Main St')
    expect(text(CF888_FIELDS.address2)).toBe('San Jose, CA 95112')
    expect(text(CF888_FIELDS.address3)).toBe('')
    expect(text(CF888_FIELDS.organization)).toBe('Second Harvest')
    expect(text(CF888_FIELDS.month)).toBe('October 2026')
    expect(text(CF888_FIELDS.hours)).toBe('24.5')
    // Representative name, address lines, phone, and date signed stay empty; so do both boxes.
    for (const n of [6, 7, 8, 9, 10, 15]) expect(text(`CF 888_Text Field ${n}`)).toBe('')
    expect(form.getCheckBox('CF 888_Check Box 13').isChecked()).toBe(false)
    expect(form.getCheckBox('CF 888_Check Box 14').isChecked()).toBe(false)
  })

  test('every mapped field exists in the template', async () => {
    const form = (await PDFDocument.load(template)).getForm()
    for (const name of Object.values(CF888_FIELDS)) expect(() => form.getTextField(name)).not.toThrow()
  })
})

describe('helpers', () => {
  test('formDate prints MM/DD/YYYY and passes anything else through', () => {
    expect(formDate('2026-01-31')).toBe('01/31/2026')
    expect(formDate('')).toBe('')
  })

  test('cf888FileName is filesystem-safe', () => {
    expect(cf888FileName('St. Mary’s Kitchen / SJ', '2026-10')).toBe('CF-888-St-Mary-s-Kitchen-SJ-2026-10.pdf')
    expect(cf888FileName('  ', '2026-10')).toBe('CF-888-volunteer-2026-10.pdf')
  })
})
