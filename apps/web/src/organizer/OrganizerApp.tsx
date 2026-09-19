import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { EventsProvider } from './context/EventsContext';
import OrganizerPortalRoutes from './OrganizerPortalRoutes';

export function OrganizerApp() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <EventsProvider>
          <OrganizerPortalRoutes />
        </EventsProvider>
      </NotificationProvider>
    </AuthProvider>
  );
}
