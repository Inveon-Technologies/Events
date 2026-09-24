import React, { useEffect, useState } from 'react';
import { useParams, NavLink } from 'react-router-dom';
import { Ticket, Plus, Edit2, Trash2, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useEvents } from '../../context/EventsContext';
import { useNotifications } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { apiRequest, ApiError } from '../../lib/api';
import StatusBadge from '../../components/common/StatusBadge';
import Modal from '../../components/common/Modal';

export default function EventTickets() {
  const { id } = useParams();
  const { events, updateEvent } = useEvents();
  const { showToast } = useNotifications();
  const { user } = useAuth();

  const eventId = id || 'rajgad-sunrise-trek';
  const event = events.find((e) => e.id === eventId) || events[0];

  // The events list (useEvents' `events`) never carries tier detail —
  // it's built for the list view, not per-tier editing. Real tiers
  // (with their real ids, needed so an edit updates a tier in place
  // instead of the backend reading it as a brand new one) come from a
  // direct fetch of this one event's real detail.
  const [realTiers, setRealTiers] = useState(null);
  const [loadingTiers, setLoadingTiers] = useState(true);

  async function loadRealTiers() {
    if (!event?.id) return;
    setLoadingTiers(true);
    try {
      const detail = await apiRequest(`/organizer/events/${event.id}`, { token: user?.token });
      setRealTiers(detail.ticketTiers || []);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not load ticket tiers.', 'error');
    } finally {
      setLoadingTiers(false);
    }
  }

  useEffect(() => {
    loadRealTiers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTier, setNewTier] = useState({
    name: '',
    price: 999,
    quantity: 20,
    description: ''
  });

  const handleAddTier = async (e) => {
    e.preventDefault();
    // Every real existing tier, carrying its real id so the backend
    // updates it in place, plus the new one with no id at all (a
    // client-side placeholder id here would make the backend reject
    // the whole request as editing a tier that doesn't exist).
    const submittedTiers = [
      ...(realTiers || []).map((tier) => ({ id: tier.id, name: tier.name, description: tier.description, price: tier.price, quantity: tier.quantity })),
      { name: newTier.name, description: newTier.description, price: Number(newTier.price), quantity: Number(newTier.quantity) },
    ];
    const ok = await updateEvent(event.id, { ticketTiers: submittedTiers });
    if (ok) {
      showToast(`Added new tier: ${newTier.name}`, 'success');
      setIsModalOpen(false);
      setNewTier({ name: '', price: 999, quantity: 20, description: '' });
      await loadRealTiers();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            Ticket Tiers & Capacities — {event.title}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure passes, ticket quotas, early bird discounts, and sale limits.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-lg shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Add Ticket Pass</span>
        </button>
      </div>

      {/* Sub Navigation Bar for this event */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-slate-200 pb-2">
        <NavLink to={`/organizer/events/${event.id}/dashboard`} className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Event Overview</NavLink>
        <NavLink to={`/organizer/events/${event.id}/bookings`} className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Bookings</NavLink>
        <NavLink to={`/organizer/events/${event.id}/participants`} className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Attendee Roster</NavLink>
        <NavLink to={`/organizer/events/${event.id}/payments`} className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100">Financials</NavLink>
        <NavLink to={`/organizer/events/${event.id}/tickets`} className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-brand-600 text-white">Ticket Tiers</NavLink>
      </div>

      {/* Ticket Tier Cards Grid */}
      {loadingTiers ? (
        <p className="text-xs text-slate-500">Loading ticket tiers…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {(realTiers || []).map((tier) => {
            const percent = Math.min(100, Math.round((tier.sold / tier.quantity) * 100));

            return (
              <div key={tier.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black text-slate-900 bg-slate-100 px-2.5 py-1 rounded-md">
                      ₹{tier.price}
                    </span>
                    <StatusBadge status={tier.sold >= tier.quantity ? 'sold_out' : 'available'} />
                  </div>
                  <h3 className="text-base font-bold text-slate-900">{tier.name}</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{tier.description}</p>
                </div>

                <div className="space-y-2 pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Sales Progress</span>
                    <span className="font-bold text-slate-800">{tier.sold} / {tier.quantity} ({percent}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full ${percent >= 100 ? 'bg-slate-700' : 'bg-brand-600'}`}
                      style={{ width: `${percent}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Tier Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Create New Ticket Tier">
        <form onSubmit={handleAddTier} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Tier / Pass Name</label>
            <input
              type="text"
              required
              value={newTier.name}
              onChange={(e) => setNewTier({ ...newTier, name: e.target.value })}
              placeholder="e.g. VIP Backstage Pass"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Price (₹ INR)</label>
              <input
                type="number"
                required
                value={newTier.price}
                onChange={(e) => setNewTier({ ...newTier, price: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Ticket Allotment Quota</label>
              <input
                type="number"
                required
                value={newTier.quantity}
                onChange={(e) => setNewTier({ ...newTier, quantity: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Description & Inclusions</label>
            <textarea
              rows={3}
              value={newTier.description}
              onChange={(e) => setNewTier({ ...newTier, description: e.target.value })}
              placeholder="e.g. Front row seating, buffet dinner, merchandise..."
              className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            ></textarea>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-bold bg-brand-600 hover:bg-brand-700 text-white rounded-lg shadow-sm"
            >
              Create Ticket Tier
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
