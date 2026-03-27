import { Music } from 'lucide-react'
import { parseTrackFilename } from '@/utils/parseTrackFilename'
import { voiceColor, voiceBg } from '@/utils/voiceColors'

const FONT_SIZE: Record<number, number> = { 1: 15, 2: 13, 3: 11, 4: 10 }

interface VoiceIconProps {
  filename: string
  folderName: string
}

export function VoiceIcon({ filename, folderName }: VoiceIconProps) {
  const parsed = parseTrackFilename(filename, folderName)

  if (!parsed) {
    return (
      <div className="file-icon-box file-icon-audio">
        <Music size={18} />
      </div>
    )
  }

  const { voiceKey } = parsed

  return (
    <div
      className="file-icon-box"
      style={{
        background: voiceBg(voiceKey),
        color: voiceColor(voiceKey),
        fontWeight: 700,
        fontSize: FONT_SIZE[voiceKey.length] || 9,
        letterSpacing: voiceKey.length >= 3 ? -0.8 : 0,
        lineHeight: 1,
      }}
    >
      {voiceKey}
    </div>
  )
}
