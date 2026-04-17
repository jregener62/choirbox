import { create } from 'zustand'

export const useSheetEditMode = create<{
  active: boolean
  start: () => void
  stop: () => void
}>((set) => ({
  active: false,
  start: () => set({ active: true }),
  stop: () => set({ active: false }),
}))
