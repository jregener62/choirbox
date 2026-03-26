import { useState, useRef, useCallback, useEffect } from 'react'

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

export function useRecorder(): UseRecorderReturn {
  const [state, setState] = useState<RecorderState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)

  const { mimeType, extension: fileExtension } = getPreferredMimeType()

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
    }
  }, [])

  const startRecording = useCallback(async () => {
    try {
      setError(null)
      chunksRef.current = []

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const options: MediaRecorderOptions = {}
      if (mimeType) options.mimeType = mimeType

      const recorder = new MediaRecorder(stream, options)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const recorded = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeType || 'audio/webm',
        })
        setBlob(recorded)
        setBlobUrl(URL.createObjectURL(recorded))
        setState('stopped')

        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null

        if (timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
      }

      recorder.onerror = () => {
        setError('Aufnahme fehlgeschlagen')
        setState('error')
        stream.getTracks().forEach((t) => t.stop())
      }

      recorder.start(1000)
      startTimeRef.current = Date.now()
      setState('recording')
      setDuration(0)

      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000))
      }, 500)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError('Mikrofonzugriff verweigert. Bitte erlaube den Zugriff in den Browser-Einstellungen.')
      } else if (err instanceof DOMException && err.name === 'NotFoundError') {
        setError('Kein Mikrofon gefunden.')
      } else {
        setError('Mikrofon konnte nicht aktiviert werden.')
      }
      setState('error')
    }
  }, [mimeType])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  const reset = useCallback(() => {
    if (blobUrl) URL.revokeObjectURL(blobUrl)
    setBlob(null)
    setBlobUrl(null)
    setDuration(0)
    setError(null)
    setState('idle')
  }, [blobUrl])

  return {
    state, error, duration, blob, blobUrl,
    fileExtension, startRecording, stopRecording, reset,
  }
}
