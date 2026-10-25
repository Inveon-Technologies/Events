import 'package:flutter_test/flutter_test.dart';
import 'package:inveon_organizer/api.dart';

void main() {
  test('dashboard parses the organizer API shape', () {
    final d = Dashboard.fromJson({
      'organizerName': 'Sahyadri Treks',
      'totalEvents': 3,
      'upcomingEventsCount': 2,
      'totalBookings': 24,
      'bookingsThisWeek': 5,
      'totalParticipants': 40,
      'revenuePaiseThisMonth': 1240000,
      'checkedInCount': 16,
      'checkedInEligibleCount': 24,
      'upcomingEvents': [
        {
          'id': 'e1',
          'name': 'Trek',
          'eventDate': '2026-10-12T00:30:00.000Z',
          'status': 'published',
          'capacity': 20,
          'bookedCount': 14,
          'revenuePaise': 0,
        },
      ],
      'recentBookings': [
        {
          'id': 'b1',
          'bookingReference': 'INV-1',
          'eventName': 'Trek',
          'customerName': 'Rahul Sharma',
          'ticketCount': 1,
          'totalAmountPaise': 129900,
          'status': 'confirmed',
        },
      ],
      'bookingActivity': [
        {'date': '2026-10-01', 'count': 3},
      ],
    });
    expect(d.upcomingEvents.single.bookedCount, 14);
    expect(d.recentBookings.single.customerName, 'Rahul Sharma');
    expect(d.activity.single, ('2026-10-01', 3));
  });

  test('gate volunteers are recognised', () {
    final u = OrganizerUser.fromJson({'id': 'u1', 'email': 'gate@x.in', 'name': 'Gate', 'role': 'gate_volunteer'});
    expect(u.isGateVolunteer, isTrue);
  });
}
