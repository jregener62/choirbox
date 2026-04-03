/**
 * Folder type utilities — mirrors backend/services/folder_types.py
 */

const KNOWN_EXTENSIONS = ['song', 'tx', 'audio'] as const
const EXT_PATTERN = /\.(song|tx|audio)$/i

export function stripFolderExtension(name: string): string {
  return name.replace(EXT_PATTERN, '')
}

export function getFolderType(pathOrName: string): string | null {
  const segment = pathOrName.split('/').filter(Boolean).pop() || ''
  const match = segment.match(EXT_PATTERN)
  return match ? match[1].toLowerCase() : null
}
