export interface User {
  id: string
  username: string
  display_name: string
  role: 'guest' | 'member' | 'pro-member' | 'chorleiter' | 'admin'
  voice_part: string
  choir_id: string | null
  choir_name: string | null
  must_change_password: boolean
}

export interface LoginResponse {
  token: string
  user: User
}

export interface DropboxEntry {
  name: string
  path: string
  type: 'folder' | 'file' | 'document'
  size?: number
  modified?: string
  duration?: number
}

export interface BrowseResponse {
  path: string
  entries: DropboxEntry[]
  root_name?: string | null
  error?: string
}

export interface Label {
  id: number
  name: string
  color: string
  category: string | null
}

export interface Favorite {
  id: number
  dropbox_path: string
  file_name: string
  entry_type: 'file' | 'folder'
  created_at: string
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
  file_type: 'pdf' | 'video' | 'txt'
  original_name: string
  file_size: number
  page_count: number
  sort_order: number
  hidden: boolean
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
