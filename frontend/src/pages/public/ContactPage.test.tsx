import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ContactPage } from '@/pages/public/ContactPage'

/**
 * The contact form.
 *
 * It used to build a `mailto:` link and hand the message to the visitor's own email
 * application. On a machine with no mail client configured — most machines — pressing
 * **Send enquiry** did nothing visible, which is how the club found it: "it just changes
 * the window and nothing happens".
 *
 * So the two things worth testing are that a submission actually **goes somewhere**, and
 * that a failure **says so**. A form that reports success it did not get is the original
 * bug wearing a smile.
 */

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

function json(body: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ContactPage />
    </MemoryRouter>
  )
}

/** Fill the form the way a visitor would. */
async function fillIn() {
  await userEvent.type(screen.getByLabelText(/your name/i), 'Bristi Ghosh')
  await userEvent.type(screen.getByLabelText(/^email/i), 'bristi@example.org')
  await userEvent.selectOptions(
    screen.getByLabelText(/subject/i),
    (screen.getByLabelText(/subject/i) as HTMLSelectElement).options[1]!.value
  )
  await userEvent.type(
    screen.getByLabelText(/message/i),
    'I live on Station Road and would like to know how to become a member.'
  )
}

beforeEach(() => {
  fetchMock.mockReset()
})

describe('sending an enquiry', () => {
  it('posts it to the club rather than opening a mail application', async () => {
    fetchMock.mockResolvedValue(json({ message: 'Thank you — your message has been sent.' }, 201))

    renderPage()
    await fillIn()
    await userEvent.click(screen.getByRole('button', { name: /send enquiry/i }))

    const [url, init] = await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
      return fetchMock.mock.calls[0] as [string, RequestInit]
    })

    expect(String(url)).toContain('/contact')
    expect(init.method).toBe('POST')

    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(body).toMatchObject({ name: 'Bristi Ghosh', email: 'bristi@example.org' })
    expect(String(body.message)).toContain('Station Road')

    // The recipient is the server's business. A form that carries its own `to` is an
    // open mail relay.
    expect(body).not.toHaveProperty('to')
    expect(body).not.toHaveProperty('website')
  })

  it('confirms it in the club’s own words, and empties the form', async () => {
    fetchMock.mockResolvedValue(json({ message: 'Thank you.' }, 201))

    renderPage()
    await fillIn()
    await userEvent.click(screen.getByRole('button', { name: /send enquiry/i }))

    expect(await screen.findByRole('status')).toHaveTextContent(/has been sent to the club/i)
    // Emptied, so a second press cannot send the same message twice.
    expect(screen.getByLabelText(/your name/i)).toHaveValue('')
  })
})

describe('when it cannot be sent', () => {
  it('says so in the server’s words and never claims success', async () => {
    fetchMock.mockResolvedValue(
      json(
        {
          error: {
            code: 'mail_not_configured',
            message:
              'The club’s website cannot send email yet. Please write to the address on this page instead — your message has not been sent.',
          },
        },
        503
      )
    )

    renderPage()
    await fillIn()
    await userEvent.click(screen.getByRole('button', { name: /send enquiry/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/has not been sent/i)
    // And the club's address beside it, so the enquiry is not lost.
    expect(alert.querySelector('a[href^="mailto:"]')).not.toBeNull()

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('says so when the network fails outright', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    renderPage()
    await fillIn()
    await userEvent.click(screen.getByRole('button', { name: /send enquiry/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/nothing has reached the club/i)
  })
})
