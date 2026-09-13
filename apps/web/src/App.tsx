import { Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { EventDetailsPage } from './pages/EventDetailsPage';
import { EventUnavailablePage } from './pages/EventUnavailablePage';
import { CheckoutPage } from './pages/CheckoutPage';
import { PaymentProcessingPage } from './pages/PaymentProcessingPage';
import { PaymentVerificationPendingPage } from './pages/PaymentVerificationPendingPage';
import { PaymentFailedPage } from './pages/PaymentFailedPage';
import { BookingConfirmedPage } from './pages/BookingConfirmedPage';
import { BookingHubPage } from './pages/BookingHubPage';
import { ManageBookingPage } from './pages/ManageBookingPage';
import { VerificationLookupPage } from './pages/VerificationLookupPage';
import { BookingNotFoundPage } from './pages/BookingNotFoundPage';
import { OrganizerProfilePage } from './pages/OrganizerProfilePage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />

      <Route path="/organizers/:organizerSlug" element={<OrganizerProfilePage />} />

      <Route path="/events/:eventId" element={<EventDetailsPage />} />
      <Route path="/events/:eventId/checkout" element={<CheckoutPage />} />

      <Route path="/checkout/processing" element={<PaymentProcessingPage />} />
      <Route path="/checkout/pending" element={<PaymentVerificationPendingPage />} />
      <Route path="/checkout/failed" element={<PaymentFailedPage />} />

      <Route path="/bookings/lookup" element={<VerificationLookupPage />} />
      <Route path="/bookings/not-found" element={<BookingNotFoundPage />} />
      <Route path="/bookings/:bookingId/confirmed" element={<BookingConfirmedPage />} />
      <Route path="/bookings/:bookingId/manage" element={<ManageBookingPage />} />
      <Route path="/bookings/:bookingId" element={<BookingHubPage />} />

      {/* Catch-all */}
      <Route path="*" element={<EventUnavailablePage reference="404" />} />
    </Routes>
  );
}
