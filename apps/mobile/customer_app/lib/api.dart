import 'package:inveon_core/inveon_core.dart';

// Shapes returned by the public API (apps/api/src/services/publicEvents.ts,
// customerTickets.ts and customerAuth.ts).

class EventSummary {
  EventSummary.fromJson(Map<String, dynamic> j)
    : id = j['id'] as String,
      slug = j['slug'] as String? ?? j['id'] as String,
      name = j['name'] as String,
      tagline = j['tagline'] as String?,
      eventDate = j['eventDate'] as String,
      venueAddress = j['venueAddress'] as String?,
      bannerUrl = j['bannerUrl'] as String?,
      organizerName = j['organizerName'] as String? ?? '',
      minPricePaise = j['minPricePaise'] as int?,
      rating = (j['ratingSummary']?['averageRating'] as num?)?.toDouble(),
      reviewCount = j['ratingSummary']?['reviewCount'] as int? ?? 0;

  final String id;
  final String slug;
  final String name;
  final String? tagline;
  final String eventDate;
  final String? venueAddress;
  final String? bannerUrl;
  final String organizerName;
  final int? minPricePaise;
  final double? rating;
  final int reviewCount;

  String get priceLabel => minPricePaise == null ? 'Sold out' : (minPricePaise == 0 ? 'Free' : rupees(minPricePaise));
  bool matches(String q) {
    final s = q.toLowerCase();
    return name.toLowerCase().contains(s) ||
        (tagline ?? '').toLowerCase().contains(s) ||
        (venueAddress ?? '').toLowerCase().contains(s) ||
        organizerName.toLowerCase().contains(s);
  }
}

class TicketTier {
  TicketTier.fromJson(Map<String, dynamic> j)
    : id = j['id'] as String,
      name = j['name'] as String,
      description = j['description'] as String?,
      pricePaise = j['pricePaise'] as int,
      maxPerBooking = j['maxPerBooking'] as int? ?? 10,
      available = j['available'] as int? ?? 0;

  final String id;
  final String name;
  final String? description;
  final int pricePaise;
  final int maxPerBooking;
  int available;
}

class ScheduleItem {
  ScheduleItem.fromJson(Map<String, dynamic> j)
    : time = j['time'] as String? ?? '',
      title = j['title'] as String? ?? '',
      description = j['description'] as String?;

  final String time;
  final String title;
  final String? description;
}

class EventDetail {
  EventDetail.fromJson(Map<String, dynamic> j)
    : id = j['id'] as String,
      name = j['name'] as String,
      tagline = j['tagline'] as String?,
      description = j['description'] as String?,
      eventDate = j['eventDate'] as String,
      bookingOpen = j['bookingOpen'] == true,
      venueAddress = j['venueAddress'] as String?,
      venueMapUrl = j['venueMapUrl'] as String?,
      bannerUrl = j['bannerUrl'] as String?,
      cancellationPolicy = j['cancellationPolicy'] as String?,
      termsAndConditions = j['termsAndConditions'] as String?,
      genderRestriction = j['genderRestriction'] as String?,
      organizerName = j['organizerName'] as String? ?? '',
      organizerLogoUrl = j['organizerLogoUrl'] as String?,
      photos = (j['media'] as List? ?? const []).where((m) => m['mediaType'] == 'photo').map((m) => m['url'] as String).toList(),
      schedule = (j['scheduleItems'] as List? ?? const []).map((e) => ScheduleItem.fromJson(e as Map<String, dynamic>)).toList(),
      packing = (j['packingChecklist'] as List? ?? const []).map((e) => '${e['item']}').toList(),
      faqs = (j['faqItems'] as List? ?? const []).map((e) => ('${e['question']}', '${e['answer']}')).toList(),
      tiers = (j['ticketCategories'] as List? ?? const []).map((e) => TicketTier.fromJson(e as Map<String, dynamic>)).toList(),
      rating = (j['ratingSummary']?['averageRating'] as num?)?.toDouble(),
      reviewCount = j['ratingSummary']?['reviewCount'] as int? ?? 0;

  final String id;
  final String name;
  final String? tagline;
  final String? description;
  final String eventDate;
  final bool bookingOpen;
  final String? venueAddress;
  final String? venueMapUrl;
  final String? bannerUrl;
  final String? cancellationPolicy;
  final String? termsAndConditions;
  final String? genderRestriction;
  final String organizerName;
  final String? organizerLogoUrl;
  final List<String> photos;
  final List<ScheduleItem> schedule;
  final List<String> packing;
  final List<(String, String)> faqs;
  final List<TicketTier> tiers;
  final double? rating;
  final int reviewCount;

  int? get minPricePaise {
    final open = tiers.where((t) => t.available > 0).map((t) => t.pricePaise).toList()..sort();
    return open.isEmpty ? null : open.first;
  }
}

class BookingSummary {
  BookingSummary.fromJson(Map<String, dynamic> j)
    : bookingReference = j['bookingReference'] as String,
      status = j['bookingStatus'] as String,
      eventId = j['eventId'] as String,
      eventName = j['eventName'] as String,
      eventDate = j['eventDate'] as String,
      bannerUrl = j['bannerUrl'] as String?,
      totalAmountPaise = j['totalAmountPaise'] as int? ?? 0,
      ticketCount = j['ticketCount'] as int? ?? 0,
      ticketPagePath = j['ticketPagePath'] as String;

  final String bookingReference;
  final String status;
  final String eventId;
  final String eventName;
  final String eventDate;
  final String? bannerUrl;
  final int totalAmountPaise;
  final int ticketCount;

  /// `/t/<signed token>`: the booking's ticket page; the API serves the
  /// same data at `/api/t/<token>`.
  final String ticketPagePath;

  bool get upcoming => DateTime.parse(eventDate).isAfter(DateTime.now().subtract(const Duration(hours: 12)));
}

class TicketRow {
  TicketRow.fromJson(Map<String, dynamic> j)
    : id = j['id'] as String,
      displayReference = j['displayReference'] as String? ?? j['ticketReference'] as String,
      attendeeName = j['attendeeName'] as String,
      tierName = j['tierName'] as String,
      status = j['status'] as String,
      certificateUrl = j['certificateUrl'] as String?;

  final String id;
  final String displayReference;
  final String attendeeName;
  final String tierName;
  final String status;
  final String? certificateUrl;
}

class BookingDetail {
  BookingDetail.fromJson(Map<String, dynamic> j, this.ticketPagePath)
    : bookingReference = j['bookingReference'] as String,
      status = j['bookingStatus'] as String,
      eventName = j['eventName'] as String,
      eventTagline = j['eventTagline'] as String?,
      eventDate = j['eventDate'] as String,
      gateOpenTime = j['gateOpenTime'] as String?,
      venueAddress = j['venueAddress'] as String?,
      venueMapUrl = j['venueMapUrl'] as String?,
      bannerUrl = j['ticketBackgroundUrl'] as String? ?? j['bannerUrl'] as String?,
      organizerName = j['organizerName'] as String? ?? '',
      organizerContactPhone = j['organizerContactPhone'] as String?,
      totalAmountPaise = j['totalAmountPaise'] as int? ?? 0,
      paymentMethod = j['paymentMethod'] as String?,
      tickets = (j['tickets'] as List? ?? const []).map((e) => TicketRow.fromJson(e as Map<String, dynamic>)).toList(),
      galleryUrl = j['galleryUrl'] as String?,
      packing = (j['packingChecklist'] as List? ?? const []).map((e) => '${e['item']}').toList();

  final String ticketPagePath;
  final String bookingReference;
  final String status;
  final String eventName;
  final String? eventTagline;
  final String eventDate;
  final String? gateOpenTime;
  final String? venueAddress;
  final String? venueMapUrl;
  final String? bannerUrl;
  final String organizerName;
  final String? organizerContactPhone;
  final int totalAmountPaise;
  final String? paymentMethod;
  final List<TicketRow> tickets;
  final String? galleryUrl;
  final List<String> packing;

  String qrUrl(TicketRow t) => InveonConfig.api('$ticketPagePath/tickets/${t.id}/qr');
  String get pdfUrl => InveonConfig.api('$ticketPagePath/tickets.pdf');
}

class BookingCreated {
  BookingCreated.fromJson(Map<String, dynamic> j)
    : bookingId = j['bookingId'] as String,
      bookingReference = j['bookingReference'] as String,
      paymentSessionId = j['paymentSessionId'] as String?,
      cashfreeMode = j['cashfreeMode'] as String?;

  final String bookingId;
  final String bookingReference;
  final String? paymentSessionId;
  final String? cashfreeMode;
}

class LoginCodeSent {
  LoginCodeSent.fromJson(Map<String, dynamic> j)
    : sentTo = j['sentTo'] as String? ?? '',
      sentToWhatsapp = j['sentToWhatsapp'] as String?,
      resendAfterSeconds = j['resendAfterSeconds'] as int? ?? 60;

  final String sentTo;
  final String? sentToWhatsapp;
  final int resendAfterSeconds;
}

class CustomerApi {
  CustomerApi(this.client);

  final ApiClient client;

  Future<List<EventSummary>> events() async {
    final j = await client.get('/events') as Map<String, dynamic>;
    return (j['events'] as List).map((e) => EventSummary.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<EventDetail> event(String idOrSlug) async => EventDetail.fromJson(await client.get('/events/$idOrSlug') as Map<String, dynamic>);

  /// Live seats left per tier.
  Future<Map<String, int>> availability(String eventId) async {
    final j = await client.get('/events/$eventId/availability') as Map<String, dynamic>;
    return {for (final t in j['tiers'] as List) t['id'] as String: t['available'] as int};
  }

  Future<BookingCreated> createBooking(String eventId, Map<String, dynamic> body) async =>
      BookingCreated.fromJson(await client.post('/events/$eventId/bookings', body) as Map<String, dynamic>);

  /// 'pending' | 'confirmed' | 'cancelled'
  Future<String> bookingStatus(String bookingId) async =>
      (await client.get('/bookings/$bookingId/status') as Map<String, dynamic>)['status'] as String;

  Future<LoginCodeSent> sendLoginCode(String identifier) async =>
      LoginCodeSent.fromJson(await client.post('/bookings/login/initiate', {'identifier': identifier}) as Map<String, dynamic>);

  /// Returns (session token, verified email).
  Future<(String, String)> verifyLoginCode(String identifier, String code) async {
    final j = await client.post('/bookings/login/verify', {'identifier': identifier, 'code': code}) as Map<String, dynamic>;
    return (j['token'] as String, j['email'] as String);
  }

  Future<List<BookingSummary>> myBookings() async {
    final j = await client.get('/bookings/my') as Map<String, dynamic>;
    return (j['bookings'] as List).map((e) => BookingSummary.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<BookingDetail> bookingDetail(String ticketPagePath) async =>
      BookingDetail.fromJson(await client.get(ticketPagePath) as Map<String, dynamic>, ticketPagePath);
}
