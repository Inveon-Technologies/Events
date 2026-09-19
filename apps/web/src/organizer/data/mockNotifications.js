export const INITIAL_NOTIFICATIONS = [
  {
    id: "notif-1",
    title: "New Booking Received",
    message: "Aarav Sharma booked 2x 'General Trekker Pass' for Rajgad Sunrise Trek (₹3,000).",
    timestamp: "10 minutes ago",
    category: "bookings",
    read: false,
    link: "/organizer/bookings"
  },
  {
    id: "notif-2",
    title: "Payout Initiated",
    message: "A payout of ₹3,20,000 is currently processing to your HDFC Bank account.",
    timestamp: "2 hours ago",
    category: "payments",
    read: false,
    link: "/organizer/payments"
  },
  {
    id: "notif-3",
    title: "Ticket Tier Sold Out",
    message: "'Early Bird Trekker' tier for Rajgad Sunrise Trek is now 100% sold out (20/20).",
    timestamp: "5 hours ago",
    category: "events",
    read: true,
    link: "/organizer/events/rajgad-sunrise-trek/tickets"
  },
  {
    id: "notif-4",
    title: "Cancellation Request",
    message: "Vikram Jadhav requested refund for booking #BK-89215.",
    timestamp: "1 day ago",
    category: "cancellations",
    read: true,
    link: "/organizer/cancellations-refunds"
  },
  {
    id: "notif-5",
    title: "Security Alert",
    message: "New organizer login from Chrome on Windows 11 (Pune, India).",
    timestamp: "2 days ago",
    category: "security",
    read: true,
    link: "/organizer/settings/security"
  }
];
