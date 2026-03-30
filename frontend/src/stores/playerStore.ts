import { create } from 'zustand'
import type { Section } from '@/types/index.ts'

export interface Marker {
  id: string
  time: number
  label: string
}

interface PlayerState {
  // Current track
  currentPath: string | null
  currentName: string | null
  isPlaying: boolean
  duration: number
  currentTime: number

  // Cycle play (A-B loop)
  loopStart: number | null
  loopEnd: number | null
  loopEnabled: boolean

  // Section loop
  activeSection: Section | null

  // Session markers
  markers: Marker[]
  pendingLoopMarkerId: string | null

  // Skip interval (seconds)
  skipInterval: number

  // Actions
  setTrack: (path: string, name: string) => void
  setPlaying: (playing: boolean) => void
  setDuration: (duration: number) => void
  setCurrentTime: (time: number) => void
  setLoopStart: (time: number | null) => void
  setLoopEnd: (time: number | null) => void
  toggleLoop: () => void
  clearLoop: () => void
  setSectionLoop: (section: Section | null) => void
  addMarker: (time: number) => void
  removeMarker: (id: string) => void
  clearMarkers: () => void
  setPendingLoopMarker: (id: string | null) => void
  createLoopFromMarkers: (a: Marker, b: Marker) => void
  setSkipInterval: (interval: number) => void
}

let markerCounter = 0

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentPath: null,
  currentName: null,
  isPlaying: false,
  duration: 0,
  currentTime: 0,
  loopStart: null,
  loopEnd: null,
  loopEnabled: false,
  activeSection: null,
  markers: [],
  pendingLoopMarkerId: null,
  skipInterval: 15,

  setTrack: (path, name) => set({
    currentPath: path,
    currentName: name,
    isPlaying: false,
    duration: 0,
    currentTime: 0,
    loopStart: null,
    loopEnd: null,
    loopEnabled: false,
    activeSection: null,
    markers: [],
    pendingLoopMarkerId: null,
  }),

  setPlaying: (playing) => set({ isPlaying: playing }),
  setDuration: (duration) => set({ duration }),
  setCurrentTime: (time) => set({ currentTime: time }),

  setLoopStart: (time) => set({ loopStart: time, activeSection: null }),
  setLoopEnd: (time) => set({ loopEnd: time, activeSection: null }),
  toggleLoop: () => {
    const { loopStart, loopEnd, loopEnabled } = get()
    if (loopStart !== null && loopEnd !== null) {
      set({ loopEnabled: !loopEnabled })
    }
  },
  clearLoop: () => set({ loopStart: null, loopEnd: null, loopEnabled: false, activeSection: null, pendingLoopMarkerId: null }),

  setSectionLoop: (section) => {
    if (section) {
      set({
        activeSection: section,
        loopStart: section.start_time,
        loopEnd: section.end_time,
        loopEnabled: true,
        pendingLoopMarkerId: null,
      })
    } else {
      set({
        activeSection: null,
        loopStart: null,
        loopEnd: null,
        loopEnabled: false,
        pendingLoopMarkerId: null,
      })
    }
  },

  addMarker: (time) => {
    markerCounter++
    const marker: Marker = {
      id: `m-${markerCounter}`,
      time,
      label: `M${markerCounter}`,
    }
    set((s) => ({ markers: [...s.markers, marker].sort((a, b) => a.time - b.time) }))
  },
  removeMarker: (id) => set((s) => ({
    markers: s.markers.filter((m) => m.id !== id),
    pendingLoopMarkerId: s.pendingLoopMarkerId === id ? null : s.pendingLoopMarkerId,
  })),
  clearMarkers: () => set({ markers: [], pendingLoopMarkerId: null }),
  setPendingLoopMarker: (id) => set({ pendingLoopMarkerId: id }),
  createLoopFromMarkers: (a, b) => {
    const earlier = a.time <= b.time ? a : b
    const later = a.time <= b.time ? b : a
    set({ loopStart: earlier.time, loopEnd: later.time, loopEnabled: true, activeSection: null, pendingLoopMarkerId: null })
  },
  setSkipInterval: (interval) => set({ skipInterval: interval }),
}))
