import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

import { Download, QrCode } from 'lucide-react'

import { Button } from '../ui/Button'
import { memberQrFilename } from './member-qr'

interface MemberQrPanelProps {
  firstName: string
  lastName: string
  qrToken: string
}

export function MemberQrPanel({ firstName, lastName, qrToken }: MemberQrPanelProps) {
  const [qr, setQr] = useState<{ token: string; imageUrl: string } | null>(null)
  const [errorToken, setErrorToken] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void QRCode.toDataURL(qrToken, {
      errorCorrectionLevel: 'M',
      margin: 4,
      width: 280,
      color: { dark: '#0a0a0a', light: '#ffffff' },
    }).then((url) => {
      if (active) setQr({ token: qrToken, imageUrl: url })
    }).catch(() => {
      if (active) setErrorToken(qrToken)
    })
    return () => { active = false }
  }, [qrToken])

  return (
    <section
      aria-labelledby="member-qr-title"
      className="mt-6 border-y border-line py-5"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="hm-label">Member QR</p>
          <h3 id="member-qr-title" className="mt-1.5 text-base font-medium text-ink">
            Permanent attendance QR
          </h3>
          <p className="mt-1 text-sm leading-6 text-muted">
            Scan this code for the existing Sunday Service attendance check-in.
          </p>
        </div>
        {qr?.token === qrToken && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              const link = document.createElement('a')
              link.href = qr.imageUrl
              link.download = memberQrFilename(firstName, lastName)
              document.body.append(link)
              link.click()
              link.remove()
            }}
          >
            <Download aria-hidden="true" className="size-4" />
            Download QR
          </Button>
        )}
      </div>
      <div className="mt-5 flex min-h-56 items-center justify-center rounded-control border border-line bg-white p-4 sm:w-72">
        {qr?.token === qrToken ? (
          <img
            alt={`Permanent attendance QR for ${firstName} ${lastName}`}
            className="block size-56 max-w-full"
            src={qr.imageUrl}
          />
        ) : errorToken === qrToken ? (
          <p className="flex items-center gap-2 text-sm text-muted" role="status">
            <QrCode aria-hidden="true" className="size-4" />
            QR code unavailable. Try opening the details again.
          </p>
        ) : (
          <p className="font-mono text-xs uppercase tracking-wider text-muted" role="status">
            Preparing QR code...
          </p>
        )}
      </div>
    </section>
  )
}
