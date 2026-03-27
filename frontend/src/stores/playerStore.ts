import { create } from 'zustand'

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

  // Session markers
  markers: Marker[]

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
  addMarker: (time: number) => void
  removeMarker: (id: string) => void
  clearMarkers: () => void
  cycleSkipInterval: () => void
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
  markers: [],
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
    markers: [],
  }),

  setPlaying: (playing) => set({ isPlaying: playing }),
  setDuration: (duration) => set({ duration }),
  setCurrentTime: (time) => set({ currentTime: time }),

  setLoopStart: (time) => set({ loopStart: time }),
  setLoopEnd: (time) => set({ loopEnd: time }),
  toggleLoop: () => {
    const { loopStart, loopEnd, loopEnabled } = get()
    if (loopStart !== null && loopEnd !== null) {
      set({ loopEnabled: !loopEnabled })
    }
  },
  clearLoop: () => set({ loopStart: null, loopEnd: null, loopEnabled: false }),

  addMarker: (time) => {
    markerCounter++
    const marker: Marker = {
      id: `m-${markerCounter}`,
      time,
      label: `M${markerCounter}`,
    }
    set((s) => ({ markers: [...s.markers, marker].sort((a, b) => a.time - b.time) }))
  },
  removeMarker: (id) => set((s) => ({ markers: s.markers.filter((m) => m.id !== id) })),
  clearMarkers: () => set({ markers: [] }),
  cycleSkipInterval: () => {
    const next: Record<number, number> = { 5: 10, 10: 15, 15: 5 }
    set((s) => ({ skipInterval: next[s.skipInterval] ?? 15 }))
  },
}))
