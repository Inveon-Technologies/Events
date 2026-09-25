import type { Event, EventPartner } from '../models/Event';
import { getEventCoverUrls } from './eventMedia';

// What the ticket (web page, email, PDF, WhatsApp card) is dressed in,
// per event: the organizer's own title background — or, when none was
// uploaded, the event's cover photo — and their Partners & Supporters.

export interface EventTicketDesign {
  coverUrl: string | null;
  backgroundUrl: string | null;
  partners: EventPartner[];
}

export async function getEventTicketDesign(event: Event): Promise<EventTicketDesign> {
  const coverUrl = (await getEventCoverUrls([{ id: event.id, bannerUrl: event.bannerUrl }])).get(event.id) ?? null;
  return {
    coverUrl,
    backgroundUrl: event.ticketBackgroundUrl || coverUrl,
    partners: (event.partners ?? []).filter((p) => p.name || p.logoUrl),
  };
}
