import { useMemo } from 'react'
import { zxcvbn, zxcvbnOptions } from '@zxcvbn-ts/core'
import * as zxcvbnCommon from '@zxcvbn-ts/language-common'
import * as zxcvbnDe from '@zxcvbn-ts/language-de'

let optionsSet = false
function ensureOptions() {
  if (optionsSet) return
  zxcvbnOptions.setOptions({
    translations: zxcvbnDe.translations,
    graphs: zxcvbnCommon.adjacencyGraphs,
    dictionary: {
      ...zxcvbnCommon.dictionary,
      ...zxcvbnDe.dictionary,
    },
  })
  optionsSet = true
}

export const MIN_PASSWORD_LENGTH = 10
export const MIN_ACCEPTABLE_SCORE = 2

const SCORE_LABELS = ['Zu schwach', 'Schwach', 'Mäßig', 'Gut', 'Stark']
const SCORE_COLORS = [
  'var(--danger)',
  'var(--danger)',
  'var(--warning)',
  'var(--marker)',
  'var(--success)',
]

export interface PasswordStrengthResult {
  score: 0 | 1 | 2 | 3 | 4
  label: string
  warning: string
  suggestions: string[]
  acceptable: boolean
  tooShort: boolean
}

export function evaluatePassword(
  password: string,
  userInputs: string[] = [],
): PasswordStrengthResult {
  ensureOptions()
  const tooShort = password.length < MIN_PASSWORD_LENGTH
  if (!password) {
    return {
      score: 0,
      label: '',
      warning: '',
      suggestions: [],
      acceptable: false,
      tooShort: true,
    }
  }
  const result = zxcvbn(password, userInputs)
  const score = result.score as 0 | 1 | 2 | 3 | 4
  return {
    score,
    label: SCORE_LABELS[score],
    warning: result.feedback.warning || '',
    suggestions: result.feedback.suggestions || [],
    acceptable: !tooShort && score >= MIN_ACCEPTABLE_SCORE,
    tooShort,
  }
}

interface Props {
  password: string
  userInputs?: string[]
}

export function PasswordStrengthMeter({ password, userInputs = [] }: Props) {
  const result = useMemo(() => evaluatePassword(password, userInputs), [password, userInputs])

  if (!password) return null

  const color = SCORE_COLORS[result.score]
  const hints: string[] = []
  if (result.tooShort) {
    hints.push(`Mindestens ${MIN_PASSWORD_LENGTH} Zeichen`)
  }
  if (result.warning) hints.push(result.warning)
  for (const s of result.suggestions) hints.push(s)

  return (
    <div className="pw-meter" aria-live="polite">
      <div className="pw-meter-bar">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="pw-meter-seg"
            style={{
              background: i < Math.max(result.score, 1) ? color : 'var(--bg-tertiary)',
            }}
          />
        ))}
      </div>
      <div className="pw-meter-label" style={{ color }}>
        {result.label}
      </div>
      {hints.length > 0 && (
        <ul className="pw-meter-hints">
          {hints.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
