import { create } from 'zustand'
import { api } from '@/api/client.ts'
import type { Label, UserLabelAssignment } from '@/types/index.ts'

interface LabelsState {
  labels: Label[]
  assignments: UserLabelAssignment[]
  loaded: boolean
  load: () => Promise<void>
  getLabelsForPath: (dropboxPath: string) => Label[]
  toggleLabel: (dropboxPath: string, labelId: number) => Promise<void>
  isAssigned: (dropboxPath: string, labelId: number) => boolean
}

export const useLabelsStore = create<LabelsState>((set, get) => ({
  labels: [],
  assignments: [],
  loaded: false,

  load: async () => {
    try {
      const [labels, assignments] = await Promise.all([
        api<Label[]>('/labels'),
        api<UserLabelAssignment[]>('/labels/my'),
      ])
      set({ labels, assignments, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },

  getLabelsForPath: (dropboxPath: string) => {
    const { labels, assignments } = get()
    const assignedIds = assignments
      .filter((a) => a.dropbox_path === dropboxPath)
      .map((a) => a.label_id)
    return labels.filter((l) => assignedIds.includes(l.id))
  },

  isAssigned: (dropboxPath: string, labelId: number) => {
    return get().assignments.some(
      (a) => a.dropbox_path === dropboxPath && a.label_id === labelId,
    )
  },

  toggleLabel: async (dropboxPath: string, labelId: number) => {
    await api('/labels/my/toggle', {
      method: 'POST',
      body: { dropbox_path: dropboxPath, label_id: labelId },
    })
    // Reload assignments
    const assignments = await api<UserLabelAssignment[]>('/labels/my')
    set({ assignments })
  },
}))
