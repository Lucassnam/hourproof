import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, test } from 'vitest'
import { MAX_FILE_BYTES, ProofFileError, checkFile, closeProofStoresForTests, fileBlob, openProofStore, type ProofFile } from '../files'

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

  // WebKit refuses to put a File or Blob into IndexedDB in a private-style session (probed
  // 2026-10-09: the transaction errors), and accepts an ArrayBuffer. So the record holds the
  // bytes and the type, and a Blob is only made when the person opens the file.
  test('stores the bytes and the type, never the File itself', async () => {
    const store = await openProofStore('real')
    const added = await store.add(pdf('stub.pdf'), '2026-10', 'work')
    const [stored] = await store.list('2026-10')
    expect(stored.bytes).toBeInstanceOf(ArrayBuffer)
    expect('blob' in stored).toBe(false)
    expect(stored.mime).toBe('application/pdf')
    expect(stored.size).toBe(8)
    const blob = fileBlob(added)
    expect(blob.type).toBe('application/pdf')
    expect(await blob.text()).toBe('%PDF-1.4')
  })

  test('a file saved before this change (stored as a Blob) still opens', async () => {
    const legacy = {
      id: 'old',
      month: '2026-09',
      type: 'work',
      name: 'old.pdf',
      mime: 'application/pdf',
      size: 8,
      addedAt: '2026-09-30T00:00:00.000Z',
      blob: new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
    } as unknown as ProofFile
    expect(await fileBlob(legacy).text()).toBe('%PDF-1.4')
  })
})
