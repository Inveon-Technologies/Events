export const INITIAL_SETTINGS = {
  account: {
    fullName: "Eeshan Agrawal",
    email: "eeshan.agrawal@inveon.dev",
    phone: "+91 98765 43210",
    role: "Lead Event Director & Admin",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80",
    bio: "Passionate community builder and outdoor trek lead with over 8 years managing high-scale events.",
    language: "English (US)",
    timezone: "Asia/Kolkata (IST +5:30)"
  },
  organization: {
    name: "Inveon Experiences & Events LLP",
    brandSlug: "inveon-events",
    category: "Adventure, Entertainment & Tech",
    supportEmail: "support@inveonevents.com",
    supportPhone: "+91 20 6712 8900",
    website: "https://inveon.dev",
    gstNumber: "27AABCI9821K1ZM",
    address: "Level 4, Panchshil Business Park, Balewadi High Street",
    city: "Pune",
    state: "Maharashtra",
    pincode: "411045",
    country: "India",
    team: [
      { id: "tm-1", name: "Eeshan Agrawal", email: "eeshan@inveon.dev", role: "Owner", status: "active" },
      { id: "tm-2", name: "Priya Sharma", email: "priya.s@inveon.dev", role: "Finance Manager", status: "active" },
      { id: "tm-3", name: "Aditya Patil", email: "aditya.p@inveon.dev", role: "Check-in Lead", status: "active" },
      { id: "tm-4", name: "Tanvi Mehta", email: "tanvi.m@inveon.dev", role: "Marketing & Comms", status: "invited" }
    ]
  },
  security: {
    twoFactorEnabled: true,
    twoFactorMethod: "Authenticator App (TOTP)",
    activeSessions: [
      { device: "Chrome on Windows 11 (Current)", location: "Pune, India", ip: "103.21.144.12", lastActive: "Now" },
      { device: "Safari on iPhone 15 Pro", location: "Pune, India", ip: "103.21.144.98", lastActive: "4 hours ago" },
      { device: "Firefox on MacOS", location: "Mumbai, India", ip: "49.36.12.7", lastActive: "3 days ago" }
    ],
    apiKeys: [
      { name: "Website Booking Widget", key: "inv_live_99a8b7c6d5e4...", created: "2025-01-10", lastUsed: "12 mins ago" },
      { name: "Check-In Scanner App", key: "inv_live_1122334455aa...", created: "2025-02-01", lastUsed: "Yesterday" }
    ]
  },
  notifications: {
    emailOnNewBooking: true,
    emailOnCancellation: true,
    emailDailyDigest: false,
    smsOnUrgentIssues: true,
    whatsappTicketAlerts: true,
    browserPushEnabled: true,
    payoutAlerts: true
  }
};
