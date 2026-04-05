import { FileText, Volume2, Video, Layers, Folder, type LucideIcon } from 'lucide-react'

export interface FolderTypeStyle {
  icon: LucideIcon
  label: string
  color: string
  bgColor: string
  borderColor: string
  activeBgColor: string
}

const DEFAULT_CONFIG: FolderTypeStyle = {
  icon: Folder,
  label: '',
  color: 'var(--text-secondary)',
  bgColor: 'rgba(148,163,184,0.10)',
  borderColor: 'rgba(148,163,184,0.35)',
  activeBgColor: 'rgba(148,163,184,0.22)',
}

export const FOLDER_TYPE_CONFIG: Record<string, FolderTypeStyle> = {
  texte: {
    icon: FileText,
    label: 'Texte',
    color: '#c7d2fe',
    bgColor: 'rgba(99,102,241,0.10)',
    borderColor: 'rgba(99,102,241,0.35)',
    activeBgColor: 'rgba(99,102,241,0.22)',
  },
  audio: {
    icon: Volume2,
    label: 'Audio',
    color: '#67e8f9',
    bgColor: 'rgba(6,182,212,0.10)',
    borderColor: 'rgba(6,182,212,0.35)',
    activeBgColor: 'rgba(6,182,212,0.22)',
  },
  videos: {
    icon: Video,
    label: 'Videos',
    color: '#e879f9',
    bgColor: 'rgba(217,70,239,0.10)',
    borderColor: 'rgba(217,70,239,0.35)',
    activeBgColor: 'rgba(217,70,239,0.22)',
  },
  multitrack: {
    icon: Layers,
    label: 'Multitrack',
    color: '#fbbf24',
    bgColor: 'rgba(245,158,11,0.10)',
    borderColor: 'rgba(245,158,11,0.35)',
    activeBgColor: 'rgba(245,158,11,0.22)',
  },
}

export function getFolderTypeConfig(type: string): FolderTypeStyle {
  return FOLDER_TYPE_CONFIG[type] || { ...DEFAULT_CONFIG, label: type }
}
