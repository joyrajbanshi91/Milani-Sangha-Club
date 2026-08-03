import { zodResolver } from '@hookform/resolvers/zod'
import { Clock, ExternalLink, Mail, MapPin, MessageSquare, Phone, Send } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { PageHero } from '@/components/layout/PageHero'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Reveal } from '@/components/ui/Reveal'
import { Section } from '@/components/ui/Section'
import { club, contact } from '@/content/site'
import { cn } from '@/lib/cn'
import { fieldBorder } from '@/lib/formStyles'
import { hueByIndex } from '@/lib/hues'

const enquirySchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name'),
  email: z.email('Please enter a valid email address'),
  phone: z.string().trim().max(20, 'That phone number looks too long').optional(),
  subject: z.string().min(1, 'Please choose a subject'),
  message: z
    .string()
    .trim()
    .min(20, 'Please give us a little more detail — at least 20 characters')
    .max(2000, 'Please keep the message under 2000 characters'),
})

type EnquiryForm = z.infer<typeof enquirySchema>

export function ContactPage() {
  const [sent, setSent] = useState(false)
  const clubEmail = club.contact.email

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EnquiryForm>({
    resolver: zodResolver(enquirySchema),
    defaultValues: { name: '', email: '', phone: '', subject: '', message: '' },
  })

  /**
   * Hands the message to the visitor's own email application.
   *
   * Deliberately not a silent POST: there is no enquiry endpoint yet, and a form
   * that appears to send while dropping the message is worse than no form. This
   * way the visitor keeps a copy in their sent items and can see it went. The
   * help-desk phase replaces this with a tracked ticket.
   */
  const onSubmit = (values: EnquiryForm) => {
    if (!clubEmail) return

    const body = [
      values.message,
      '',
      '—',
      `Name: ${values.name}`,
      `Email: ${values.email}`,
      values.phone ? `Phone: ${values.phone}` : null,
      `Sent from the ${club.name} website`,
    ]
      .filter((line) => line !== null)
      .join('\n')

    const url = `mailto:${clubEmail}?subject=${encodeURIComponent(
      `[Website] ${values.subject}`
    )}&body=${encodeURIComponent(body)}`

    window.location.assign(url)
    setSent(true)
  }

  return (
    <>
      <PageHero eyebrow={contact.eyebrow} title={contact.title} lead={contact.lead} />

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          {/* Details ----------------------------------------------------- */}
          <Reveal>
            <h2 className="font-display text-2xl text-ink-900">Club office</h2>

            <dl className="mt-6 space-y-5">
              <ContactRow icon={MapPin} label="Address" index={0}>
                {club.contact.addressLines.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
                <span className="block">
                  {club.contact.city}
                  {club.contact.state ? `, ${club.contact.state}` : ''} {club.contact.postcode}
                </span>
              </ContactRow>

              {club.contact.phone ? (
                <ContactRow icon={Phone} label="Telephone" index={1}>
                  <a
                    href={`tel:${club.contact.phone.replace(/\s+/g, '')}`}
                    className="hover:text-brand-800 hover:underline"
                  >
                    {club.contact.phone}
                  </a>
                </ContactRow>
              ) : null}

              {club.contact.whatsapp ? (
                <ContactRow icon={MessageSquare} label="WhatsApp" index={2}>
                  {club.contact.whatsapp}
                </ContactRow>
              ) : null}

              {clubEmail ? (
                <ContactRow icon={Mail} label="Email" index={3}>
                  <a href={`mailto:${clubEmail}`} className="break-all hover:text-brand-800 hover:underline">
                    {clubEmail}
                  </a>
                </ContactRow>
              ) : null}

              {club.contact.officeHours ? (
                <ContactRow icon={Clock} label="Office hours" index={4}>
                  {club.contact.officeHours}
                </ContactRow>
              ) : null}
            </dl>

            <MapPanel />
          </Reveal>

          {/* Form -------------------------------------------------------- */}
          <Reveal className="relative overflow-hidden rounded-card border border-brand-200 bg-white p-6 shadow-lift sm:p-8">
            <div
              className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-200/40 blur-3xl"
              aria-hidden="true"
            />
            <h2 className="font-display text-2xl text-ink-900">Send an enquiry</h2>

            {!clubEmail ? (
              <p className="mt-4 rounded-lg border border-accent-200 bg-accent-50 p-4 text-sm/relaxed text-accent-700">
                The club’s email address has not been set yet, so the form is disabled. Add
                <code className="mx-1 rounded bg-white/70 px-1">contact.email</code>
                in <code className="rounded bg-white/70 px-1">src/content/site.ts</code> to enable
                it.
              </p>
            ) : null}

            {sent ? (
              <p className="mt-4 rounded-lg border border-brand-200 bg-brand-50 p-4 text-sm/relaxed text-brand-900">
                Your email application should have opened with the message ready to send. If nothing
                happened, write to{' '}
                <a href={`mailto:${clubEmail}`} className="font-medium underline">
                  {clubEmail}
                </a>{' '}
                directly.
              </p>
            ) : null}

            <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5" noValidate>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field htmlFor="name" label="Your name" required error={errors.name?.message}>
                  <Input
                    id="name"
                    required
                    autoComplete="name"
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={errors.name ? 'name-error' : undefined}
                    className={fieldBorder(Boolean(errors.name))}
                    {...register('name')}
                  />
                </Field>

                <Field htmlFor="email" label="Email" required error={errors.email?.message}>
                  <Input
                    id="email"
                    type="email"
                    required
                    inputMode="email"
                    autoComplete="email"
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? 'email-error' : undefined}
                    className={fieldBorder(Boolean(errors.email))}
                    {...register('email')}
                  />
                </Field>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field htmlFor="phone" label="Phone" error={errors.phone?.message}>
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    aria-invalid={Boolean(errors.phone)}
                    aria-describedby={errors.phone ? 'phone-error' : undefined}
                    className={fieldBorder(Boolean(errors.phone))}
                    {...register('phone')}
                  />
                </Field>

                <Field htmlFor="subject" label="Subject" required error={errors.subject?.message}>
                  <Select
                    id="subject"
                    required
                    aria-invalid={Boolean(errors.subject)}
                    aria-describedby={errors.subject ? 'subject-error' : undefined}
                    className={fieldBorder(Boolean(errors.subject))}
                    {...register('subject')}
                  >
                    <option value="">Choose one…</option>
                    {contact.subjects.map((subject) => (
                      <option key={subject} value={subject}>
                        {subject}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Field
                htmlFor="message"
                label="Message"
                required
                error={errors.message?.message}
                hint="Please do not include payment card details or passwords."
              >
                <Textarea
                  id="message"
                  required
                  rows={6}
                  aria-invalid={Boolean(errors.message)}
                  aria-describedby={errors.message ? 'message-error' : 'message-hint'}
                  className={fieldBorder(Boolean(errors.message))}
                  {...register('message')}
                />
              </Field>

              <button
                type="submit"
                disabled={isSubmitting || !clubEmail}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand-700 to-brand-500 px-6 text-sm font-medium text-white shadow-glow transition-transform duration-300 hover:scale-[1.03] disabled:pointer-events-none disabled:opacity-50 disabled:hover:scale-100"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                Send enquiry
              </button>

              {contact.formNote ? (
                <p className="text-xs/relaxed text-ink-500">{contact.formNote}</p>
              ) : null}
            </form>
          </Reveal>
        </div>
      </Section>
    </>
  )
}

function ContactRow({
  icon: Icon,
  label,
  index = 0,
  children,
}: {
  icon: typeof MapPin
  label: string
  index?: number
  children: ReactNode
}) {
  const hue = hueByIndex(index)
  return (
    <div className="group flex gap-4">
      <span
        className={cn(
          'mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110',
          hue.tile
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div>
        <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">{label}</dt>
        <dd className="mt-1 text-sm/relaxed text-ink-700">{children}</dd>
      </div>
    </div>
  )
}

/**
 * Map panel.
 *
 * An embedded Google map is only rendered when the club has explicitly supplied
 * an embed URL, because embedding loads Google's scripts and cookies for every
 * visitor. Until then this shows a link out, which achieves the same thing
 * without making that choice on the club's behalf.
 */
function MapPanel() {
  const { embedUrl, directionsUrl } = club.map

  if (embedUrl) {
    return (
      <div className="mt-8 overflow-hidden rounded-card border border-ink-200 shadow-soft">
        <iframe
          src={embedUrl}
          title={`Map showing the location of ${club.name}`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="h-72 w-full border-0"
        />
      </div>
    )
  }

  return (
    <div className="mt-8 rounded-card border border-dashed border-ink-300 bg-ink-50 p-6">
      <h3 className="font-display text-lg text-ink-900">Finding the club</h3>
      <p className="mt-2 text-sm/relaxed text-ink-600">
        {directionsUrl
          ? 'Open the club’s location in Google Maps for directions.'
          : 'An interactive map appears here once the club adds its Google Maps link. Embedding is off by default because it loads Google’s cookies for every visitor.'}
      </p>
      {directionsUrl ? (
        <a
          href={directionsUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg border border-brand-200 bg-white px-4 text-sm font-medium text-brand-900 transition-colors hover:bg-brand-50"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Open in Google Maps
        </a>
      ) : null}
    </div>
  )
}
