import 'package:flutter/material.dart';
import 'package:inveon_core/inveon_core.dart';

import '../api.dart';
import '../services.dart';
import '../widgets/event_cards.dart';

enum _Filter { all, weekend, free, under1000, thisMonth }

/// Search and filter every published event.
class ExploreScreen extends StatefulWidget {
  const ExploreScreen({super.key, this.autofocus = false});

  final bool autofocus;

  @override
  State<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends State<ExploreScreen> {
  String _query = '';
  _Filter _filter = _Filter.all;

  static const _labels = {
    _Filter.all: 'All',
    _Filter.weekend: 'This weekend',
    _Filter.thisMonth: 'This month',
    _Filter.free: 'Free',
    _Filter.under1000: 'Under ₹1,000',
  };

  bool _keep(EventSummary e) {
    if (_query.isNotEmpty && !e.matches(_query)) return false;
    final date = toIst(e.eventDate);
    final now = toIst(DateTime.now().toUtc().toIso8601String());
    return switch (_filter) {
      _Filter.all => true,
      _Filter.free => e.minPricePaise == 0,
      _Filter.under1000 => e.minPricePaise != null && e.minPricePaise! <= 100000,
      _Filter.thisMonth => date.year == now.year && date.month == now.month,
      _Filter.weekend => date.difference(now).inDays <= 7 && (date.weekday == DateTime.saturday || date.weekday == DateTime.sunday),
    };
  }

  @override
  Widget build(BuildContext context) {
    final services = Services.of(context);
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Explore'), automaticallyImplyLeading: Navigator.of(context).canPop()),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
            child: TextField(
              autofocus: widget.autofocus,
              onChanged: (v) => setState(() => _query = v.trim()),
              decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Search events, places, organizers'),
            ),
          ),
          SizedBox(
            height: 44,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: [
                for (final f in _Filter.values)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(_labels[f]!),
                      selected: _filter == f,
                      showCheckmark: false,
                      labelStyle: TextStyle(color: _filter == f ? Colors.white : InveonColors.midnight, fontWeight: FontWeight.w600),
                      onSelected: (_) => setState(() => _filter = f),
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: AsyncView<List<EventSummary>>(
              load: services.api.events,
              builder: (context, events, _) {
                final list = events.where(_keep).toList();
                if (list.isEmpty) {
                  return ListView(
                    children: const [
                      SizedBox(
                        height: 420,
                        child: EmptyState(
                          icon: Icons.search_off_rounded,
                          title: 'No events match',
                          message: 'Try another search or filter.',
                        ),
                      ),
                    ],
                  );
                }
                return ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
                  itemCount: list.length + 1,
                  itemBuilder: (context, i) {
                    if (i == 0) {
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Text(
                          '${list.length} event${list.length == 1 ? '' : 's'}',
                          style: text.labelLarge?.copyWith(color: InveonColors.slate),
                        ),
                      );
                    }
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: CompactEventCard(event: list[i - 1]).staggered(i),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
