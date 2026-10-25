import 'package:inveon_core/inveon_core.dart';

// Shapes from the organizer API (apps/api/src/services/organizer*.ts).

class OrganizerUser {
  OrganizerUser.fromJson(Map<String, dynamic> j)
    : id = j['id'] as String,
      email = j['email'] as String,
      name = j['name'] as String? ?? '',
      role = j['role'] as String;

  final String id;
  final String email;
  final String name;

  /// organizer_owner | organizer_staff | gate_volunteer
  final String role;

  bool get isGateVolunteer => role == 'gate_volunteer';
  Map<String, dynamic> toJson() => {'id': id, 'email': email, 'name': name, 'role': role};
}

class DashboardEvent {
  DashboardEvent.fromJson(Map<String, dynamic> j)
    : id = j['id'] as String,
      name = j['name'] as String,
      eventDate = j['eventDate'] as String,
      venueAddress = j['venueAddress'] as String?,
      bannerUrl = j['bannerUrl'] as String?,
      status = j['status'] as String,
      capacity = j['capacity'] as int? ?? 0,
      bookedCount = j['bookedCount'] as int? ?? 0,
      revenuePaise = j['revenuePaise'] as int? ?? 0;

  final String id;
  final String name;
  final String eventDate;
  final String? venueAddress;
  final String? bannerUrl;
  final String status;
  final int capacity;
  final int bookedCount;
  final int revenuePaise;
}

class DashboardBooking {
  DashboardBooking.fromJson(Map<String, dynamic> j)
    : id = j['id'] as String,
      bookingReference = j['bookingReference'] as String,
      eventName = j['eventName'] as String,
      customerName = j['customerName'] as String,
      ticketCount = j['ticketCount'] as int? ?? 0,
      totalAmountPaise = j['totalAmountPaise'] as int? ?? 0,
      status = j['status'] as String;

  final String id;
  final String bookingReference;
  final String eventName;
  final String customerName;
  final int ticketCount;
  final int totalAmountPaise;
  final String status;
}

class Dashboard {
  Dashboard.fromJson(Map<String, dynamic> j)
    : organizerName = j['organizerName'] as String? ?? '',
      totalEvents = j['totalEvents'] as int? ?? 0,
      upcomingEventsCount = j['upcomingEventsCount'] as int? ?? 0,
      totalBookings = j['totalBookings'] as int? ?? 0,
      bookingsThisWeek = j['bookingsThisWeek'] as int? ?? 0,
      totalParticipants = j['totalParticipants'] as int? ?? 0,
      revenuePaiseThisMonth = j['revenuePaiseThisMonth'] as int? ?? 0,
      checkedInCount = j['checkedInCount'] as int? ?? 0,
      checkedInEligibleCount = j['checkedInEligibleCount'] as int? ?? 0,
      upcomingEvents = (j['upcomingEvents'] as List? ?? const []).map((e) => DashboardEvent.fromJson(e as Map<String, dynamic>)).toList(),
      recentBookings = (j['recentBookings'] as List? ?? const []).map((e) => DashboardBooking.fromJson(e as Map<String, dynamic>)).toList(),
      activity = (j['bookingActivity'] as List? ?? const []).map((e) => (e['date'] as String, e['count'] as int)).toList();

  final String organizerName;
  final int totalEvents;
  final int upcomingEventsCount;
  final int totalBookings;
  final int bookingsThisWeek;
  final int totalParticipants;
  final int revenuePaiseThisMonth;
  final int checkedInCount;
  final int checkedInEligibleCount;
  final List<DashboardEvent> upcomingEvents;
  final List<DashboardBooking> recentBookings;
  final List<(String, int)> activity;
}

class OrganizerEvent {
  OrganizerEvent.fromJson(Map<String, dynamic> j)
    : id = j['id'] as String,
      eventCode = j['eventCode'] as String? ?? '',
      name = j['name'] as String,
      eventDate = j['eventDate'] as String,
      venueAddress = j['venueAddress'] as String?,
      bannerUrl = j['bannerUrl'] as String?,
      capacity = j['capacity'] as int? ?? 0,
      ticketsSold = j['ticketsSold'] as int? ?? 0,
      checkedInCount = j['checkedInCount'] as int? ?? 0,
      revenuePaise = j['revenuePaise'] as int? ?? 0,
      status = j['displayStatus'] as String;

  final String id;
  final String eventCode;
  final String name;
  final String eventDate;
  final String? venueAddress;
  final String? bannerUrl;
  final int capacity;
  final int ticketsSold;
  int checkedInCount;
  final int revenuePaise;

  /// draft | published | completed | cancelled
  final String status;
}

class EventsPage {
  EventsPage.fromJson(Map<String, dynamic> j)
    : counts = (j['counts'] as Map? ?? const {}).map((k, v) => MapEntry('$k', v as int)),
      events = (j['events'] as List? ?? const []).map((e) => OrganizerEvent.fromJson(e as Map<String, dynamic>)).toList();

  final Map<String, int> counts;
  final List<OrganizerEvent> events;
}

class OrganizerBooking {
  OrganizerBooking.fromJson(Map<String, dynamic> j)
    : id = j['id'] as String,
      bookingReference = j['bookingReference'] as String,
      customerName = j['customerName'] as String,
      customerEmail = j['customerEmail'] as String? ?? '',
      customerPhone = j['customerPhone'] as String? ?? '',
      eventName = j['eventName'] as String,
      tiers = j['ticketTierNames'] as String? ?? '',
      ticketCount = j['ticketCount'] as int? ?? 0,
      totalAmountPaise = j['totalAmountPaise'] as int? ?? 0,
      paymentStatus = j['paymentStatus'] as String?,
      status = j['displayStatus'] as String,
      createdAt = j['createdAt'] as String;

  final String id;
  final String bookingReference;
  final String customerName;
  final String customerEmail;
  final String customerPhone;
  final String eventName;
  final String tiers;
  final int ticketCount;
  final int totalAmountPaise;
  final String? paymentStatus;
  final String status;
  final String createdAt;
}

class BookingsPage {
  BookingsPage.fromJson(Map<String, dynamic> j)
    : counts = (j['counts'] as Map? ?? const {}).map((k, v) => MapEntry('$k', v as int)),
      bookings = (j['bookings'] as List? ?? const []).map((e) => OrganizerBooking.fromJson(e as Map<String, dynamic>)).toList(),
      total = j['pagination']?['total'] as int? ?? 0;

  final Map<String, int> counts;
  final List<OrganizerBooking> bookings;
  final int total;
}

class TicketMatch {
  TicketMatch.fromJson(Map<String, dynamic> j)
    : id = j['id'] as String,
      attendeeName = j['attendeeName'] as String,
      tierName = j['tierName'] as String,
      bookingReference = j['bookingReference'] as String,
      status = j['status'] as String;

  final String id;
  final String attendeeName;
  final String tierName;
  final String bookingReference;
  final String status;
}

class CheckIn {
  CheckIn({required this.ticketId, required this.attendeeName, required this.tierName, required this.bookingReference, required this.at});

  CheckIn.fromJson(Map<String, dynamic> j)
    : ticketId = j['ticketId'] as String,
      attendeeName = j['attendeeName'] as String,
      tierName = j['tierName'] as String,
      bookingReference = j['bookingReference'] as String,
      at = j['checkedInAt'] as String;

  final String ticketId;
  final String attendeeName;
  final String tierName;
  final String bookingReference;
  final String at;
}

class ActivityItem {
  ActivityItem.fromJson(Map<String, dynamic> j)
    : category = j['category'] as String,
      title = j['title'] as String,
      message = j['message'] as String,
      createdAt = j['createdAt'] as String;

  final String category;
  final String title;
  final String message;
  final String createdAt;
}

class OrganizerApi {
  OrganizerApi(this.client);

  final ApiClient client;

  Future<(String, OrganizerUser)> login(String email, String password) async {
    final j = await client.post('/auth/login', {'email': email, 'password': password}) as Map<String, dynamic>;
    return (j['token'] as String, OrganizerUser.fromJson(j['user'] as Map<String, dynamic>));
  }

  Future<Dashboard> dashboard() async => Dashboard.fromJson(await client.get('/organizer/dashboard') as Map<String, dynamic>);

  Future<EventsPage> events({String status = 'all'}) async =>
      EventsPage.fromJson(await client.get('/organizer/events', query: {'status': status}) as Map<String, dynamic>);

  Future<BookingsPage> bookings({String? eventId, String status = 'all', String? search, int page = 1}) async => BookingsPage.fromJson(
    await client.get(
      '/organizer/bookings',
      query: {'eventId': eventId, 'status': status, 'search': search, 'page': '$page', 'pageSize': '25'},
    ) as Map<String, dynamic>,
  );

  Future<CheckIn> checkInQr(String eventId, String qrToken) async =>
      CheckIn.fromJson(await client.post('/organizer/events/$eventId/checkin', {'qrToken': qrToken}) as Map<String, dynamic>);

  Future<CheckIn> checkInTicket(String eventId, String ticketId) async =>
      CheckIn.fromJson(await client.post('/organizer/events/$eventId/checkin/ticket/$ticketId') as Map<String, dynamic>);

  Future<void> undoCheckIn(String eventId, String ticketId) => client.post('/organizer/events/$eventId/checkin/$ticketId/undo');

  /// Ticket search for manual check-in (owners and staff).
  Future<List<TicketMatch>> findTickets(String eventId, String search) async {
    final j = await client.get('/organizer/tickets', query: {'eventId': eventId, 'search': search}) as Map<String, dynamic>;
    return (j['tickets'] as List).map((e) => TicketMatch.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<ActivityItem>> activity() async {
    final j = await client.get('/organizer/notifications') as Map<String, dynamic>;
    return (j['notifications'] as List).map((e) => ActivityItem.fromJson(e as Map<String, dynamic>)).toList();
  }
}
