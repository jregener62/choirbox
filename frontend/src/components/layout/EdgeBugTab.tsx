import { useState, useEffect, useCallback } from 'react'
import { Bug, X, Send, ExternalLink } from 'lucide-react'
import { api } from '@/api/client.ts'
import { useAuthStore } from '@/stores/authStore.ts'

interface GitHubIssue {
  number: number
  title: string
  state: 'open' | 'closed'
  html_url: string
  labels: string[]
  created_at: string
  user: string | null
}

interface IssuesResponse {
  issues: GitHubIssue[]
  open_count: number
}

export function EdgeBugTab() {
  const user = useAuthStore((s) => s.user)
  const isDeveloper = user?.role === 'developer'

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [issues, setIssues] = useState<GitHubIssue[]>([])
  const [openCount, setOpenCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [quickTitle, setQuickTitle] = useState('')
  const [quickType, setQuickType] = useState<'bug' | 'feature'>('bug')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  const loadIssues = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<IssuesResponse>('/feedback/issues')
      setIssues(data.issues)
      setOpenCount(data.open_count)
    } catch {
      setMessage('Fehler beim Laden der Issues')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (drawerOpen && isDeveloper) loadIssues()
  }, [drawerOpen, isDeveloper, loadIssues])

  const submitQuickIssue = async () => {
    if (!quickTitle.trim() || submitting) return
    setSubmitting(true)
    try {
      await api('/feedback', {
        method: 'POST',
        body: { title: quickTitle.trim(), type: quickType },
      })
      setQuickTitle('')
      setMessage('Issue erstellt!')
      if (isDeveloper) loadIssues()
      setTimeout(() => setMessage(''), 3000)
    } catch {
      setMessage('Fehler beim Erstellen')
    } finally {
      setSubmitting(false)
    }
  }

  const getIssueColor = (issue: GitHubIssue) => {
    if (issue.labels.includes('bug')) return 'var(--danger)'
    if (issue.labels.includes('enhancement')) return 'var(--success)'
    return 'var(--warning)'
  }

  const getIssueTypeLabel = (issue: GitHubIssue) => {
    if (issue.labels.includes('bug')) return 'bug'
    if (issue.labels.includes('enhancement')) return 'feature'
    return 'sonstig'
  }

  return (
    <>
      {/* Edge Tab — always visible */}
      <button className="edge-bug-tab" onClick={() => setDrawerOpen(true)}>
        <Bug size={14} />
        {isDeveloper && openCount > 0 && <span className="edge-bug-count">{openCount}</span>}
      </button>

      {/* Drawer overlay */}
      {drawerOpen && (
        <div className="issue-drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <div className="issue-drawer" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="issue-drawer-header">
              <button className="issue-drawer-close" onClick={() => setDrawerOpen(false)}>
                <X size={16} />
              </button>
              <span className="issue-drawer-title">Issues</span>
            </div>

            {/* Stats */}
            {isDeveloper && (
              <div className="issue-drawer-stats">
                <span>{openCount} offen</span>
              </div>
            )}

            {/* Message */}
            {message && (
              <div className="issue-drawer-message" onClick={() => setMessage('')}>
                {message}
              </div>
            )}

            {/* Issue List */}
            {isDeveloper && (
              <div className="issue-drawer-list">
                {loading && <div className="issue-drawer-empty">Laden...</div>}
                {!loading && issues.length === 0 && (
                  <div className="issue-drawer-empty">Keine Issues vorhanden</div>
                )}
                {issues.map((issue) => (
                  <div key={issue.number} className="issue-drawer-item">
                    <div
                      className="issue-drawer-dot"
                      style={{ background: getIssueColor(issue) }}
                    />
                    <div className="issue-drawer-body">
                      <div className="issue-drawer-item-title">{issue.title}</div>
                      <div className="issue-drawer-labels">
                        <span
                          className="issue-drawer-label"
                          style={{
                            background: `color-mix(in srgb, ${getIssueColor(issue)} 15%, transparent)`,
                            color: getIssueColor(issue),
                          }}
                        >
                          {getIssueTypeLabel(issue)}
                        </span>
                      </div>
                    </div>
                    <a
                      href={issue.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="issue-drawer-link"
                    >
                      <ExternalLink size={14} />
                    </a>
                    <span className="issue-drawer-num">#{issue.number}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Quick Add */}
            <div className="issue-drawer-quickadd">
              <div className="issue-drawer-quickadd-type">
                <button
                  className={`issue-drawer-type-btn ${quickType === 'bug' ? 'active' : ''}`}
                  onClick={() => setQuickType('bug')}
                  style={quickType === 'bug' ? { color: 'var(--danger)' } : undefined}
                >
                  Bug
                </button>
                <button
                  className={`issue-drawer-type-btn ${quickType === 'feature' ? 'active' : ''}`}
                  onClick={() => setQuickType('feature')}
                  style={quickType === 'feature' ? { color: 'var(--success)' } : undefined}
                >
                  Wunsch
                </button>
              </div>
              <div className="issue-drawer-quickadd-row">
                <input
                  type="text"
                  className="issue-drawer-quickadd-input"
                  placeholder="Neues Issue..."
                  value={quickTitle}
                  onChange={(e) => setQuickTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitQuickIssue()}
                  disabled={submitting}
                />
                <button
                  className="issue-drawer-quickadd-send"
                  onClick={submitQuickIssue}
                  disabled={!quickTitle.trim() || submitting}
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
