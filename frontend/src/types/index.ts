export interface User {
  id: string
  username: string
  display_name: string
  role: 'guest' | 'member' | 'pro-member' | 'chorleiter' | 'admin'
  voice_part: string
}

export interface LoginResponse {
  token: string
  user: User
}

export interface DropboxEntry {
  name: string
  path: string
  type: 'folder' | 'file'
  size?: number
  modified?: string
}

export interface BrowseResponse {
  path: string
  entries: DropboxEntry[]
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
  created_at: string
}

export interface UserLabelAssignment {
  id: number
  dropbox_path: string
  label_id: number
}

export interface Section {
  id: number
  dropbox_path: string
  label: string
  color: string
  start_time: number
  end_time: number
  sort_order: number
  created_by: string
  created_at: string
}

export interface ActionResponse<T = unknown> {
  outcome: 'success' | 'success_with_warnings' | 'failure'
  reason: string | null
  data: T
  warnings: Array<{ code: string; message: string }>
}
