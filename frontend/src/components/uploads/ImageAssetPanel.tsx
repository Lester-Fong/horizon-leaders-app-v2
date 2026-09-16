import { Image, Trash2, Upload } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'

import { ApiError, type ImageAsset } from '../../lib/api'
import { Button } from '../ui/Button'
import { FeedbackBanner } from '../ui/Feedback'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

interface ImageAssetPanelProps {
  alt: string
  canManage: boolean
  description: string
  initials: string
  load(): Promise<ImageAsset>
  onRemove(): Promise<ImageAsset>
  onUpload(file: File): Promise<ImageAsset>
  title: string
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message
  return 'The image could not be updated. Please try again.'
}

export function ImageAssetPanel({
  alt,
  canManage,
  description,
  initials,
  load,
  onRemove,
  onUpload,
  title,
}: ImageAssetPanelProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void load()
      .then((asset) => {
        if (active) setImageUrl(asset.imageUrl)
      })
      .catch((caught) => {
        if (active) setError(errorMessage(caught))
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => { active = false }
  }, [load])

  function selectFile(file: File | undefined) {
    setError(null)
    setNotice(null)
    if (!file) {
      setSelectedFile(null)
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setSelectedFile(null)
      if (inputRef.current) inputRef.current.value = ''
      setError('Images must be 5 MB or smaller.')
      return
    }
    setSelectedFile(file)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedFile) {
      setError('Choose a JPEG, PNG, or WebP image first.')
      return
    }
    setIsSaving(true)
    setError(null)
    setNotice(null)
    try {
      const asset = await onUpload(selectedFile)
      setImageUrl(asset.imageUrl)
      setSelectedFile(null)
      if (inputRef.current) inputRef.current.value = ''
      setNotice(imageUrl ? 'Image changed.' : 'Image uploaded.')
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setIsSaving(false)
    }
  }

  async function remove() {
    setIsSaving(true)
    setError(null)
    setNotice(null)
    try {
      await onRemove()
      setImageUrl(null)
      setNotice('Image removed.')
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="border-y border-line py-5" aria-labelledby={`${inputId}-title`}>
      <div className="grid gap-5 sm:grid-cols-[8rem_minmax(0,1fr)]">
        <div className="flex aspect-square w-32 items-center justify-center overflow-hidden rounded-card border border-line bg-surface-subtle">
          {imageUrl ? (
            <img
              alt={alt}
              className="size-full object-cover"
              src={imageUrl}
              onError={() => setImageUrl(null)}
            />
          ) : (
            <span className="font-mono text-lg font-semibold uppercase tracking-wider text-muted" aria-label={`${alt} placeholder`}>
              {isLoading ? <Image aria-hidden="true" className="size-5" /> : initials.slice(0, 3)}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="hm-label">Optional image</p>
          <h3 id={`${inputId}-title`} className="mt-1.5 text-base font-semibold text-ink">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
          {error && <FeedbackBanner className="mt-4" tone="error">{error}</FeedbackBanner>}
          {notice && <FeedbackBanner className="mt-4" tone="success">{notice}</FeedbackBanner>}
          {canManage && (
            <form className="mt-4 space-y-3" onSubmit={submit}>
              <div>
                <label className="hm-label" htmlFor={inputId}>Choose image</label>
                <input
                  ref={inputRef}
                  id={inputId}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={isSaving}
                  className="mt-2 block min-h-11 w-full rounded-input border border-line-strong bg-surface px-3 py-2 text-sm text-ink file:mr-3 file:rounded-control file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  onChange={(event) => selectFile(event.target.files?.[0])}
                />
                <p className="mt-2 text-xs leading-5 text-muted">JPEG, PNG, or WebP. Maximum input size 5 MB.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" size="sm" isLoading={isSaving} disabled={!selectedFile}>
                  <Upload aria-hidden="true" className="size-4" />
                  {imageUrl ? 'Change image' : 'Upload image'}
                </Button>
                {imageUrl && (
                  <Button type="button" size="sm" variant="ghost" isLoading={isSaving} onClick={() => void remove()}>
                    <Trash2 aria-hidden="true" className="size-4" />
                    Remove image
                  </Button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}
