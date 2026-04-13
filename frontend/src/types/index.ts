export type UserRole =
  | 'guest'
  | 'member'
  | 'pro-member'
  | 'chorleiter'
  | 'admin'
  | 'beta-tester'
  | 'developer'

export interface User {
  id: string
  username: string
  display_name: string
  role: UserRole
  voice_part: string
  choir_id: string | null
  choir_name: string | null
  must_change_password: boolean
  can_report_bugs: boolean
  /** "songs" (Vollzugriff) oder "texts" (nur Texte/Noten). */
  view_mode: 'songs' | 'texts'
}

export interface LoginResponse {
  token: string
  user: User
}

export type FolderType = 'song' | 'texte' | 'audio' | 'videos' | 'multitrack'

export interface SubFolderInfo {
  type: FolderType
  name: string
  path: string
  count: number
}

export interface DropboxEntry {
  name: string
  display_name?: string
  path: string
  type: 'folder' | 'file' | 'document'
  folder_type?: FolderType | null
  size?: number
  modified?: string
  duration?: number
  doc_count?: number
  doc_id?: number
  selected?: boolean
  voice_keys?: string | null
  section_keys?: string | null
  song_name?: string | null
  free_text?: string | null
  sub_folders?: SubFolderInfo[]
  selected_doc?: { name: string; path: string; doc_id: number } | null
}

export interface BrowseResponse {
  path: string
  entries: DropboxEntry[]
  root_name?: string | null
  song_sub_folders?: SubFolderInfo[]
  error?: string
}

export interface Label {
  id: number
  name: string
  color: string
  category: string | null
  shortcode: string | null
  aliases: string | null
  sort_order: number
}

export interface Favorite {
  id: number
  dropbox_path: string
  file_name: string
  entry_type: 'file' | 'folder'
  created_at: string
  voice_keys?: string | null
  section_keys?: string | null
  song_name?: string | null
  free_text?: string | null
}

export interface UserLabelAssignment {
  id: number
  dropbox_path: string
  label_id: number
}

export interface SectionPreset {
  id: number
  name: string
  color: string
  sort_order: number
  shortcode: string | null
  max_num: number
}

export interface Section {
  id: number
  folder_path: string
  label: string
  color: string
  start_time: number
  end_time: number
  lyrics: string | null
  sort_order: number
  created_by: string
  created_at: string
}

export interface Note {
  id: number
  dropbox_path: string
  section_id: number | null
  text: string
}

export interface DocumentItem {
  id: number
  file_type: 'pdf' | 'video' | 'txt' | 'cho'
  original_name: string
  file_size: number
  page_count: number
  sort_order: number
}

export interface DocumentListResponse {
  documents: DocumentItem[]
}

export interface Stroke {
  id: string
  points: number[][]  // [x, y, pressure]
  color: string
  width: number
  tool: 'pen' | 'highlighter'
}

export interface ActionResponse<T = unknown> {
  outcome: 'success' | 'success_with_warnings' | 'failure'
  reason: string | null
  data: T
  warnings: Array<{ code: string; message: string }>
}

// --- Chord Sheets ---

export interface ChordPosition {
  chord: string
  col: number
}

export interface ChordLine {
  text: string
  chords: ChordPosition[]
  /** ChordPro {comment:} line — styled with highlighter background + italic. */
  isComment?: boolean
  /** Inline {c:...} / {ci:...} directives appearing mid-line — rendered
   *  at the end of the line with the same highlighter style. */
  annotations?: string[]
}

export interface ChordSection {
  type: string
  label: string
  lines: ChordLine[]
}

export interface ParsedChordContent {
  sections: ChordSection[]
  all_chords: string[]
  detected_key: string
  key_confidence: number
}

