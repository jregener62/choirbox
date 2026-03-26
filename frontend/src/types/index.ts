export interface User {
  id: string
  username: string
  display_name: string
  role: 'admin' | 'guest'
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

export interface ActionResponse<T = unknown> {
  outcome: 'success' | 'success_with_warnings' | 'failure'
  reason: string | null
  data: T
  warnings: Array<{ code: string; message: string }>
}
