import React, { useState } from 'react';
import { useParams, NavLink, useNavigate } from 'react-router-dom';
import {
  Calendar,
  Clock,
  MapPin,
  ShieldCheck,
  Share2,
  Bookmark,
  Users,
  Check,
  ChevronLeft,
  Ticket,
  AlertCircle,
  ExternalLink,
  Sparkles
} from 'lucide-react';
import { useEvents } from '../../context/EventsContext';
import { useNotifications } from '../../context/NotificationContext';
import StatusBadge from '../../components/common/StatusBadge';

export default function EventPreview() {
  const { id } = useParams();
  const { events } = useEvents();
  const { showToast } = useNotifications();
  const navigate = useNavigate();

  const event = events.find(e => e.id === id) || events[0];
  const [selectedTier, setSelectedTier] = useState(event?.ticketTiers?.[0]?.id || '');
  const [quantity, setQuantity] = useState(1);

  if (!event) {
    return (
      <div className="text-center py-16">
        <h2 className="text-lg font-bold">Event not found</h2>
        <NavLink to="/organizer/events" className="text-xs text-brand-600 mt-2 inline-block">Return to events</NavLink>
      </div>
    );
  }

  const activeTier = event.ticketTiers?.find(t => t.id === selectedTier) || event.ticketTiers?.[0];
  const totalPrice = (activeTier?.price || 0) * quantity;

  const handleBookDemo = () => {
    showToast(`Simulation: ${quantity}x ${activeTier?.name} added to cart for ₹${totalPrice.toLocaleString('en-IN')}`, 'success');
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Top Breadcrumb & Organizer Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
        <div className="flex items-center gap-2">
          <NavLink
            to={`/organizer/events/${event.id}/dashboard`}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-brand-600"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back to Organizer Workspace</span>
          </NavLink>
          <span className="text-slate-300">|</span>
          <span className="text-xs text-slate-500 font-medium">Public Event Page Preview</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href);
              showToast('Event link copied to clipboard!', 'info');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Share</span>
          </button>
          <NavLink
            to={`/organizer/events/${event.id}/dashboard`}
            className="px-3 py-1.5 text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white rounded-lg"
          >
            Manage Event
          </NavLink>
        </div>
      </div>

      {/* Hero Banner with Details */}
      <div className="relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 shadow-xl">
        <img
          src={event.bannerImage}
          alt={event.title}
          className="w-full h-72 sm:h-96 object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent"></div>

        <div className="absolute bottom-6 left-6 right-6 text-white space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-600 text-white shadow-xs">
              {event.category}
            </span>
            <StatusBadge status={event.status} />
          </div>

          <h1 className="text-2xl sm:text-4xl font-black tracking-tight">{event.title}</h1>

          <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm text-slate-200 pt-1">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-cyan-400" />
              <span>{event.startDate} to {event.endDate}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-cyan-400" />
              <span>{event.startTime} - {event.endTime} {event.timezone}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-cyan-400" />
              <span>{event.venueName}, {event.city}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Details on Left, Booking Box on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols */}
        <div className="lg:col-span-2 space-y-6">
          {/* About Section */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">About this Event</h2>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed whitespace-pre-line">
              {event.description}
            </p>

            {event.tags && (
              <div className="pt-4 border-t border-slate-100 flex flex-wrap gap-1.5">
                {event.tags.map((tag) => (
                  <span key={tag} className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md text-xs font-medium">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Location & Map Section */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-3">
            <h2 className="text-lg font-bold text-slate-900">Date, Time & Venue</h2>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-3 text-xs text-slate-700">
              <MapPin className="w-5 h-5 text-brand-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-slate-900 text-sm">{event.venueName}</p>
                <p className="mt-0.5 text-slate-600">{event.address}</p>
                <p className="mt-0.5 text-slate-500">{event.city}, {event.state} - {event.pincode}</p>
              </div>
            </div>
          </div>

          {/* Organizer Bio */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <img
                src={event.organizer?.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80"}
                alt={event.organizer?.name}
                className="w-12 h-12 rounded-full object-cover ring-2 ring-brand-100"
              />
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Hosted by</span>
                <h4 className="text-sm font-bold text-slate-900">{event.organizer?.name}</h4>
                <p className="text-xs text-slate-500">{event.organizer?.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg font-semibold border border-emerald-200">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Verified Host</span>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Ticket Selection Box */}
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md space-y-5 sticky top-24">
            <div>
              <h3 className="text-base font-bold text-slate-900">Select Tickets</h3>
              <p className="text-xs text-slate-500 mt-0.5">Instant booking confirmation with QR pass.</p>
            </div>

            {/* Ticket Tier Selection */}
            <div className="space-y-2.5">
              {event.ticketTiers?.map((tier) => (
                <div
                  key={tier.id}
                  onClick={() => setSelectedTier(tier.id)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    selectedTier === tier.id
                      ? 'border-brand-600 bg-blue-50/40 ring-1 ring-brand-600'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-900">{tier.name}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">{tier.description}</p>
                    </div>
                    <span className="text-sm font-black text-slate-900 shrink-0 ml-2">₹{tier.price}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Quantity Selector */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
              <span className="font-semibold text-slate-700">Quantity</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-7 h-7 rounded-md border border-slate-200 text-slate-700 font-bold hover:bg-slate-50"
                >
                  -
                </button>
                <span className="font-bold text-sm w-4 text-center">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity(Math.min(10, quantity + 1))}
                  className="w-7 h-7 rounded-md border border-slate-200 text-slate-700 font-bold hover:bg-slate-50"
                >
                  +
                </button>
              </div>
            </div>

            {/* Total Price */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <span className="text-xs text-slate-500 font-medium">Total Amount</span>
              <span className="text-xl font-black text-slate-900">₹{totalPrice.toLocaleString('en-IN')}</span>
            </div>

            {/* Action CTA */}
            <button
              onClick={handleBookDemo}
              className="w-full py-3 px-4 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
            >
              <Ticket className="w-4 h-4" />
              <span>Proceed to Checkout</span>
            </button>

            {/* Cancellation Note */}
            {event.cancellationPolicy && (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-500 leading-tight">
                <span className="font-semibold text-slate-700">Cancellation Policy: </span>
                {event.cancellationPolicy.description}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
