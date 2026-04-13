export const CHORD_RE = /^[A-G](#|b)?(m|maj|sus|dim|aug)?(\d+)?(\/[A-G](#|b)?)?$/

export function isValidChord(token: string): boolean {
  return CHORD_RE.test(token)
}
