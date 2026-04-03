/**
 * Folder type utilities — mirrors backend/services/folder_types.py
 *
 * .song extension for song folders + reserved folder names (Texte, Audio, Videos, Multitrack).
 */

const SONG_EXT = /\.song$/i
const RESERVED_NAMES = new Set(['texte', 'audio', 'videos', 'multitrack'])

export function stripFolderExtension(name: string): string {
  return name.replace(SONG_EXT, '')
}

export function isSongFolder(name: string): boolean {
  return SONG_EXT.test(name)
}

export function isReservedName(name: string): boolean {
  return RESERVED_NAMES.has(name.toLowerCase())
}

export function getReservedType(name: string): string | null {
  const lower = name.toLowerCase()
  return RESERVED_NAMES.has(lower) ? lower : null
}

export function getFolderType(pathOrName: string): string | null {
  const segment = pathOrName.split('/').filter(Boolean).pop() || ''
  if (SONG_EXT.test(segment)) return 'song'
  return getReservedType(segment)
}
