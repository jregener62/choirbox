import { useSyncExternalStore, useCallback } from 'react'

export type RecorderState = 'idle' | 'recording' | 'stopped' | 'error'

interface UseRecorderReturn {
  state: RecorderState
  error: string | null
  duration: number
  blob: Blob | null
  blobUrl: string | null
  fileExtension: string
  startRecording: () => Promise<void>
  stopRecording: () => void
  reset: () => void
}

function getPreferredMimeType(): { mimeType: string; extension: string } {
  if (typeof MediaRecorder === 'undefined') {
    return { mimeType: '', extension: '' }
  }
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
    return { mimeType: 'audio/webm;codecs=opus', extension: 'webm' }
  }
  if (MediaRecorder.isTypeSupported('audio/mp4')) {
    return { mimeType: 'audio/mp4', extension: 'm4a' }
  }
  if (MediaRecorder.isTypeSupported('audio/webm')) {
    return { mimeType: 'audio/webm', extension: 'webm' }
  }
  return { mimeType: '', extension: 'webm' }
}

// ── Module-level singleton state ──
// Survives component unmount/remount so recording continues across navigation.
let _recorder: MediaRecorder | null = null
let _stream: MediaStream | null = null
let _chunks: Blob[] = []
let _timer: ReturnType<typeof setInterval> | null = null
let _startTime = 0

// Snapshot values readable by any hook instance
let _sState: RecorderState = 'idle'
let _sError: string | null = null
let _sDuration = 0
let _sBlob: Blob | null = null
let _sBlobUrl: string | null = null

// Subscription system for useSyncExternalStore
const _listeners = new Set<() => void>()
let _version = 0

function subscribe(listener: () => void) {
  _listeners.add(listener)
  return () => { _listeners.delete(listener) }
}

function getSnapshot() {
  return _version
}

function notify() {
  _version++
  _listeners.forEach(fn => fn())
}

function cleanupStream() {
  if (_timer) { clearInterval(_timer); _timer = null }
  if (_stream) { _stream.getTracks().forEach((t) => t.stop()); _stream = null }
  _recorder = null
  _chunks = []
}

export function useRecorder(): UseRecorderReturn {
  // Re-render when singleton state changes — supports multiple subscribers,
  // survives component unmount/remount, works after native dialogs (iOS getUserMedia)
  useSyncExternalStore(subscribe, getSnapshot)

  const { mimeType, extension: fileExtension } = getPreferredMimeType()

  const startRecording = useCallback(async () => {
    // If already recording, ignore
    if (_recorder && _recorder.state === 'recording') return

    try {
      _sError = null
      _chunks = []

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
      _stream = stream

      const options: MediaRecorderOptions = {}
      if (mimeType) options.mimeType = mimeType

      const recorder = new MediaRecorder(stream, options)
      _recorder = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) _chunks.push(e.data)
      }

      recorder.onstop = () => {
        const recorded = new Blob(_chunks, {
          type: recorder.mimeType || mimeType || 'audio/webm',
        })
        _sBlob = recorded
        _sBlobUrl = URL.createObjectURL(recorded)
        _sState = 'stopped'

        stream.getTracks().forEach((t) => t.stop())
        _stream = null

        if (_timer) { clearInterval(_timer); _timer = null }
        notify()
      }

      recorder.onerror = () => {
        _sError = 'Aufnahme fehlgeschlagen'
        _sState = 'error'
        stream.getTracks().forEach((t) => t.stop())
        _stream = null
        notify()
      }

      recorder.start(1000)
      _startTime = Date.now()
      _sState = 'recording'
      _sDuration = 0
      notify()
      // iOS Safari: nach dem getUserMedia-Berechtigungsdialog kann der
      // erste notify() verloren gehen — nochmal nach einem Tick senden
      setTimeout(notify, 100)

      _timer = setInterval(() => {
        _sDuration = Math.floor((Date.now() - _startTime) / 1000)
        notify()
      }, 500)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        _sError = 'Mikrofonzugriff verweigert. Bitte erlaube den Zugriff in den Browser-Einstellungen.'
      } else if (err instanceof DOMException && err.name === 'NotFoundError') {
        _sError = 'Kein Mikrofon gefunden.'
      } else {
        _sError = 'Mikrofon konnte nicht aktiviert werden.'
      }
      _sState = 'error'
      notify()
    }
  }, [mimeType])

  const stopRecording = useCallback(() => {
    if (_recorder && _recorder.state === 'recording') {
      _recorder.stop()
    }
  }, [])

  const reset = useCallback(() => {
    if (_sBlobUrl) URL.revokeObjectURL(_sBlobUrl)
    cleanupStream()
    _sBlob = null
    _sBlobUrl = null
    _sDuration = 0
    _sError = null
    _sState = 'idle'
    notify()
  }, [])

  return {
    state: _sState,
    error: _sError,
    duration: _sDuration,
    blob: _sBlob,
    blobUrl: _sBlobUrl,
    fileExtension,
    startRecording,
    stopRecording,
    reset,
  }
}
