# Release notes

## 1.0.2 (build 3), 25 Oct 2026

- **Organizer app: check-in shows events that have already started.** Before
  this, Check-In said "No live events" from the moment an event's start time
  passed, which is when the gate needs to scan. It now lists every
  published event, including ones in progress or just finished, and opens on
  today's (or the next) event.
- The Inveon Events app has no changes. Its version moves to 1.0.2 so both
  apps share one release.

## 1.0.1 (build 2), 25 Oct 2026

- **Online payment works on any install.** The Inveon Events app now
  takes payment on Cashfree's secure checkout page in a browser tab. Before
  this, Cashfree's in-app SDK refused installs that didn't come from the
  Play Store, showing "… is not a trusted source".
- **Online payment only in the app.** The "Pay cash to the organizer"
  option is removed from the app. It is still available on the website.
- The Inveon Organizer app has no changes. Its version moves to 1.0.1 so
  both apps share one release.

## 1.0.0 (build 1), 25 Oct 2026

The first release of the two Inveon mobile apps. Both use the same server
as the website, so accounts, bookings, payments and check-ins are shared
with the web.

### Inveon Events (attendees), `com.inveontechnologies.events`

- Animated splash screen and a three-slide welcome tour.
- Home with search, trending events and featured organizers.
- Explore events with filters, and event pages with a hero image, schedule,
  ticket types and FAQs.
- Book and pay in the app: UPI, cards and net banking through Cashfree, or
  pay cash at the venue. Seat counts update live, and a confetti
  confirmation appears when the booking goes through.
- Sign in with your Booking ID, mobile number or email and a 6-digit code,
  the same way as on the website.
- My Tickets: every ticket as a QR pass, ready to show at the gate.
- Notifications for booking confirmed, booking cancelled, event cancelled,
  and a reminder 3 hours before the event.

### Inveon Organizer (organizers, staff, gate volunteers), `com.inveontechnologies.organizer`

- Sign in with your organizer portal email and password.
- Dashboard with animated stats and the last 30 days of bookings.
- Events with ticket-sales progress.
- Bookings with search and filters, plus one-tap call or WhatsApp to the
  attendee.
- Live QR check-in: camera scanner with torch, a green or red result flash
  with vibration, manual entry, live counts, and swipe to undo.
- Gate volunteers see only Check-In, so they can't reach bookings or revenue.
- Notifications for new bookings and cancellations.
- Creating and editing events stays on the web portal, and the app links
  to it.

### Both apps

- In-app notification inbox and bell. A push that arrives while the app is
  open slides in as a banner.
- "Update available" prompt. Each app checks the latest version set in
  super admin → Mobile apps and offers a "What's new" sheet. Raising the
  minimum version there makes the update compulsory.

### Admin and server

- New super admin page **Mobile apps**, where you set the latest and minimum
  versions, the "What's new" text and the store links. A button there pushes
  "update available" to devices on older versions.
- New Firebase settings under super admin → Integrations → Push
  notifications.

### Known limitations of this build

- **Push notifications are off** until the Firebase setup in
  `apps/mobile/README.md` is done and the apps are rebuilt with
  `google-services.json`. The in-app inbox and update prompt work without it.
- The APKs are **signed with a debug key**. They install fine by sideloading,
  but they can't go to the Play Store. Publishing needs a release keystore.
  Uninstall these builds before installing a Play Store build, because the
  signatures differ.
- Android 7.0 or newer is required.
- No iOS build yet. That needs a Mac with Xcode and an Apple developer account.
