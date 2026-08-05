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
import { contactApi } from '@/features/contact/api'
import { ApiError } from '@/lib/api'
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
  const [problem, setProblem] = useState<string | null>(null)
  const clubEmail = club.contact.email

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EnquiryForm>({
    resolver: zodResolver(enquirySchema),
    defaultValues: { name: '', email: '', phone: '', subject: '', message: '' },
  })

  /**
   * Sends the enquiry to the club's server, which emails it on.
   *
   * It used to build a `mailto:` link and hand the message to the visitor's own email
   * application. That looks like a reasonable trade — no credentials, and the sender
   * keeps a copy in their sent items — and it fails on any machine with no mail client
   * set up, which is most of them now. The club found exactly that: pressing the button
   * switched to another window and nothing happened. A form that silently does nothing
   * is worse than no form, because the visitor believes they have written to the club.
   *
   * The failure path matters as much as the happy one. If the server cannot send — no
   * mail configured, or the mail host refusing — the message must not evaporate: the
   * error says so in plain words and the club's address is offered so the visitor can
   * write it themselves. Never "something went wrong".
   */
  const onSubmit = async (values: EnquiryForm) => {
    setProblem(null)

    try {
      await contactApi.send({
        name: values.name,
        email: values.email,
        subject: values.subject,
        message: values.message,
        ...(values.phone?.trim() ? { phone: values.phone.trim() } : {}),
      })

      setSent(true)
      reset()
    } catch (error) {
      setProblem(
        error instanceof ApiError
          ? error.message
          : 'Your message could not be sent just now, and nothing has reached the club. ' +
              'Please write to the address on this page instead.'
      )
    }
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
              <p
                role="status"
                className="mt-4 rounded-lg border border-brand-200 bg-brand-50 p-4 text-sm/relaxed text-brand-900"
              >
                <strong>Thank you — your message has been sent to the club.</strong> Somebody will
                reply to the address you gave. Nothing further is needed from you.
              </p>
            ) : null}

            {/*
              A failure has to leave the visitor holding something.

              They have typed a message and pressed a button; if the server could not
              send it, the one thing they must not be given is a shrug. The server's own
              words say what happened and that nothing reached the club, and the address
              is repeated here so the enquiry is not lost.
            */}
            {problem ? (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm/relaxed text-red-800"
              >
                {problem}
                {clubEmail ? (
                  <>
                    {' '}
                    <a href={`mailto:${clubEmail}`} className="font-medium underline">
                      {clubEmail}
                    </a>
                  </>
                ) : null}
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
                {isSubmitting ? 'Sending…' : 'Send enquiry'}
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
