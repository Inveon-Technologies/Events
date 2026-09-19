export const INITIAL_EVENTS = [
  {
    id: "rajgad-sunrise-trek",
    title: "Rajgad Sunrise Trek",
    category: "Adventure & Trekking",
    status: "published", // published | draft | completed | cancelled
    shortDescription: "Experience the majestic sunrise from the Queen of Forts, Rajgad, with guided night trekking, camping, and breakfast.",
    description: "Experience the historic splendor of Rajgad Fort, the former capital of the Maratha Empire under Chhatrapati Shivaji Maharaj. This guided night trek takes you through scenic Sahyadri mountain trails to witness an unforgettable golden sunrise over Balekilla and the scenic valleys of Maharashtra.",
    startDate: "2025-04-12",
    startTime: "22:00",
    endDate: "2025-04-13",
    endTime: "11:30",
    timezone: "IST (UTC+5:30)",
    venueType: "physical",
    venueName: "Gunjawane Base Village",
    address: "Gunjawane, Velhe Taluka, Pune District, Maharashtra 412213",
    city: "Pune",
    state: "Maharashtra",
    pincode: "412213",
    bannerImage: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=800&q=80"
    ],
    totalCapacity: 50,
    ticketsSold: 38,
    checkedInCount: 29,
    grossRevenue: 57000,
    ticketTiers: [
      {
        id: "tier-early-bird",
        name: "Early Bird Trekker",
        price: 1299,
        originalPrice: 1599,
        quantity: 20,
        sold: 20,
        status: "sold_out",
        description: "Includes trek guidance, safety gear, energy snacks, and breakfast."
      },
      {
        id: "tier-regular-pass",
        name: "General Trekker Pass",
        price: 1500,
        originalPrice: 1500,
        quantity: 20,
        sold: 14,
        status: "available",
        description: "Includes guided trek, transportation from Pune Swargate, and authentic Maharashtrian breakfast."
      },
      {
        id: "tier-vip-camping",
        name: "Trek + Tent Camping",
        price: 2200,
        originalPrice: 2500,
        quantity: 10,
        sold: 4,
        status: "available",
        description: "Includes 2-person tent accommodation, dinner on fort, campfire, and sunrise trek guide."
      }
    ],
    cancellationPolicy: {
      refundable: true,
      cutoffDays: 3,
      refundPercentage: 80,
      description: "Full refund up to 7 days before event. 80% refund between 7 and 3 days. No refund within 72 hours of departure."
    },
    organizer: {
      name: "Sahyadri Wanderers Club",
      email: "explore@sahyadriwanderers.com",
      phone: "+91 98765 43210",
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80"
    },
    tags: ["Trekking", "Sunrise", "Sahyadri", "Fort", "Night Trek", "Camping"]
  },
  {
    id: "pune-tech-summit-2025",
    title: "Pune AI & Cloud Tech Summit 2025",
    category: "Technology & Conferences",
    status: "published",
    shortDescription: "Western India's premier gathering of 1,200+ engineers, founders, and cloud architects discussing generative AI and scalable systems.",
    description: "Join keynote sessions, technical workshops, and developer networking sessions with global engineering leads from Google, Microsoft, AWS, and leading Indian unicorn startups.",
    startDate: "2025-05-20",
    startTime: "09:00",
    endDate: "2025-05-21",
    endTime: "18:00",
    timezone: "IST (UTC+5:30)",
    venueType: "hybrid",
    venueName: "JW Marriott Grand Ballroom & Online Stream",
    address: "Senapati Bapat Road, Shivajinagar",
    city: "Pune",
    state: "Maharashtra",
    pincode: "411016",
    bannerImage: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=80",
    totalCapacity: 800,
    ticketsSold: 642,
    checkedInCount: 0,
    grossRevenue: 963000,
    ticketTiers: [
      {
        id: "tier-tech-standard",
        name: "Standard Conference Pass",
        price: 1499,
        quantity: 500,
        sold: 412,
        status: "available",
        description: "Access to 2-day keynotes, expo hall, lunch, and conference swag bag."
      },
      {
        id: "tier-tech-vip",
        name: "VIP & Speaker Dinner Pass",
        price: 4999,
        quantity: 100,
        sold: 95,
        status: "available",
        description: "Front-row keynote seating, private speaker lounge, and invite to VIP networking dinner."
      },
      {
        id: "tier-tech-virtual",
        name: "Virtual Live Stream Pass",
        price: 499,
        quantity: 200,
        sold: 135,
        status: "available",
        description: "Full HD live streaming + on-demand session recordings for 1 year."
      }
    ],
    cancellationPolicy: {
      refundable: true,
      cutoffDays: 5,
      refundPercentage: 90,
      description: "90% refund available up to 5 days prior to event start."
    },
    organizer: {
      name: "Inveon Tech Community",
      email: "community@inveon.dev",
      phone: "+91 99887 76655",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80"
    },
    tags: ["Artificial Intelligence", "Cloud", "Developer", "Networking", "Startups"]
  },
  {
    id: "mumbai-indie-music-festival",
    title: "Mumbai Sunset Indie Music Fest",
    category: "Music & Festivals",
    status: "published",
    shortDescription: "A weekend open-air celebration of 18 indie bands, acoustic stages, artisan food stalls, and oceanfront vibes.",
    description: "Featuring live performances across 3 stages, flea markets, craft brews, and curated food popups at the iconic Bayview grounds.",
    startDate: "2025-06-07",
    startTime: "16:00",
    endDate: "2025-06-08",
    endTime: "23:00",
    timezone: "IST (UTC+5:30)",
    venueType: "physical",
    venueName: "Bandra Fort Amphitheatre Grounds",
    address: "Land's End, Bandra West",
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "400050",
    bannerImage: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80",
    totalCapacity: 1500,
    ticketsSold: 1120,
    checkedInCount: 0,
    grossRevenue: 1344000,
    ticketTiers: [
      {
        id: "tier-ga-single",
        name: "General Admission (Single Day)",
        price: 899,
        quantity: 800,
        sold: 680,
        status: "available",
        description: "Entry to festival grounds for either Saturday or Sunday."
      },
      {
        id: "tier-ga-weekend",
        name: "Full Weekend Pass",
        price: 1599,
        quantity: 500,
        sold: 360,
        status: "available",
        description: "Access to both days with priority gate entry."
      },
      {
        id: "tier-vip-front",
        name: "VIP Lounge & Front Stage",
        price: 2999,
        quantity: 200,
        sold: 80,
        status: "available",
        description: "Elevated viewing deck, 2 complimentary drinks, and AC lounge access."
      }
    ],
    cancellationPolicy: {
      refundable: false,
      cutoffDays: 0,
      refundPercentage: 0,
      description: "Non-refundable event. Ticket transfers are permitted up to 24 hours before event."
    },
    organizer: {
      name: "SoundWave Live",
      email: "tickets@soundwavelive.in",
      phone: "+91 91234 56789",
      avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80"
    },
    tags: ["Music", "Live Band", "Sunset", "Mumbai", "Festival"]
  },
  {
    id: "mindful-yoga-retreat-lonavala",
    title: "Monsoon Mindfulness & Yoga Retreat",
    category: "Health & Wellness",
    status: "draft",
    shortDescription: "A serene 3-day weekend retreat in misty Lonavala hills focused on restorative yoga, sound healing, and breathwork.",
    description: "Immerse yourself in rejuvenating guided yoga flows, breathwork meditation, Ayurvedic organic dining, and sound bath therapies amidst lush mountain greenery.",
    startDate: "2025-07-18",
    startTime: "14:00",
    endDate: "2025-07-20",
    endTime: "16:00",
    timezone: "IST (UTC+5:30)",
    venueType: "physical",
    venueName: "Valvan Valley Wellness Resort",
    address: "Old Mumbai-Pune Highway, Valvan",
    city: "Lonavala",
    state: "Maharashtra",
    pincode: "410401",
    bannerImage: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=1200&q=80",
    totalCapacity: 30,
    ticketsSold: 0,
    checkedInCount: 0,
    grossRevenue: 0,
    ticketTiers: [
      {
        id: "tier-retreat-twin",
        name: "Twin Sharing Room Pass",
        price: 7500,
        quantity: 20,
        sold: 0,
        status: "available",
        description: "Includes stay for 2 nights, all satvik meals, yoga sessions, and sound bath."
      },
      {
        id: "tier-retreat-private",
        name: "Private Cottage Pass",
        price: 12500,
        quantity: 10,
        sold: 0,
        status: "available",
        description: "Private hill-view cottage with jacuzzi, personal massage session, and full retreat access."
      }
    ],
    cancellationPolicy: {
      refundable: true,
      cutoffDays: 7,
      refundPercentage: 85,
      description: "85% refund if cancelled at least 7 days before check-in."
    },
    organizer: {
      name: "Prana Wellness Collective",
      email: "hello@pranawellness.in",
      phone: "+91 97766 55443",
      avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=150&q=80"
    },
    tags: ["Yoga", "Meditation", "Wellness", "Retreat", "Lonavala"]
  },
  {
    id: "pune-heritage-food-walk",
    title: "Old Pune Heritage & Street Food Trail",
    category: "Food & Heritage",
    status: "completed",
    shortDescription: "Exploring 250-year-old wadas, spice markets, and legendary culinary gems of historic Pune.",
    description: "A 4-hour curated walking journey through the vibrant lanes of Kasba Peth, Raviwar Peth, and Tulshibaug tasting authentic Misal, bakarwadi, mastani, and hearing untold Peshwa history.",
    startDate: "2025-03-01",
    startTime: "07:30",
    endDate: "2025-03-01",
    endTime: "12:00",
    timezone: "IST (UTC+5:30)",
    venueType: "physical",
    venueName: "Shaniwar Wada Main Dilli Darwaza",
    address: "Shaniwar Peth, Pune",
    city: "Pune",
    state: "Maharashtra",
    pincode: "411030",
    bannerImage: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80",
    totalCapacity: 25,
    ticketsSold: 25,
    checkedInCount: 24,
    grossRevenue: 22500,
    ticketTiers: [
      {
        id: "tier-walk-standard",
        name: "Foodie Walker Pass",
        price: 900,
        quantity: 25,
        sold: 25,
        status: "sold_out",
        description: "All 7 food tastings, bottled water, and expert historian guide."
      }
    ],
    cancellationPolicy: {
      refundable: true,
      cutoffDays: 2,
      refundPercentage: 100,
      description: "Full refund 48 hours prior."
    },
    organizer: {
      name: "Pune Heritage Walks",
      email: "info@puneheritagewalks.com",
      phone: "+91 94220 11223",
      avatar: "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=150&q=80"
    },
    tags: ["Heritage", "Food Walk", "Pune", "History", "Street Food"]
  },
  {
    id: "goa-beachside-hackathon",
    title: "Goa 36-Hour Beachside Hackathon",
    category: "Technology & Conferences",
    status: "cancelled",
    shortDescription: "36-hour code sprint by the beach with $10k in prizes, mentors, and midnight bonfire coding.",
    description: "Postponed due to unseasonal coastal storms. All ticket holders have received full 100% automated refunds.",
    startDate: "2025-02-15",
    startTime: "10:00",
    endDate: "2025-02-16",
    endTime: "22:00",
    timezone: "IST (UTC+5:30)",
    venueType: "physical",
    venueName: "Morjim Eco Beach Resort",
    address: "Morjim Beach Road",
    city: "Goa",
    state: "Goa",
    pincode: "403512",
    bannerImage: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80",
    totalCapacity: 120,
    ticketsSold: 120,
    checkedInCount: 0,
    grossRevenue: 0,
    ticketTiers: [
      {
        id: "tier-hacker-single",
        name: "Hacker Pass (Includes Stay)",
        price: 1999,
        quantity: 120,
        sold: 120,
        status: "sold_out",
        description: "Food, redbull, stay, and hackathon swag."
      }
    ],
    cancellationPolicy: {
      refundable: true,
      cutoffDays: 1,
      refundPercentage: 100,
      description: "100% full refund processed upon cancellation."
    },
    organizer: {
      name: "Inveon Tech Community",
      email: "community@inveon.dev",
      phone: "+91 99887 76655",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80"
    },
    tags: ["Hackathon", "Coding", "Goa", "Developers"]
  }
];
