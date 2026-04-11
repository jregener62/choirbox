import { create } from 'zustand'
import type { Section } from '@/types/index.ts'

export interface Marker {
  id: string
  time: number
  label: string
}

export const AUTO_SCROLL_SPEEDS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5] as const
export const AUTO_SCROLL_DEFAULT_IDX = 4
export const AUTO_SCROLL_BASE_PX_PER_SEC = 30

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
  loopMarkerIds: [string, string] | null

  // Skip interval (seconds)
  skipInterval: number

  // PDF fullscreen
  pdfFullscreen: boolean

  // Autoscroll im Vollbild
  autoScrollEnabled: boolean
  autoScrollSpeedIdx: number

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
  setPdfFullscreen: (fullscreen: boolean) => void
  setAutoScrollEnabled: (enabled: boolean) => void
  setAutoScrollSpeedIdx: (idx: number) => void
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
  loopMarkerIds: null,
  skipInterval: 15,
  pdfFullscreen: false,
  autoScrollEnabled: false,
  autoScrollSpeedIdx: AUTO_SCROLL_DEFAULT_IDX,

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
    loopMarkerIds: null,
    autoScrollEnabled: false,
  }),

  setPlaying: (playing) => set({ isPlaying: playing }),
  setDuration: (duration) => set({ duration }),
  setCurrentTime: (time) => set({ currentTime: time }),

  setLoopStart: (time) => set({ loopStart: time, activeSection: null }),
  setLoopEnd: (time) => set({ loopEnd: time, activeSection: null }),
  toggleLoop: () => {
    const { loopStart, loopEnd, loopEnabled } = get()
    if (loopStart !== null && loopEnd !== null) {
      set({ loopEnabled: !loopEnabled, loopMarkerIds: loopEnabled ? null : get().loopMarkerIds })
    }
  },
  clearLoop: () => set({ loopStart: null, loopEnd: null, loopEnabled: false, activeSection: null, pendingLoopMarkerId: null, loopMarkerIds: null }),

  setSectionLoop: (section) => {
    if (section) {
      set({
        activeSection: section,
        loopStart: section.start_time,
        loopEnd: section.end_time,
        loopEnabled: true,
        pendingLoopMarkerId: null,
        loopMarkerIds: null,
      })
    } else {
      set({
        activeSection: null,
        loopStart: null,
        loopEnd: null,
        loopEnabled: false,
        pendingLoopMarkerId: null,
        loopMarkerIds: null,
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
    loopMarkerIds: s.loopMarkerIds && (s.loopMarkerIds[0] === id || s.loopMarkerIds[1] === id) ? null : s.loopMarkerIds,
  })),
  clearMarkers: () => set({ markers: [], pendingLoopMarkerId: null, loopMarkerIds: null }),
  setPendingLoopMarker: (id) => set({ pendingLoopMarkerId: id }),
  createLoopFromMarkers: (a, b) => {
    const earlier = a.time <= b.time ? a : b
    const later = a.time <= b.time ? b : a
    set({ loopStart: earlier.time, loopEnd: later.time, loopEnabled: true, activeSection: null, pendingLoopMarkerId: null, loopMarkerIds: [earlier.id, later.id] })
  },
  setSkipInterval: (interval) => set({ skipInterval: interval }),
  setPdfFullscreen: (fullscreen) => set({ pdfFullscreen: fullscreen }),
  setAutoScrollEnabled: (enabled) => set({ autoScrollEnabled: enabled }),
  setAutoScrollSpeedIdx: (idx) => set({
    autoScrollSpeedIdx: Math.max(0, Math.min(AUTO_SCROLL_SPEEDS.length - 1, idx)),
  }),
}))
