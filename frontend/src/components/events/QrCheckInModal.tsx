import { Camera, Keyboard, QrCode, Square } from 'lucide-react'
import QrScanner from 'qr-scanner'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from 'react'

import type { SundayQrCheckInResult } from '../../lib/api'
import { Button } from '../ui/Button'
import { FeedbackBanner } from '../ui/Feedback'
import { FormField, TextInput } from '../ui/FormControls'
import { Modal } from '../ui/Modal'

const SAME_QR_COOLDOWN_MS = 1_800

type CheckInMode = 'camera' | 'input'
type CameraState = 'idle' | 'starting' | 'active'

interface QrCheckInModalProps {
  checkIn(qrToken: string): Promise<SundayQrCheckInResult>
  onClose(): void
  onRecorded(message: string): void
  returnFocusRef?: RefObject<HTMLElement | null>
}

interface ScanFeedback {
  message: string
  tone: 'info' | 'success'
}

function cameraErrorMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : ''
  const text = error instanceof Error ? error.message : String(error)

  if (name === 'NotAllowedError' || /permission|denied/i.test(text)) {
    return 'Camera permission was denied. Allow camera access in your browser settings, or use Scanner input.'
  }
  if (
    name === 'NotFoundError' ||
    name === 'OverconstrainedError' ||
    /no camera|not found|device/i.test(text)
  ) {
    return 'No compatible camera was found. Connect a camera or use Scanner input.'
  }
  if (name === 'NotReadableError' || /could not start|in use/i.test(text)) {
    return 'The camera could not start. Close other apps using it, then try again or use Scanner input.'
  }

  return 'The camera could not start. Check browser permission and use Scanner input if camera access is unavailable.'
}

export function QrCheckInModal({
  checkIn,
  onClose,
  onRecorded,
  returnFocusRef,
}: QrCheckInModalProps) {
  const [mode, setMode] = useState<CheckInMode>('camera')
  const [cameraState, setCameraState] = useState<CameraState>('idle')
  const [inputValue, setInputValue] = useState('')
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const scannerRef = useRef<QrScanner | null>(null)
  const mountedRef = useRef(true)
  const cameraOperationRef = useRef(0)
  const requestInFlightRef = useRef(false)
  const lastScanRef = useRef<{ completedAt: number; token: string } | null>(null)

  const stopCamera = useCallback((updateState = true) => {
    cameraOperationRef.current += 1
    const scanner = scannerRef.current
    scannerRef.current = null
    scanner?.destroy()

    const stream = videoRef.current?.srcObject
    if (typeof MediaStream !== 'undefined' && stream instanceof MediaStream) {
      for (const track of stream.getTracks()) track.stop()
    }
    if (videoRef.current) videoRef.current.srcObject = null
    if (updateState && mountedRef.current) setCameraState('idle')
  }, [])

  const submitQrToken = useCallback(
    async (rawToken: string, source: CheckInMode) => {
      if (!rawToken.trim()) {
        setError('Scan or enter a Member QR code.')
        return
      }
      const qrToken = source === 'camera' ? rawToken : rawToken.trim()

      const lastScan = lastScanRef.current
      if (
        source === 'camera' &&
        lastScan?.token === qrToken &&
        performance.now() - lastScan.completedAt < SAME_QR_COOLDOWN_MS
      ) {
        return
      }
      if (requestInFlightRef.current) return

      requestInFlightRef.current = true
      setBusy(true)
      setError(null)
      try {
        const result = await checkIn(qrToken)
        const name = `${result.member.firstName} ${result.member.lastName}`
        const text = `${name}: ${
          result.result === 'recorded' ? 'check-in recorded' : 'already present'
        }.`
        setFeedback({
          message: text,
          tone: result.result === 'recorded' ? 'success' : 'info',
        })
        onRecorded(text)
      } catch (caught) {
        setFeedback(null)
        setError(
          caught instanceof Error
            ? caught.message
            : 'This QR code could not be checked in.',
        )
      } finally {
        lastScanRef.current = {
          completedAt: performance.now(),
          token: qrToken,
        }
        requestInFlightRef.current = false
        if (mountedRef.current) setBusy(false)
      }
    },
    [checkIn, onRecorded],
  )

  const startCamera = useCallback(async () => {
    setError(null)
    setFeedback(null)

    if (!window.isSecureContext) {
      setError(
        'Camera access requires HTTPS (or localhost). Use Scanner input on an insecure connection.',
      )
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        'This browser does not support camera access. Use Scanner input instead.',
      )
      return
    }
    if (!videoRef.current) return

    stopCamera(false)
    const operation = cameraOperationRef.current
    setCameraState('starting')
    const scanner = new QrScanner(
      videoRef.current,
      (result) => void submitQrToken(result.data, 'camera'),
      {
        highlightCodeOutline: true,
        highlightScanRegion: true,
        maxScansPerSecond: 8,
        preferredCamera: 'environment',
        returnDetailedScanResult: true,
      },
    )
    scannerRef.current = scanner

    try {
      await scanner.start()
      if (
        !mountedRef.current ||
        cameraOperationRef.current !== operation ||
        scannerRef.current !== scanner
      ) {
        scanner.destroy()
        return
      }
      setCameraState('active')
    } catch (caught) {
      if (scannerRef.current === scanner) scannerRef.current = null
      scanner.destroy()
      if (mountedRef.current && cameraOperationRef.current === operation) {
        setCameraState('idle')
        setError(cameraErrorMessage(caught))
      }
    }
  }, [stopCamera, submitQrToken])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stopCamera(false)
    }
  }, [stopCamera])

  function selectMode(nextMode: CheckInMode) {
    if (nextMode === mode) return
    if (nextMode === 'input') stopCamera()
    setMode(nextMode)
    setError(null)
    setFeedback(null)
  }

  function closeModal() {
    stopCamera()
    onClose()
  }

  async function submitInput(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const submittedValue = inputValue
    setInputValue('')
    await submitQrToken(submittedValue, 'input')
    window.setTimeout(() => document.getElementById('qr-token')?.focus(), 0)
  }

  return (
    <Modal
      className="max-w-2xl"
      description="Use the camera or a connected scanner. The opened Sunday Service and server authorization determine eligibility."
      isOpen
      onClose={closeModal}
      preventClose={busy}
      returnFocusRef={returnFocusRef}
      title="QR check-in"
    >
      <div
        aria-label="QR check-in method"
        className="grid grid-cols-2 border-b border-line"
        role="group"
      >
        <button
          aria-pressed={mode === 'camera'}
          className={`min-h-11 border-b-2 px-3 text-sm font-semibold transition-colors ${
            mode === 'camera'
              ? 'border-ink text-ink'
              : 'border-transparent text-muted hover:text-ink'
          }`}
          data-modal-autofocus
          onClick={() => selectMode('camera')}
          type="button"
        >
          <Camera aria-hidden="true" className="mr-2 inline size-4" />
          Camera
        </button>
        <button
          aria-pressed={mode === 'input'}
          className={`min-h-11 border-b-2 px-3 text-sm font-semibold transition-colors ${
            mode === 'input'
              ? 'border-ink text-ink'
              : 'border-transparent text-muted hover:text-ink'
          }`}
          onClick={() => selectMode('input')}
          type="button"
        >
          <Keyboard aria-hidden="true" className="mr-2 inline size-4" />
          Scanner input
        </button>
      </div>

      {feedback && (
        <FeedbackBanner className="mt-5" tone={feedback.tone}>
          {feedback.message}
        </FeedbackBanner>
      )}
      {error && (
        <FeedbackBanner className="mt-5" tone="error">
          {error}
        </FeedbackBanner>
      )}

      {mode === 'camera' ? (
        <div
          aria-label="Camera QR scanning"
          className="mt-5"
          id="qr-camera-panel"
          role="region"
        >
          <p className="text-sm leading-6 text-muted">
            Point the camera at a Member QR code. The camera stays ready for the
            next Member after each response.
          </p>
          <div className="relative mt-4 aspect-square max-h-[48dvh] min-h-56 w-full overflow-hidden rounded-card border border-line-strong bg-near-ink sm:aspect-[4/3]">
            <video
              aria-label="Member QR camera preview"
              autoPlay
              className="size-full object-cover"
              muted
              playsInline
              ref={videoRef}
            />
            {cameraState !== 'active' && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center bg-near-ink text-center text-canvas">
                <div className="max-w-xs px-6">
                  <Camera aria-hidden="true" className="mx-auto size-8" />
                  <p className="mt-3 text-sm font-semibold">
                    {cameraState === 'starting'
                      ? 'Starting camera…'
                      : 'Camera is off'}
                  </p>
                </div>
              </div>
            )}
            {cameraState === 'active' && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-[12%] rounded-card border border-canvas/80"
              />
            )}
          </div>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            {cameraState === 'active' ? (
              <Button onClick={() => stopCamera()} variant="secondary">
                <Square aria-hidden="true" className="size-3.5 fill-current" />
                Stop camera
              </Button>
            ) : (
              <Button
                isLoading={cameraState === 'starting'}
                onClick={() => void startCamera()}
              >
                <Camera aria-hidden="true" className="size-4" />
                Start camera
              </Button>
            )}
            <Button onClick={() => selectMode('input')} variant="ghost">
              Use Scanner input
            </Button>
          </div>
          <p className="mt-4 font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-muted">
            Camera access requires HTTPS or localhost
          </p>
        </div>
      ) : (
        <form
          aria-label="Connected scanner input"
          className="mt-5"
          id="qr-input-panel"
          onSubmit={(event) => void submitInput(event)}
        >
          <p className="mb-5 text-sm leading-6 text-muted">
            Scan with a USB or Bluetooth reader, or enter the attendance QR
            value. Press Enter to submit.
          </p>
          <FormField id="qr-token" label="Member QR token" required>
            <TextInput
              autoComplete="off"
              id="qr-token"
              onChange={(event) => setInputValue(event.target.value)}
              value={inputValue}
            />
          </FormField>
          <Button className="mt-5" isLoading={busy} type="submit">
            <QrCode aria-hidden="true" className="size-4" />
            Check in
          </Button>
        </form>
      )}

      <div className="mt-6 flex justify-end border-t border-line pt-5">
        <Button disabled={busy} onClick={closeModal} variant="secondary">
          Done
        </Button>
      </div>
    </Modal>
  )
}
