export const INITIAL_PAYMENTS = {
  summary: {
    totalRevenue: 2386500,
    availablePayout: 842100,
    pendingPayout: 125000,
    refundedAmount: 48500,
    platformFeePercent: 3.5,
    gstPercent: 18
  },
  payouts: [
    {
      id: "PO-7701",
      date: "2025-04-01",
      amount: 450000,
      status: "completed", // completed | processing | failed
      bankAccount: "HDFC Bank ending in •••• 4912",
      reference: "UTR98231209384",
      eventName: "March Events Consolidated Payout"
    },
    {
      id: "PO-7702",
      date: "2025-04-15",
      amount: 320000,
      status: "processing",
      bankAccount: "HDFC Bank ending in •••• 4912",
      reference: "UTR Pending Bank Batch",
      eventName: "Rajgad Sunrise Trek Cycle 1"
    }
  ],
  transactions: [
    {
      id: "TXN-109283",
      date: "2025-04-04 18:41",
      bookingId: "BK-89213",
      customerName: "Rohan Kulkarni",
      eventName: "Rajgad Sunrise Trek",
      amount: 4400,
      gatewayFee: 88,
      platformFee: 154,
      netAmount: 4158,
      paymentMethod: "UPI (Google Pay)",
      status: "settled"
    },
    {
      id: "TXN-109282",
      date: "2025-04-03 09:16",
      bookingId: "BK-89212",
      customerName: "Pooja Deshmukh",
      eventName: "Rajgad Sunrise Trek",
      amount: 3897,
      gatewayFee: 78,
      platformFee: 136,
      netAmount: 3683,
      paymentMethod: "Credit Card (Visa)",
      status: "settled"
    },
    {
      id: "TXN-109281",
      date: "2025-04-02 14:24",
      bookingId: "BK-89211",
      customerName: "Aarav Sharma",
      eventName: "Rajgad Sunrise Trek",
      amount: 3000,
      gatewayFee: 60,
      platformFee: 105,
      netAmount: 2835,
      paymentMethod: "UPI (PhonePe)",
      status: "settled"
    },
    {
      id: "TXN-109280",
      date: "2025-04-06 17:00",
      bookingId: "BK-89215",
      customerName: "Vikram Jadhav",
      eventName: "Rajgad Sunrise Trek",
      amount: -2078,
      gatewayFee: 0,
      platformFee: -72,
      netAmount: -2078,
      paymentMethod: "Refund to Source",
      status: "refunded"
    }
  ]
};
