import { Music, Play, ArrowLeft, Folder, ChevronRight } from 'lucide-react'
import { usePlayerStore } from '@/stores/playerStore'
import type { DropboxEntry } from '@/types/index'
import type { BatchGridData } from '@/utils/buildBatchGrid'
import {
  formatSectionLabel,
  voiceColorClass,
  voiceLabel,
} from '@/utils/buildBatchGrid'

interface BatchGridProps {
  gridData: BatchGridData
  onFileClick: (entry: DropboxEntry) => void
  onNavigateUp: () => void
  browsePath: string
}

export function BatchGrid({ gridData, onFileClick, onNavigateUp, browsePath }: BatchGridProps) {
  const currentPath = usePlayerStore((s) => s.currentPath)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const { voiceColumns, sectionRows, cells, extraFiles, folders } = gridData

  const handleCellClick = (entry: DropboxEntry) => {
    onFileClick(entry)
  }

  return (
    <>
      {/* Folders + navigate up as regular list */}
      {(browsePath || folders.length > 0) && (
        <ul className="file-list">
          {browsePath && (
            <li className="file-item" onClick={onNavigateUp}>
              <div className="file-icon-box file-icon-folder">
                <ArrowLeft size={18} />
              </div>
            </li>
          )}
          {folders.map((entry) => (
            <li
              key={entry.path}
              className="file-item"
              onClick={() => onFileClick(entry)}
            >
              <div className="file-icon-box file-icon-folder">
                <Folder size={18} />
              </div>
              <div className="file-info">
                <div className="file-name">{entry.name}</div>
              </div>
              <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            </li>
          ))}
        </ul>
      )}

      {/* Grid */}
      <div
        className="batch-grid"
        style={{ '--cols': voiceColumns.length } as React.CSSProperties}
      >
        {/* Header row */}
        <div className="grid-header">
          <div className="grid-header-corner" />
          {voiceColumns.map((vk) => (
            <div
              key={vk}
              className={`grid-header-cell col-${voiceColorClass(vk)}`}
            >
              {voiceLabel(vk)}
            </div>
          ))}
        </div>

        {/* Data rows */}
        {sectionRows.map((sk) => (
          <div key={sk} className="grid-row">
            <div className="grid-section-label">
              {formatSectionLabel(sk)}
            </div>
            {voiceColumns.map((vk) => {
              const cell = cells.get(`${sk}::${vk}`)
              if (!cell) {
                return <div key={vk} className="grid-cell empty" />
              }
              const isCurrent = cell.entry.path === currentPath
              const isActive = isCurrent && isPlaying
              return (
                <div
                  key={vk}
                  className={`grid-cell has-file voice-${voiceColorClass(vk)} ${isActive ? 'playing' : ''}`}
                  onClick={() => handleCellClick(cell.entry)}
                >
                  <div className="cell-icon">
                    {isActive ? (
                      <div className="playing-bars playing-bars--sm">
                        <span /><span /><span />
                      </div>
                    ) : (
                      <Play size={14} fill="currentColor" strokeWidth={0} />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Extra files that couldn't be parsed into the grid */}
      {extraFiles.length > 0 && (
        <>
          <div className="batch-section-divider">Weitere Dateien</div>
          <div className="batch-extra-files">
            {extraFiles.map((entry) => {
              const isCurrent = entry.path === currentPath
              return (
                <div
                  key={entry.path}
                  className={`batch-extra-file ${isCurrent ? 'batch-extra-file--active' : ''}`}
                  onClick={() => handleCellClick(entry)}
                >
                  <div className="file-icon-box file-icon-audio" style={{ width: 28, height: 28 }}>
                    {isCurrent && isPlaying ? (
                      <div className="playing-bars playing-bars--sm">
                        <span /><span /><span />
                      </div>
                    ) : (
                      <Music size={14} />
                    )}
                  </div>
                  <div className="batch-extra-name">{entry.name}</div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}
