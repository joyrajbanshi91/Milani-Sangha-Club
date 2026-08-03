# Club Management Platform – Software Requirements Specification (SRS)

## 1. Vision

Build a production-ready Progressive Web App (PWA) for a club that manages members, payments, events, gallery, communications, reports, and administration. The system should be modular, secure, scalable to at least 10,000 members, and easy for non-technical administrators.

---

# 2. Technology Stack

## Frontend
- React (Vite)
- TypeScript
- Tailwind CSS
- React Router
- React Hook Form
- TanStack Query

## Backend
- Node.js
- Express.js

## Database
- Firebase Firestore

## Authentication
- Firebase Authentication

## Storage
- Firebase Storage

## Hosting
- Firebase Hosting

## Other
- pdf-lib (PDF receipts/cards)
- Nodemailer (emails)
- Recharts (analytics)
- Lucide Icons
- PWA support
- GitHub Actions (CI/CD)

---

# 3. User Roles

- Visitor
- Member
- Volunteer
- Secretary
- Treasurer
- President
- Administrator

Role-based permissions are mandatory.

---

# 4. Public Website

- Home
- About
- Mission & Vision
- History
- Executive Committee
- Membership
- Events
- Gallery
- News
- Documents
- Contact
- Google Map
- Sponsors
- Testimonials

---

# 5. Member Portal

Members can:

- Login using email/mobile
- View profile
- Update profile (approval workflow)
- Download membership card
- View payment history
- Download receipts
- Renew membership
- Register for events
- View notifications
- Download documents
- Raise support tickets
- View membership validity

---

# 6. Admin Portal

Modules:

- Dashboard
- Member Management
- Applications
- Payments
- Receipts
- Events
- Gallery
- News
- Documents
- Committee
- Reports
- Notifications
- Finance
- Help Desk
- Audit Logs
- Settings

---

# 7. Membership

Support:

- Student
- Regular
- Family
- Senior
- Life
- Corporate
- Honorary
- Associate

Generate Member Number:

CLB-YYYY-000001

---

# 8. Membership Payment (Manual Verification)

Workflow:

1. Member clicks Renew.
2. System generates Reference Number.
3. Display club UPI QR and UPI ID.
4. Member pays using any UPI app.
5. Member enters UPI Transaction ID.
6. Payment becomes Pending Verification.
7. Treasurer verifies against bank/UPI records.
8. Treasurer approves or rejects.
9. On approval:
   - Membership activated
   - Receipt generated
   - Email sent
   - History updated

Never generate receipts before approval.

---

# 9. Receipt

Receipt includes:

- Receipt Number
- Member Name
- Membership Number
- Amount
- Reference Number
- UPI Transaction ID
- Approval Date
- QR verification
- Club logo

Receipt numbers:

RCT-YYYY-000001

---

# 10. Event Management

- Create/Edit/Delete
- Registration
- Capacity
- Waiting List
- Attendance
- Certificates
- Gallery

---

# 11. Gallery

- Albums
- Images
- Videos
- Search
- Filters
- Lightbox
- Compression

---

# 12. News & Notices

- Publish
- Schedule
- Pin
- Categories

---

# 13. Documents

- Constitution
- Circulars
- Minutes
- Reports
- Policies

---

# 14. Help Desk

Ticket Types:

- Membership
- Payment
- Event
- Complaint
- Suggestion
- Technical

Status:

Open
Pending
Resolved
Closed

---

# 15. Finance

- Membership Fees
- Donations
- Income
- Expenses
- Ledger
- Cashbook
- Reports
- Annual Summary

---

# 16. Notifications

- Email
- In-app
- Push Notifications (PWA)

Automatic reminders:

30, 15, 7 and 1 day before membership expiry.

---

# 17. Reports

Export:

- PDF
- Excel
- CSV

Analytics:

- Members
- Revenue
- Renewals
- Attendance
- Events
- Donations

---

# 18. Search

Global search across:

- Members
- Events
- Payments
- Receipts
- Documents
- Tickets

---

# 19. Security

- Firebase Security Rules
- Role-based access
- Input validation
- Rate limiting
- Audit logs
- Secure file upload
- Environment variables

---

# 20. Progressive Web App

- Installable
- Offline cache
- Home screen icon
- Splash screen
- Background sync
- Responsive
- Push notifications

---

# 21. Database Collections

- users
- members
- applications
- payments
- receipts
- events
- registrations
- attendance
- gallery
- news
- documents
- tickets
- notifications
- audit_logs
- settings
- finance

---

# 22. Folder Structure

frontend/
backend/
firebase/
docs/
scripts/

---

# 23. Testing

- Unit
- Integration
- End-to-end
- Security
- Performance

---

# 24. Deployment

- Firebase Hosting
- Firestore
- Storage
- Authentication

Provide deployment documentation.

---

# 25. Future AI Roadmap

- AI chatbot
- Event poster generator
- Meeting summary
- Smart search
- Member analytics
- Renewal prediction
- Email drafting

---

# 26. Development Phases

1. Project setup
2. Database
3. Authentication
4. Public website
5. Admin
6. Member portal
7. Payment
8. Receipt
9. Events
10. Gallery
11. Finance
12. Reports
13. Notifications
14. PWA
15. Testing
16. Deployment

Claude Code should complete one phase at a time, explain the implementation, and wait for approval before continuing.
