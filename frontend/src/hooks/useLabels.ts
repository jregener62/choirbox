import { create } from 'zustand'
import { api } from '@/api/client.ts'
import type { Label, UserLabelAssignment } from '@/types/index.ts'

interface LabelsState {
  labels: Label[]
  assignments: UserLabelAssignment[]
  loaded: boolean
  load: () => Promise<void>
  getLabelsForPath: (dropboxPath: string) => Label[]
  getVoiceLabelsForPath: (dropboxPath: string) => Label[]
  getGeneralLabelsForPath: (dropboxPath: string) => Label[]
  voiceLabels: () => Label[]
  generalLabels: () => Label[]
  toggleLabel: (dropboxPath: string, labelId: number) => Promise<void>
  isAssigned: (dropboxPath: string, labelId: number) => boolean
}

export const useLabelsStore = create<LabelsState>((set, get) => ({
  labels: [],
  assignments: [],
  loaded: false,

  load: async () => {
    // /labels ist fuer Gaeste freigegeben, /labels/my nicht. Die zwei
    // Calls daher unabhaengig voneinander laufen lassen, sonst bricht
    // ein 403 auf /labels/my die gesamte Labels-Ladung — dann haette
    // auch die Filter-UI keine Labels mehr.
    try {
      const labels = await api<Label[]>('/labels')
      set({ labels })
    } catch {
      // ignore
    }
    try {
      const assignments = await api<UserLabelAssignment[]>('/labels/my')
      set({ assignments })
    } catch {
      // Gast / kein Zugriff — assignments bleibt leer, kein Fehler
    }
    set({ loaded: true })
  },

  getLabelsForPath: (dropboxPath: string) => {
    const { labels, assignments } = get()
    const assignedIds = assignments
      .filter((a) => a.dropbox_path === dropboxPath)
      .map((a) => a.label_id)
    return labels.filter((l) => assignedIds.includes(l.id))
  },

  getVoiceLabelsForPath: (dropboxPath: string) => {
    return get().getLabelsForPath(dropboxPath).filter((l) => l.category === 'Stimme')
  },

  getGeneralLabelsForPath: (dropboxPath: string) => {
    return get().getLabelsForPath(dropboxPath).filter((l) => l.category !== 'Stimme')
  },

  voiceLabels: () => get().labels.filter((l) => l.category === 'Stimme'),

  generalLabels: () => get().labels.filter((l) => l.category !== 'Stimme'),

  isAssigned: (dropboxPath: string, labelId: number) => {
    return get().assignments.some(
      (a) => a.dropbox_path === dropboxPath && a.label_id === labelId,
    )
  },

  toggleLabel: async (dropboxPath: string, labelId: number) => {
    const wasAssigned = get().isAssigned(dropboxPath, labelId)

    // Optimistic update: immediately update local state
    if (wasAssigned) {
      set({
        assignments: get().assignments.filter(
          (a) => !(a.dropbox_path === dropboxPath && a.label_id === labelId),
        ),
      })
    } else {
      const tempAssignment: UserLabelAssignment = {
        id: -Date.now(),
        dropbox_path: dropboxPath,
        label_id: labelId,
      }
      set({ assignments: [...get().assignments, tempAssignment] })
    }

    try {
      await api('/labels/my/toggle', {
        method: 'POST',
        body: { dropbox_path: dropboxPath, label_id: labelId },
      })
    } catch {
      // Rollback on error: reload from server
      const assignments = await api<UserLabelAssignment[]>('/labels/my')
      set({ assignments })
    }
  },
}))
