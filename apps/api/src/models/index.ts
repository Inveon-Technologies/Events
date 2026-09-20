import { Organizer } from './Organizer';
import { User } from './User';
import { Event, EventScheduleItem, EventPackingItem, EventFaqItem } from './Event';
import { EventMedia } from './EventMedia';
import { TicketCategory } from './TicketCategory';
import { Booking } from './Booking';
import { Ticket } from './Ticket';
import { Payment } from './Payment';
import { Cancellation } from './Cancellation';

// event_custom_questions, ticket_custom_answers, event_media, and
// certificates exist as tables (see the migration) but deliberately have
// no model classes yet — nothing reads/writes them until Phase 3 features
// land, and the roadmap itself flags their shape as likely to change.

Organizer.hasMany(User, { foreignKey: 'organizerId' });
User.belongsTo(Organizer, { foreignKey: 'organizerId' });

Organizer.hasMany(Event, { foreignKey: 'organizerId' });
Event.belongsTo(Organizer, { foreignKey: 'organizerId' });

Event.hasMany(EventMedia, { foreignKey: 'eventId' });
EventMedia.belongsTo(Event, { foreignKey: 'eventId' });

Event.hasMany(TicketCategory, { foreignKey: 'eventId' });
TicketCategory.belongsTo(Event, { foreignKey: 'eventId' });

Event.hasMany(Booking, { foreignKey: 'eventId' });
Booking.belongsTo(Event, { foreignKey: 'eventId' });

Booking.hasMany(Ticket, { foreignKey: 'bookingId' });
Ticket.belongsTo(Booking, { foreignKey: 'bookingId' });

TicketCategory.hasMany(Ticket, { foreignKey: 'ticketCategoryId' });
Ticket.belongsTo(TicketCategory, { foreignKey: 'ticketCategoryId' });

User.hasMany(Ticket, { foreignKey: 'checkedInByUserId', as: 'checkedInTickets' });
Ticket.belongsTo(User, { foreignKey: 'checkedInByUserId', as: 'checkedInBy' });

Booking.hasMany(Payment, { foreignKey: 'bookingId' });
Payment.belongsTo(Booking, { foreignKey: 'bookingId' });

User.hasMany(Payment, { foreignKey: 'verifiedByUserId', as: 'verifiedPayments' });
Payment.belongsTo(User, { foreignKey: 'verifiedByUserId', as: 'verifiedBy' });

Booking.hasMany(Cancellation, { foreignKey: 'bookingId' });
Cancellation.belongsTo(Booking, { foreignKey: 'bookingId' });

User.hasMany(Cancellation, { foreignKey: 'processedByUserId', as: 'processedCancellations' });
Cancellation.belongsTo(User, { foreignKey: 'processedByUserId', as: 'processedBy' });

export { Organizer, User, Event, TicketCategory, Booking, Ticket, Payment, Cancellation, EventMedia };
export type { EventScheduleItem, EventPackingItem, EventFaqItem };
