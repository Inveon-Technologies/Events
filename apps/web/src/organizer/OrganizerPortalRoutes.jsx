import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Layouts
import AppLayout from './components/layout/AppLayout';
import AuthLayout from './components/layout/AuthLayout';

// Auth Pages
import Login from './pages/auth/Login';
import SignUp from './pages/auth/SignUp';
import ForgotPassword from './pages/auth/ForgotPassword';
import VerifyOtp from './pages/auth/VerifyOtp';
import CreateNewPassword from './pages/auth/CreateNewPassword';
import VerifyIdentity from './pages/auth/VerifyIdentity';
import CompleteSetup from './pages/auth/CompleteSetup';

// Dashboard & General
import OrganizerDashboard from './pages/dashboard/OrganizerDashboard';
import NotificationsPage from './pages/NotificationsPage';

// Events & Creation
import MyEvents from './pages/events/MyEvents';
import EventPreview from './pages/events/EventPreview';
import CreateEvent from './pages/events/create/CreateEvent';

// Event Detail Specific
import EventDashboard from './pages/event-detail/EventDashboard';
import EventBookings from './pages/event-detail/EventBookings';
import EventParticipants from './pages/event-detail/EventParticipants';
import EventPayments from './pages/event-detail/EventPayments';
import EventTickets from './pages/event-detail/EventTickets';

// Global Operations
import Bookings from './pages/operations/Bookings';
import Tickets from './pages/operations/Tickets';
import Participants from './pages/operations/Participants';
import Payments from './pages/operations/Payments';
import CheckIn from './pages/operations/CheckIn';
import Cancellations from './pages/operations/Cancellations';

// Settings
import AccountSettings from './pages/settings/AccountSettings';
import PaymentVerificationSettings from './pages/settings/PaymentVerificationSettings';
import OrganizationSettings from './pages/settings/OrganizationSettings';
import SecuritySettings from './pages/settings/SecuritySettings';
import NotificationSettings from './pages/settings/NotificationSettings';
import IntegrationsSettings from './pages/settings/IntegrationsSettings';

// Mounted under /organizer/* in the main app's router (see
// apps/web/src/App.tsx) — every path below is relative to that mount
// point, not absolute, so this component nests correctly no matter
// where it's mounted. Internal navigation (Link/NavLink `to=`,
// `navigate()`) uses absolute /organizer/... paths instead (rewritten
// from the original upload, which used bare root-level paths that
// would have collided with the customer-facing site's own routes,
// e.g. its /events/:id vs. this app's /events).
export default function OrganizerPortalRoutes() {
  return (
    <Routes>
      {/* Authentication & Onboarding Routes */}
      <Route element={<AuthLayout />}>
        <Route path="login" element={<Login />} />
        <Route path="signup" element={<SignUp />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="verify-otp" element={<VerifyOtp />} />
        <Route path="create-new-password" element={<CreateNewPassword />} />
        <Route path="verify-identity" element={<VerifyIdentity />} />
        <Route path="complete-setup" element={<CompleteSetup />} />
      </Route>

      {/* Main Workspace App Layout */}
      <Route element={<AppLayout />}>
        <Route path="" element={<Navigate to="/organizer/dashboard" replace />} />
        <Route path="dashboard" element={<OrganizerDashboard />} />
        <Route path="notifications" element={<NotificationsPage />} />

        {/* My Events */}
        <Route path="events" element={<MyEvents />} />
        <Route path="events/:id/preview" element={<EventPreview />} />

        {/* 5-Step Event Creation Wizard */}
        <Route path="create-event/basic" element={<CreateEvent />} />
        <Route path="create-event/event-information" element={<CreateEvent />} />
        <Route path="create-event/date-location" element={<CreateEvent />} />
        <Route path="create-event/tickets" element={<CreateEvent />} />
        <Route path="create-event/registration" element={<CreateEvent />} />
        <Route path="create-event/cancellation" element={<CreateEvent />} />
        <Route path="create-event/preview" element={<CreateEvent />} />
        <Route path="events/:eventId/edit/basic" element={<CreateEvent />} />
        <Route path="events/:eventId/edit/date-location" element={<CreateEvent />} />
        <Route path="events/:eventId/edit/tickets" element={<CreateEvent />} />
        <Route path="events/:eventId/edit/cancellation" element={<CreateEvent />} />
        <Route path="events/:eventId/edit/preview" element={<CreateEvent />} />

        {/* Event Specific Management */}
        <Route path="events/:id/dashboard" element={<EventDashboard />} />
        <Route path="events/:id/bookings" element={<EventBookings />} />
        <Route path="events/:id/participants" element={<EventParticipants />} />
        <Route path="events/:id/payments" element={<EventPayments />} />
        <Route path="events/:id/tickets" element={<EventTickets />} />

        {/* Global Operations */}
        <Route path="bookings" element={<Bookings />} />
        <Route path="tickets" element={<Tickets />} />
        <Route path="participants" element={<Participants />} />
        <Route path="payments" element={<Payments />} />
        <Route path="check-in" element={<CheckIn />} />
        <Route path="cancellations-refunds" element={<Cancellations />} />

        {/* Settings */}
        <Route path="settings" element={<Navigate to="/organizer/settings/account" replace />} />
        <Route path="settings/account" element={<AccountSettings />} />
        <Route path="settings/verification" element={<PaymentVerificationSettings />} />
        <Route path="settings/organization" element={<OrganizationSettings />} />
        <Route path="settings/security" element={<SecuritySettings />} />
        <Route path="settings/notifications" element={<NotificationSettings />} />
        <Route path="settings/integrations" element={<IntegrationsSettings />} />

        {/* 404 Fallback within the organizer portal */}
        <Route path="*" element={<Navigate to="/organizer/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
