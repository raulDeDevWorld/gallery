import { lower } from '@/lib/string'

export function compareByLowerField(field) {
  return (a, b) => {
    const av = lower(a?.[field])
    const bv = lower(b?.[field])
    return av.localeCompare(bv)
  }
}

