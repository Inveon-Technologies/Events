# Inveon Events mobile apps (Flutter)

Two apps, one shared package:

| Folder | App | For |
|---|---|---|
| `customer_app/` | **Inveon Events** (`in.inveontechnologies.inveon_events`) | Attendees: discover events, book and pay, QR passes, booking notifications |
| `organizer_app/` | **Inveon Organizer** (`in.inveontechnologies.inveon_organizer`) | Organizers, staff and gate volunteers: dashboard, events, bookings, QR check-in |
| `packages/inveon_core/` | shared | Design system (Stitch "Electric Discovery"), API client, push notifications, in-app inbox and banner, the update prompt, animated splash and onboarding |

Both apps talk to the same API as the website (`apps/api`), so there is no
business logic here that could drift from the web: bookings, payments,
check-in rules and sign-in all run on the server.

## What's in them

**Customer app.** Animated splash, a three-slide onboarding carousel, home
(search, trending events, organizer promo), explore with filters, event
details (collapsing hero, schedule timeline, tickets, FAQs), checkout with
live seat counts and Cashfree payment (UPI, cards, net banking) or cash,
a confetti confirmation, sign-in with Booking ID / mobile / email and a
6-digit code (same as the website), My Tickets with ticket-stub QR passes,
notifications and profile.

**Organizer app.** Same splash and onboarding, email + password sign-in
(the web portal account), dashboard with animated stats and booking
activity, events with sales progress, bookings with search, filters and
call / WhatsApp, and live QR check-in: camera scanner, torch, green / red
result flash with haptics, manual entry, live counts and swipe-to-undo.
Gate volunteers only see Check-In and More. Creating and editing events
stays on the web portal (the app links to it).

## Notifications

- **Push** (Firebase Cloud Messaging). The customer gets booking
  confirmed, booking cancelled, event cancelled and a reminder 3 hours
  before the event. The organizer gets new bookings and cancellations.
  They ride the existing email jobs on the server (`queue/jobs.ts`).
- **In-app.** Every push is also stored server-side, so the bell and
  Notifications screen show them even if the push itself was missed. A
  push that arrives while the app is open slides in as a banner.
- **"Update available".** On launch and when the app comes back to the
  foreground, the app asks `GET /api/mobile/app-config`. If its version is
  older than the latest one, a "What's new" sheet offers the update (the
  user can choose Later; it asks again for the next release or after 3
  days). Below the minimum version the sheet blocks the app until updated.

## Releasing a new version

1. Bump `version:` in the app's `pubspec.yaml` (e.g. `1.1.0+2`) and
   publish to Play Store / App Store.
2. Super admin portal → **Mobile apps**: set *Latest version* to `1.1.0`,
   add the "What's new" lines and the store links. Raise *Minimum
   version* only when old versions must stop working (e.g. an API change).
3. Optional: **Push "update available" to older installs** sends a push to
   every device still on an older version.

## One-time setup

### Firebase (push)

1. Create a Firebase project and add two Android apps and two iOS apps
   with the IDs above (or your own IDs if you change them before the first
   store upload).
2. Download `google-services.json` into `customer_app/android/app/` and
   `organizer_app/android/app/`, and `GoogleService-Info.plist` into each
   `ios/Runner/` (add it to the Runner target in Xcode).
3. iOS only: in Xcode enable *Push Notifications* and *Background Modes →
   Remote notifications*, and upload an APNs key in Firebase → Project
   settings → Cloud Messaging.
4. Server: Firebase → Project settings → Service accounts → *Generate new
   private key*, then put `project_id`, `client_email` and `private_key`
   into super admin → Integrations → Push notifications (or the
   `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
   environment variables).

Without the Firebase files the apps still build and run with push off.

### Payments

Cashfree's Flutter SDK opens the same order the website would create
(`POST /api/events/:id/bookings`). The booking is confirmed by Cashfree's
webhook, as on the web; the app waits for that before showing the
confirmation.

## Running

```bash
cd apps/mobile/customer_app        # or organizer_app
flutter pub get
flutter run                                         # production API
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000   # local API from the Android emulator
```

Checks (also run in CI by `.github/workflows/mobile.yml`):

```bash
flutter analyze && flutter test
```

Release builds need your own signing config in
`android/app/build.gradle.kts` (it uses the debug key for now) and an Apple
team in Xcode. App icons come from `apps/web/public/icon-512.png`; rerun
`dart run flutter_launcher_icons` after changing it.
