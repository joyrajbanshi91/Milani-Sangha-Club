import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, Trash2, User } from 'lucide-react'
import { useRef, useState } from 'react'

import { ApiError, api } from '@/lib/api'

export interface MemberProfile {
  uid: string
  name: string
  photo: string | null
  photoUpdatedAt: string | null
}

/** Longest edge of the stored image. 512px covers every avatar the app shows. */
const MAX_EDGE = 512
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']

/**
 * Shrink and square the chosen file in the browser before uploading.
 *
 * A photograph straight from a phone is 3–6 MB; the app displays it at 96px. Left
 * as-is, every member would upload megabytes for no visible benefit and pay for it
 * on their data allowance. Cropped to a centre square so the avatar is not
 * distorted, and re-encoded as JPEG.
 *
 * This is a courtesy, not a control — the server validates type and size again.
 */
async function prepareImage(file: File): Promise<string> {
  if (!ALLOWED.includes(file.type)) {
    throw new Error('Please choose a JPEG, PNG or WebP image.')
  }

  const bitmap = await createImageBitmap(file)
  const edge = Math.min(bitmap.width, bitmap.height)
  const size = Math.min(edge, MAX_EDGE)

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size

  const context = canvas.getContext('2d')
  if (!context) throw new Error('Your browser could not process that image.')

  // Centre crop, then scale.
  context.drawImage(
    bitmap,
    (bitmap.width - edge) / 2,
    (bitmap.height - edge) / 2,
    edge,
    edge,
    0,
    0,
    size,
    size
  )
  bitmap.close()

  return canvas.toDataURL('image/jpeg', 0.85)
}

export function ProfilePhoto() {
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const profile = useQuery({
    queryKey: ['profile', 'me'],
    queryFn: () => api.get<{ profile: MemberProfile }>('/members/me').then((r) => r.profile),
  })

  const save = useMutation({
    mutationFn: (photo: string) =>
      api.put<{ profile: MemberProfile; message: string }>('/members/me/photo', { photo }),
    onSuccess: async (result) => {
      setMessage(result.message)
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['profile', 'me'] })
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'The picture could not be saved.')
    },
  })

  const remove = useMutation({
    mutationFn: () => api.delete<{ message: string }>('/members/me/photo'),
    onSuccess: async (result) => {
      setMessage(result.message)
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['profile', 'me'] })
    },
  })

  const choose = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setMessage(null)
    try {
      save.mutate(await prepareImage(file))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That image could not be used.')
    }
  }

  const photo = profile.data?.photo ?? null
  const busy = save.isPending || remove.isPending

  return (
    <section className="rounded-card border border-ink-200 bg-white p-5 shadow-soft">
      <h2 className="font-display text-lg text-ink-900">Profile picture</h2>
      <p className="mt-1 text-sm/relaxed text-ink-600">
        Shown on your membership card and in the club directory. Only you and the office bearers can
        see it.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-5">
        <div className="relative">
          {photo ? (
            <img
              src={photo}
              alt="Your profile picture"
              className="h-24 w-24 rounded-full object-cover ring-4 ring-brand-100"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-ink-100 ring-4 ring-ink-50">
              <User className="h-9 w-9 text-ink-400" aria-hidden="true" />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => void choose(event.target.files?.[0])}
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-brand-800 px-4 text-sm font-medium text-white disabled:opacity-60"
            >
              <Camera className="h-4 w-4" aria-hidden="true" />
              {busy ? 'Saving…' : photo ? 'Change picture' : 'Add a picture'}
            </button>

            {photo ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => remove.mutate()}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-ink-200 px-4 text-sm font-medium text-ink-700 disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Remove
              </button>
            ) : null}
          </div>

          <p className="text-xs text-ink-500">
            JPEG, PNG or WebP. Large photographs are resized and cropped square in your browser
            before upload, so it does not use your data allowance.
          </p>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {message && !error ? (
        <p role="status" className="mt-4 rounded-lg bg-brand-50 p-3 text-sm text-brand-900">
          {message}
        </p>
      ) : null}
    </section>
  )
}
