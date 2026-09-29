import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, test } from 'vitest'
import { MAX_FILE_BYTES, ProofFileError, checkFile, closeProofStoresForTests, openProofStore } from '../files'

beforeEach(async () => {
  await closeProofStoresForTests()
  globalThis.indexedDB = new IDBFactory()
})

const pdf = (name: string) => new File(['%PDF-1.4'], name, { type: 'application/pdf' })

describe('proof file store', () => {
  test('adds, lists by month oldest first, and removes', async () => {
    const store = await openProofStore('real')
    const a = await store.add(pdf('a.pdf'), '2026-10', 'work', new Date('2026-10-02T00:00:00Z'))
    await store.add(pdf('b.pdf'), '2026-10', 'volunteer', new Date('2026-10-01T00:00:00Z'))
    await store.add(pdf('c.pdf'), '2026-09', 'work')
    expect((await store.list('2026-10')).map((f) => f.name)).toEqual(['b.pdf', 'a.pdf'])
    await store.remove(a.id)
    expect((await store.list('2026-10')).map((f) => f.name)).toEqual(['b.pdf'])
  })

  test('demo files never show up in real proof, and clearing the demo leaves real files', async () => {
    const real = await openProofStore('real')
    const demo = await openProofStore('demo')
    await real.add(pdf('mine.pdf'), '2026-10', 'work')
    await demo.add(pdf('sample.pdf'), '2026-10', 'work')
    await demo.clear()
    expect((await real.list('2026-10')).map((f) => f.name)).toEqual(['mine.pdf'])
    expect(await demo.list('2026-10')).toEqual([])
  })

  test('rejects anything but images and PDFs, and oversized files', async () => {
    const store = await openProofStore('real')
    await expect(store.add(new File(['x'], 'clip.mp4', { type: 'video/mp4' }), '2026-10', 'work')).rejects.toBeInstanceOf(ProofFileError)
    expect(checkFile({ type: 'image/heic', size: 10 })).toBeNull()
    expect(checkFile({ type: 'application/pdf', size: MAX_FILE_BYTES + 1 })).toBe('too_big')
    expect(checkFile({ type: '', size: 10 })).toBe('bad_type')
    expect(await store.list('2026-10')).toEqual([])
  })
})
