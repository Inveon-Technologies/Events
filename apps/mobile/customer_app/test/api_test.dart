import 'package:flutter_test/flutter_test.dart';
import 'package:inveon_events/api.dart';

void main() {
  test('event detail parses the public API shape', () {
    final e = EventDetail.fromJson({
      'id': 'e1',
      'name': 'Trek to Sahyadri',
      'eventDate': '2026-12-12T00:00:00.000Z',
      'bookingOpen': true,
      'media': [
        {'id': 'm1', 'mediaType': 'photo', 'url': '/api/uploads/a.jpg'},
        {'id': 'm2', 'mediaType': 'video', 'url': '/api/uploads/b.mp4'},
      ],
      'scheduleItems': [
        {'time': '05:30', 'title': 'Assemble at base'},
      ],
      'packingChecklist': [
        {'item': 'Water', 'mandatory': true},
      ],
      'faqItems': [
        {'question': 'Food?', 'answer': 'Breakfast included'},
      ],
      'ticketCategories': [
        {'id': 't1', 'name': 'Standard', 'pricePaise': 129900, 'maxPerBooking': 5, 'available': 0},
        {'id': 't2', 'name': 'Early', 'pricePaise': 99900, 'maxPerBooking': 5, 'available': 4},
      ],
      'ratingSummary': {'averageRating': 4.8, 'reviewCount': 12},
    });
    expect(e.photos, ['/api/uploads/a.jpg']);
    expect(e.schedule.single.title, 'Assemble at base');
    expect(e.minPricePaise, 99900);
    expect(e.rating, 4.8);
  });

  test('a sold-out event has no starting price', () {
    final s = EventSummary.fromJson({'id': 'e1', 'name': 'X', 'eventDate': '2026-12-12T00:00:00.000Z', 'minPricePaise': null});
    expect(s.priceLabel, 'Sold out');
  });

  test('ticket QR and PDF urls use the signed ticket page path', () {
    final d = BookingDetail.fromJson({
      'bookingReference': 'INV-1',
      'bookingStatus': 'confirmed',
      'eventName': 'X',
      'eventDate': '2026-12-12T00:00:00.000Z',
      'tickets': [
        {'id': 'tk1', 'ticketReference': 'R1', 'attendeeName': 'Asha', 'tierName': 'Standard', 'status': 'valid'},
      ],
    }, '/t/abc');
    expect(d.qrUrl(d.tickets.single), endsWith('/api/t/abc/tickets/tk1/qr'));
    expect(d.pdfUrl, endsWith('/api/t/abc/tickets.pdf'));
  });
}
