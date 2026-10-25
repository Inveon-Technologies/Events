import 'package:intl/intl.dart';

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
final _inrPaise = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 2);

/// ₹1,299 (paise in, rupees out; keeps paise only when there are some).
String rupees(num? paise) {
  if (paise == null) return '—';
  final value = paise / 100;
  return value == value.roundToDouble() ? _inr.format(value) : _inrPaise.format(value);
}

/// Events are in India; show IST whatever the phone's zone.
DateTime toIst(String iso) => DateTime.parse(iso).toUtc().add(const Duration(hours: 5, minutes: 30));

String eventDay(String iso) => DateFormat('EEE, d MMM yyyy').format(toIst(iso));
String eventTime(String iso) => '${DateFormat('h:mm a').format(toIst(iso))} IST';
String shortDate(String iso) => DateFormat('d MMM').format(toIst(iso));
String monthShort(String iso) => DateFormat('MMM').format(toIst(iso)).toUpperCase();
String dayNum(String iso) => DateFormat('d').format(toIst(iso));

String timeAgo(String iso) {
  final d = DateTime.now().toUtc().difference(DateTime.parse(iso).toUtc());
  if (d.inMinutes < 1) return 'Just now';
  if (d.inMinutes < 60) return '${d.inMinutes}m ago';
  if (d.inHours < 24) return '${d.inHours}h ago';
  if (d.inDays < 7) return '${d.inDays}d ago';
  return shortDate(iso);
}

String initials(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  return (parts.first[0] + (parts.length > 1 ? parts.last[0] : '')).toUpperCase();
}
