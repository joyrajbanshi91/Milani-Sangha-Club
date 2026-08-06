import { ENQUIRY_ROLES, type EnquiryStatus, type Role } from '@/config/constants'
import { api } from '@/lib/api'

/**
 * The club's enquiries, as the office sees them.
 *
 * Every call here is refused by the server to anybody who is not the secretary or the
 * president. The guard below only decides what to draw — it is not the boundary.
 */
export interface Enquiry {
  id: string
  reference: string
  status: EnquiryStatus

  name: string
  email: string
  phone?: string
  subject: string
  message: string

  receivedAt: string

  resolvedAt?: string
  resolvedBy?: string
  resolvedByName?: string
  resolutionNote?: string
}

export interface EnquiryList {
  enquiries: Enquiry[]
  counts: { new: number; resolved: number }
}

/** May this person read the club's enquiries? Mirrors ENQUIRY_ROLES on the server. */
export function canReadEnquiries(role: Role | undefined): boolean {
  return role !== undefined && ENQUIRY_ROLES.includes(role)
}

export const enquiriesApi = {
  list: (status: EnquiryStatus | 'all' = 'all') =>
    api.get<EnquiryList>(`/enquiries?status=${status}`),

  resolve: (id: string, note?: string) =>
    api.post<{ enquiry: Enquiry; message: string }>(
      `/enquiries/${id}/resolve`,
      note ? { note } : {}
    ),

  reopen: (id: string) =>
    api.post<{ enquiry: Enquiry; message: string }>(`/enquiries/${id}/reopen`, {}),

  remove: (id: string) => api.delete<{ message: string }>(`/enquiries/${id}`),
}
