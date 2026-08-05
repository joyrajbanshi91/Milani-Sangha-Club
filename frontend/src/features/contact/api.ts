import { api } from '@/lib/api'

/**
 * The public contact form.
 *
 * The only call in this application that needs no signed-in user — a visitor writing to
 * the club has no account and should not need one.
 *
 * There is deliberately no `to` field. The address enquiries reach is set on the server
 * (`CONTACT_TO`), because a form that carries its own recipient is an open mail relay
 * and automated scanners find those within days of a site going live.
 */
export interface Enquiry {
  name: string
  email: string
  phone?: string
  subject: string
  message: string
}

export const contactApi = {
  /**
   * `anonymous` on purpose: a visitor has no session, and asking for one would make
   * the call wait on — or fail inside — the auth layer before it ever reached the club.
   */
  send: (enquiry: Enquiry) =>
    api.post<{ message: string }>('/contact', enquiry, { anonymous: true }),
}
