/** Java-style 32-bit string hash. */
export function hashPage(page: string): number {
  let h = 0
  for (let i = 0; i < page.length; i++) {
    h = (Math.imul(31, h) + page.charCodeAt(i)) | 0
  }
  return h
}

/** Shard index i = abs(hash(page)) mod N. */
export function shardIndex(page: string, n: number): number {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error('N must be a positive integer')
  }
  return Math.abs(hashPage(page)) % n
}

export function rawQueueName(i: number): string {
  return `page_views_raw_${i}`
}

export function pageName(index: number): string {
  return `p${index}`
}
