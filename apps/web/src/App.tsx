import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { EventsListPage } from './pages/EventsListPage';
import { OrganizersListPage } from './pages/OrganizersListPage';
import { EventDetailsPage } from './pages/EventDetailsPage';
import { EventUnavailablePage } from './pages/EventUnavailablePage';
import { CheckoutPage } from './pages/CheckoutPage';
import { PaymentVerificationPendingPage } from './pages/PaymentVerificationPendingPage';
import { PaymentFailedPage } from './pages/PaymentFailedPage';
import { BookingConfirmedPage } from './pages/BookingConfirmedPage';
import { ManageBookingPage } from './pages/ManageBookingPage';
import { VerificationLookupPage } from './pages/VerificationLookupPage';
import { MyBookingsPage } from './pages/MyBookingsPage';
import { BookingNotFoundPage } from './pages/BookingNotFoundPage';
import { OrganizerProfilePage } from './pages/OrganizerProfilePage';
import { FeedbackPage } from './pages/FeedbackPage';
import { TicketPage } from './pages/TicketPage';
import { OrganizerApp } from './organizer/OrganizerApp';

// A bare /bookings/<reference> link goes to the real booking management
// page (which verifies reference + email before showing anything). It
// used to render a mock booking marked "Paid" for any reference at all.
function BookingReferenceRedirect() {
  const { bookingId } = useParams();
  return <Navigate to={`/bookings/${bookingId}/manage`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/events" element={<EventsListPage />} />
      <Route path="/organizers" element={<OrganizersListPage />} />

      <Route path="/organizers/:organizerSlug" element={<OrganizerProfilePage />} />

      <Route path="/events/:eventId" element={<EventDetailsPage />} />
      <Route path="/events/:eventId/checkout" element={<CheckoutPage />} />
      <Route path="/checkout/pending" element={<PaymentVerificationPendingPage />} />
      <Route path="/checkout/failed" element={<PaymentFailedPage />} />

      <Route path="/bookings/lookup" element={<VerificationLookupPage />} />
      <Route path="/bookings/my" element={<MyBookingsPage />} />
      <Route path="/bookings/not-found" element={<BookingNotFoundPage />} />
      <Route path="/bookings/:bookingId/confirmed" element={<BookingConfirmedPage />} />
      <Route path="/bookings/:bookingId/manage" element={<ManageBookingPage />} />
      <Route path="/feedback" element={<FeedbackPage />} />
      <Route path="/bookings/:bookingReference/feedback" element={<FeedbackPage />} />
      <Route path="/bookings/:bookingId" element={<BookingReferenceRedirect />} />
      {/* Ticket page behind the signed link sent on WhatsApp and email */}
      <Route path="/t/:token" element={<TicketPage />} />

      {/* Organizer back office — entire nested app, all 44 pages */}
      <Route path="/organizer/*" element={<OrganizerApp />} />

      {/* Catch-all */}
      <Route path="*" element={<EventUnavailablePage reference="404" />} />
    </Routes>
  );
}
