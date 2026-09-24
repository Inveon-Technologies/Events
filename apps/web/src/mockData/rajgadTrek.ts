// Temporary in-memory fixtures standing in for the real API (see
// docs/Inveon_Events_Technical_Roadmap.md — GET /public/events/:id, etc).
// Replace each of these with a React Query hook once the backend exists.

export interface TicketCategory {
  id: string;
  name: string;
  description: string;
  price: number;
  maxPerBooking: number;
  available?: number;
}

export const rajgadTrek = {
  id: 'rajgad-sunrise-trek-2026',
  slug: 'rajgad-sunrise-trek',
  name: 'Rajgad Sunrise Trek',
  tagline: 'Chase the sunrise from a 17th-century hill fort',
  date: '2026-10-18',
  time: '05:30 AM',
  gatherTime: '05:00 AM',
  venue: 'Rajgad Base Village, Gunjavane, Maharashtra',
  organizer: {
    slug: 'example-adventures',
    name: 'Example Adventures',
    tagline: 'Trekking & outdoor experiences across the Sahyadris',
  },
  heroImage:
    'https://images.unsplash.com/photo-1544216428-d0e10da5ee56?q=80&w=1600&auto=format&fit=crop',
  about:
    'Wake up before dawn and climb one of Maharashtra\u2019s most iconic hill forts in time to watch the sun rise over the Sahyadri range. A guided, beginner-friendly trek with breakfast, tea, and a history walk through Rajgad\u2019s bastions included.',
  highlights: [
    'Guided sunrise summit with certified trek leaders',
    'Fresh breakfast and tea at the fort',
    'History walk through Padmavati Machi',
    'Small groups, safety-briefed and first-aid equipped',
  ],
  included: ['Trek guide & safety staff', 'Breakfast & tea', 'First-aid support', 'Entry permits'],
  excluded: ['Transport to base village', 'Personal trekking gear', 'Travel insurance'],
  packingList: ['Trekking shoes', 'Torch/headlamp', 'Water bottle (1L+)', 'Light jacket', 'ID proof'],
  cancellationPolicy: [
    { window: 'More than 7 days before the event', refund: '100% refund' },
    { window: '3–7 days before the event', refund: '50% refund' },
    { window: 'Less than 72 hours before the event', refund: 'No refund' },
  ],
  ticketCategories: [
    {
      id: 'general',
      name: 'General',
      description: 'Standard mountain trek pass with basecamp breakfast and basic first-aid guide support.',
      price: 499,
      maxPerBooking: 10,
      available: 42,
    },
    {
      id: 'vip',
      name: 'VIP Experience',
      description: 'Priority ascent briefing, complimentary sunrise drone photography package, and energy snack kit.',
      price: 999,
      maxPerBooking: 10,
      available: 15,
    },
    {
      id: 'premium',
      name: 'Premium Summit Explorer',
      description: '1-on-1 certified mountaineer guide, premium trail pack, professional souvenir badge, and Pune pickup.',
      price: 1499,
      maxPerBooking: 10,
      available: 8,
    },
  ] as TicketCategory[],
};

export const otherOrganizerEvents = [
  {
    id: 'lonavala-weekend-escape',
    name: 'Lonavala Weekend Escape',
    date: '03 Oct 2026',
    location: 'Lonavala, Maharashtra',
    price: 1499,
    category: 'Trip',
    image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=800&auto=format&fit=crop',
  },
  {
    id: 'harishchandragad-adventure',
    name: 'Harishchandragad Adventure',
    date: '18 Oct 2026',
    location: 'Maharashtra',
    price: 899,
    category: 'Trek',
    image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=800&auto=format&fit=crop',
  },
];

export const discoverEvents = [
  {
    id: 'rajgad-sunrise-trek-2026',
    name: 'Rajgad Sunrise Trek',
    organizer: 'By Example Adventures',
    organizerSlug: 'example-adventures',
    date: '20 Sep 2026',
    location: 'Pune, Maharashtra',
    price: 499,
    category: 'Trek',
    image: 'https://lh3.googleusercontent.com/aida/AEtjO1XNDK3DwXLYJHWefZqRpeR_5Fv0VXcsJjgiyCDbMyZcvH-TwAC4IQ4doGg9Dial1m4cDjs4tpxA1Fh2fbsMleD4ugl2w8rdSUITnVbcU_IN3ZtSH1EzA5KgtlhfaTjCwNokv9f7JHHqVumj42I9Q3Srup3bu9LGTasnsWgC4jtRnj3hq16ytNnzzP-6UC1j4-srpAnH2KcZ3HsXqtIAtsZSINTcmKqUY4ilU2ziBDIon2nrOAd_8MgHOXQ',
  },
  {
    id: 'startup-growth-workshop',
    name: 'Startup Growth Workshop',
    organizer: 'By Growth Labs',
    organizerSlug: 'growth-labs',
    date: '25 Sep 2026',
    location: 'Pune, Maharashtra',
    price: 999,
    category: 'Workshop',
    image: 'https://lh3.googleusercontent.com/aida/AEtjO1UedBlprRG_nwi_ZKHMtPStGoS5jwxfN_b255GtmD2Dd0BwJL3-SR8C_6r9fIjXgOtWgRXG4PM7Al3EYwzaoe40DmjEbmBZj8FSwLn_gl5y2N-yzZxyo8alHOi3sw7_WZwBB3s30SVOi7xehRNEjBzWfE9apyzxe4OHIXlifo5EfJN98BWOEp4GPTC1O5fknzDEXDU2cklK-c9Sg3LfYnPA4LgxpKA0RBon3k4Q2WFugCBPxGLzEGLDAKfa',
  },
  {
    id: 'live-music-evening',
    name: 'Live Music Evening',
    organizer: 'By Example Events',
    organizerSlug: 'example-events',
    date: '28 Sep 2026',
    location: 'Mumbai, Maharashtra',
    price: 799,
    category: 'Music',
    image: 'https://lh3.googleusercontent.com/aida/AEtjO1X-X7Gi6ltc8mKCExDdGdd6gXjM0vW0RT4VErJrzQrr4hv82uGzsVLtbaNP_-K7cJubUQVp55pX_YQybsOLiDXFE9TVQL_CfvgCWqj7OEUQEO9lHJWS-kvi3GG8FSLshpWVVFS3JEwzez11gKGyPoD8XtpHTFm3kTe9wsO6jj48tFzsDsT6gQb8c7n530iVqRSPmydkGZ04IqBTGe-DXsrR82xdmmwiH4rgMKuGr5sIIXtKKvu9-ZbheoWB',
  },
  {
    id: 'weekend-lonavala-escape',
    name: 'Weekend Lonavala Escape',
    organizer: 'By Travel Collective',
    organizerSlug: 'travel-collective',
    date: '03 Oct 2026',
    location: 'Lonavala, Maharashtra',
    price: 1499,
    category: 'Trip',
    image: 'https://lh3.googleusercontent.com/aida/AEtjO1W7-QH6Gz7dtssPDRnc8x5t3HKba23VVpX3cLUs6mPagC8OpTk-06iYUFXgq7aFdaH8-tee4onvv4_csuFctMLKC7d0GwLW0ZLkZrfTK7GILruXf0YxRrVwligr9gGvDCVlqQTBrFkCrY47KdZq6aUTaMIjflqg5fBq474VbS1YwQcH6h-hvXre8ifF_lLH8-uYJH5VnvJn9bRpBkIbYytKwrU4A_NTalFvWXWoDSYLMP0bBb656dNN-OQm',
  },
];

export const categories = [
  { icon: 'landscape', name: 'Treks' },
  { icon: 'navigation', name: 'Trips' },
  { icon: 'co_present', name: 'Workshops' },
  { icon: 'diversity_3', name: 'Conferences' },
  { icon: 'directions_run', name: 'Sports' },
  { icon: 'account_balance', name: 'Cultural' },
  { icon: 'music_note', name: 'Entertainment' },
  { icon: 'grid_view', name: 'Other' },
];

export interface MockAttendee {
  ticketId: string;
  name: string;
  category: string;
  status: 'confirmed' | 'cancelled';
}

export const mockBooking = {
  id: 'INV-BKG-1001',
  eventId: rajgadTrek.id,
  contactName: 'Rahul Sharma',
  contactEmail: 'rahul.sharma@example.com',
  contactPhone: '+91 98765 43210',
  paymentMethod: 'online' as const,
  paymentStatus: 'paid' as const,
  amountPaid: 1897,
  attendees: [
    { ticketId: 'INV-TKT-1001', name: 'Rahul Sharma', category: 'General Pass', status: 'confirmed' },
    { ticketId: 'INV-TKT-1002', name: 'Amit Patil', category: 'General Pass', status: 'confirmed' },
    { ticketId: 'INV-TKT-1003', name: 'Sneha Kulkarni', category: 'VIP Trekker Pass', status: 'confirmed' },
  ] as MockAttendee[],
};

export interface EventDetails {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  category: string;
  subCategory?: string;
  rating?: string;
  reviewsCount?: number;
  date: string;
  time: string;
  gatherTime: string;
  difficulty?: string;
  venue: string;
  locationCoords?: string;
  parkingInfo?: string;
  drivingInfo?: string;
  availableSeats: number;
  organizer: {
    slug: string;
    name: string;
    tagline: string;
    eventsHosted?: number;
    rating?: string;
  };
  galleryImages: {
    src: string;
    alt: string;
  }[];
  videoUrl?: string | null;
  about: string;
  aboutExtra?: string;
  highlights: {
    icon: string;
    title: string;
    desc: string;
  }[];
  included: string[];
  excluded: string[];
  schedule: {
    time: string;
    title: string;
    desc: string;
  }[];
  packingList: {
    icon: string;
    title: string;
    desc: string;
  }[];
  leader: {
    name: string;
    role: string;
    bio: string;
    avatar: string;
  };
  // Real fields only — no mock equivalent exists for these, unlike
  // schedule/packingList above which have a rich hand-authored mock
  // template to fall back to. null/undefined means "nothing to show",
  // handled by the page rendering nothing rather than a placeholder.
  cancellationPolicyText?: string | null;
  allowSelfServiceCancellation?: boolean;
  refundCutoffDays?: number | null;
  refundPercentage?: number | null;
  venueMapUrl?: string | null;
  genderRestriction?: 'male' | 'female' | null;
  faqItems?: { question: string; answer: string }[] | null;
  ratingSummary?: { averageRating: number | null; reviewCount: number };
  isPast?: boolean;
  ticketCategories: TicketCategory[];
}

export function getEventData(eventId?: string): EventDetails {
  const baseGallery = [
    {
      src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCXP8HisbAA78smiPPq4N5UudlP_zQ1i4oxp1wGJjPu4mv5ONmaeoOwCZ0R_OQsilhucYKMycwWS024cczrRqHr4WJ0In5mJnsm-AFkgD0xgdlINMnlCwPaUnoWVoU-EZKxvslYu4H6AABej7LwcwYn2BODw2XCllrmtn15xOrGfGL1ftRYnjN_axUmyIrRh899j5d-W6ytwE1ECS_9EWB-cPQd4F3ii7O3yHcCNtWY',
      alt: 'Majestic sunrise view from ancient stone battlements of Rajgad Fort atop green Sahyadri mountain ridges in Maharashtra India',
    },
    {
      src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAbZX-v1cue_RlgKkQRsvnnHlRUrH07IZx9vWFjj82SBm42nxuVMwAa-r8fRnRxwtpS9SwyVI3Qv9zkK84xXzAVQKDNohz0VJZY7ecS6pKrd-n914vv3-6ajovxHWk49RA1M-oyiueqceWb2MgHsNxLYXN_abeBhqdDGIGLNR6zLV1ZmbTwhXR9LhLNaaTbpV8JKCAs69MxttbSzcYfecqZZmmqqpvWWDeNkibI8dAL',
      alt: 'Rajgad sunrise trek fort viewpoint with golden dawn colors and sea of clouds',
    },
    {
      src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBpYsEjFGwkV_MSWC1mvpg1_70FDzIqD3pGKVOU4Xgdz11_NhKRZPsMU4WgGj42IiVXdrADiIhZ74MlaDIqHYLNuSfUJT6lwHek9vb0Ty-u3qjfBFOF3mil-3dwDH4di2yMveujTX7hMWSbmyO1NPmJHICUaRXe7SvdsIgpK4hU0tflSwrhQ4x2s5b3xdXA4DsGhIeEDhaCep8gDY3q8IP8_GBCtQ-38KnRl8Ui0vSO',
      alt: 'Rugged mountain ridge trail climbing towards historic Indian hill fort fortification',
    },
    {
      src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAs3Byx4UWfhNEZeNXyrHTq9M0dkcp7BGCNulNkC1Q2cFbZd8wCj90-Jgn_C_G6dnpbk58E9YKBjfhv0kCJaJ28iQIzgecbMdrppfyuFGHh-LdXJx9yDX34mlx8xD7rknt9LROJrC50nj0VO-4Zq_CEAUhC6XiSeBn0C-mvbOr6nf1Jk1tjigxD_i9kCxIQ6eltJT9R6AL2o2m23y0YAWrc0i5KA2b4PFn5i2bD13rX',
      alt: 'Trek group walking along ridge crest overlooking mist covered green valley',
    },
    {
      src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDPj3oF-coeSVDpGOCMyWROjVqwvdIOU2D7ZQHjElRPoce_lDkGVHeUu3EF0qFvHPfI9tzv4siatRSzcxSt8PomdWN-cagVtebF4JOlo6h9_lVpb2OP_MhG4YBqJRwrqGrNQjqucgNYMzBFfqbusL-LqWw8QD3JTXBHljrk0WxX9sITCaW8OgDfSH-s0Q5DwENtXFLwHwMZwm4P88xQ6n0Y8nSx898X6hTAvwJRFqRy',
      alt: 'Hikers silhouette celebration on mountain top sunrise',
    },
  ];

  const found = discoverEvents.find((e) => e.id === eventId) || otherOrganizerEvents.find((e) => e.id === eventId);
  const eventName = found ? found.name : rajgadTrek.name;
  const eventCategory = found ? found.category : 'Trek';
  const eventDate = found ? found.date : '20 September 2026';
  const eventVenue = found ? found.location : 'Rajgad Fort, Pune, Maharashtra';
  const eventPrice = found ? found.price : 499;
  const mainImage = found ? found.image : baseGallery[0].src;

  return {
    id: eventId || rajgadTrek.id,
    slug: rajgadTrek.slug,
    name: eventName,
    tagline: `Start your morning above the clouds with a guided ${eventCategory.toLowerCase()} through one of Maharashtra's most scenic historic spots.`,
    category: eventCategory,
    subCategory: 'Sahyadri Range',
    rating: '4.9',
    reviewsCount: 184,
    date: eventDate,
    time: '5:30 AM – 11:30 AM',
    gatherTime: '5:00 AM Sharp',
    difficulty: 'Moderate (4.2 km)',
    venue: eventVenue,
    locationCoords: '18.2464° N, 73.6828° E • Ample vehicle parking available',
    parkingInfo: 'Ample vehicle parking available at Base Camp',
    drivingInfo: 'Approx. 1h 45m from Pune via NH48 and Nasrapur - Velhe Road.',
    availableSeats: 42,
    organizer: {
      slug: 'example-adventures',
      name: 'Example Adventures',
      tagline: 'Adventure • Travel • Outdoor Experiences',
      eventsHosted: 62,
      rating: '99.2%',
    },
    galleryImages: [
      { src: mainImage, alt: eventName },
      ...baseGallery.slice(1),
    ],
    about:
      `Join us for an unforgettable guided ${eventName} designed for adventure lovers, weekend explorers, and photography enthusiasts. Located conveniently near Pune and Mumbai, this experience combines majestic natural vistas with rich local culture. We will navigate scenic trails under a blanket of stars to witness dawn piercing through rolling sea-clouds across the Sahyadri mountains.`,
    aboutExtra:
      'Every participant receives certified guide supervision, hot local breakfast atop the summit, safety support, and historical storytelling about the architectural and ecological wonders of the region.',
    highlights: [
      {
        icon: 'cloud',
        title: 'Sea of Clouds',
        desc: 'Phenomenal inversion clouds during dawn at 4,500 ft altitude.',
      },
      {
        icon: 'castle',
        title: 'Historic Fort Gates',
        desc: 'Walk through preserved ancient architectural marvels.',
      },
      {
        icon: 'groups',
        title: 'Solo-Friendly',
        desc: 'Structured icebreakers and safe group protocols for solo adventurers.',
      },
    ],
    included: [
      'Experienced certified trek leaders & sweepers',
      'Traditional Maharashtrian breakfast & tea',
      'Forest department entry fees & permits',
      'Comprehensive first-aid & emergency rescue kit',
      'Digital trek certificate & high-res group photos',
    ],
    excluded: [
      'Personal travel to base village',
      'Personal trekking gear and personal expenses',
    ],
    schedule: [
      {
        time: '05:00 AM',
        title: 'Base Camp Assembly & Attendance',
        desc: 'Reporting at base camp, gear safety verification, roll call, and light stretching.',
      },
      {
        time: '05:30 AM',
        title: 'Kickoff & Ascent',
        desc: 'Begin ascending through historic mountain trail with torchlights and trail leaders.',
      },
      {
        time: '06:45 AM',
        title: 'Sunrise Spectacle Viewpoint',
        desc: 'Reach upper plateau, witness the sun emerging through inversion cloud beds. 45-min photo session.',
      },
      {
        time: '08:00 AM',
        title: 'Exploration & Heritage Walk',
        desc: 'Visit historical temples, ancient water cisterns, and natural rock windows.',
      },
      {
        time: '09:30 AM',
        title: 'Fresh Breakfast & Tea',
        desc: 'Hot Poha, Misal Pav, boiled eggs, and village-brewed ginger tea served hot.',
      },
      {
        time: '11:30 AM',
        title: 'Descent & Debrief',
        desc: 'Arrive safely at base village, feedback circle, distribution of digital credentials, wrap up.',
      },
    ],
    packingList: [
      {
        icon: 'water_drop',
        title: 'Water Hydration',
        desc: 'Minimum 2 liters per person (reusable bottle).',
      },
      {
        icon: 'hiking',
        title: 'Footwear',
        desc: 'Trekking shoes with solid rubber lug grip (no flat sneakers).',
      },
      {
        icon: 'flash_on',
        title: 'Torch / Headlamp',
        desc: 'Essential for the 5:30 AM pre-dawn uphill hike.',
      },
      {
        icon: 'rainy',
        title: 'Rain Wear & Windcheater',
        desc: 'Light windcheater or poncho for dawn mountain breeze.',
      },
    ],
    leader: {
      name: 'Tanmay Kulkarni',
      role: 'Lead Mountaineer',
      bio: 'NIM Uttarkashi certified (Grade A), with 120+ Sahyadri summit treks and high altitude Himalayan expeditions. Leading safety and natural history insights for this event.',
      avatar:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuC_VfzpuuOvm2Tn63vNqbJk1AtkpabO7Y9OQYe19Iv_ewhO1lIttLx_K887ZXnw5WH3bZHV6IIenBjweq0pNAeELWB-P01F95JvPGZrXB3n70Gr1czV5U2q29--hx4PNEAc-YNzCRerUciHxInofe3H0Lt5gdTj-INdinbYx-vHwuiex9hfH5vkHsTYtyvNmpbRONl6_YOfpsedqnmxLoKOfbDQ6dOQFTfszJijPnwH',
    },
    ticketCategories: [
      {
        id: 'general',
        name: 'General Pass',
        description: `₹${eventPrice} • Guide & Breakfast`,
        price: eventPrice,
        maxPerBooking: 10,
        available: 42,
      },
      {
        id: 'vip',
        name: 'VIP + Transport',
        description: `₹${eventPrice + 500} • AC Bus from Pune`,
        price: eventPrice + 500,
        maxPerBooking: 10,
        available: 15,
      },
      {
        // Matches the Premium Summit Explorer tier CheckoutPage always
        // renders as a third option — was missing here, so its price
        // silently priced at 0 for every event except the original
        // static rajgadTrek fixture. Same +500-per-tier step as vip.
        id: 'premium',
        name: 'Premium Summit Explorer',
        description: `₹${eventPrice + 1000} • 1-on-1 guide & priority pickup`,
        price: eventPrice + 1000,
        maxPerBooking: 10,
        available: 8,
      },
    ],
  };
}

// --- Real backend integration ---
// getEventData() above is a synchronous template generator (rich filler
// content — highlights, schedule, packing list, etc. — layered onto a
// few real-ish fields looked up from the mock catalog). fetchEventData()
// below keeps ALL of that same template, but sources the fields that
// actually matter for a real booking (name, venue, date, organizer,
// and — critically — real ticket category ids/prices/availability) from
// the real backend via GET /api/events/:eventId. If that fetch 404s
// (an id from the mock catalog, not a real database UUID) or fails for
// any other reason, this falls back to the pure mock template so every
// existing mock-event route keeps working exactly as before.
export async function fetchEventData(eventId?: string): Promise<EventDetails> {
  const template = getEventData(eventId);
  if (!eventId) return template;

  try {
    const res = await fetch(`/api/events/${eventId}`);
    if (!res.ok) return template;
    const real = await res.json();

    const eventDate = new Date(real.eventDate);
    const dateStr = eventDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = eventDate.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });

    const realMedia = Array.isArray(real.media) ? real.media : [];
    const realPhotos = realMedia.filter((m: { mediaType: string }) => m.mediaType === 'photo');
    const realVideo = realMedia.find((m: { mediaType: string }) => m.mediaType === 'video');

    return {
      ...template,
      id: real.id,
      name: real.name,
      tagline: real.tagline || template.tagline,
      date: dateStr,
      time: timeStr,
      venue: real.venueAddress || template.venue,
      organizer: {
        ...template.organizer,
        slug: real.organizerSlug,
        name: real.organizerName,
      },
      about: real.description || template.about,
      // Falls back to the mock template's gallery only when the real
      // event genuinely has no uploaded photos — showing fake stock
      // photos alongside a real organizer's real event would be
      // actively misleading, not a harmless placeholder.
      galleryImages: realPhotos.length > 0
        ? realPhotos.map((m: { url: string }) => ({ src: m.url, alt: real.name }))
        : template.galleryImages,
      videoUrl: realVideo ? realVideo.url : null,
      // Same "real data or the mock template, never a mix that implies
      // a real event has content it doesn't" reasoning as the gallery
      // above — an organizer who didn't fill in a schedule shouldn't
      // have a fabricated one appear on their real event.
      schedule: Array.isArray(real.scheduleItems) && real.scheduleItems.length > 0
        ? real.scheduleItems.map((s: { time: string; title: string; description?: string }) => ({
            time: s.time,
            title: s.title,
            desc: s.description || '',
          }))
        : template.schedule,
      packingList: Array.isArray(real.packingChecklist) && real.packingChecklist.length > 0
        ? real.packingChecklist.map((p: { item: string; mandatory: boolean }) => ({
            icon: p.mandatory ? 'check_circle' : 'info',
            title: p.item,
            desc: p.mandatory ? 'Mandatory' : 'Optional',
          }))
        : template.packingList,
      cancellationPolicyText: real.cancellationPolicy || null,
      allowSelfServiceCancellation: Boolean(real.allowSelfServiceCancellation),
      refundCutoffDays: real.refundCutoffDays ?? null,
      refundPercentage: real.refundPercentage ?? null,
      venueMapUrl: real.venueMapUrl || null,
      genderRestriction: real.genderRestriction || null,
      faqItems: Array.isArray(real.faqItems) && real.faqItems.length > 0 ? real.faqItems : null,
      ratingSummary: real.ratingSummary,
      isPast: eventDate.getTime() < Date.now(),
      ticketCategories: real.ticketCategories.map((tc: { id: string; name: string; description: string | null; pricePaise: number; maxPerBooking: number; available: number }) => ({
        id: tc.id,
        name: tc.name,
        description: tc.description || `₹${Math.round(tc.pricePaise / 100)} per ticket`,
        price: Math.round(tc.pricePaise / 100),
        maxPerBooking: tc.maxPerBooking,
        available: tc.available,
      })),
    };
  } catch {
    return template;
  }
}
