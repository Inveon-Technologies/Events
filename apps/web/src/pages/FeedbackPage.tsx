import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Button } from '../components/Button';

export function FeedbackPage() {
  const { bookingReference: refFromUrl } = useParams();
  const [bookingReference, setBookingReference] = useState(refFromUrl || '');
  const [email, setEmail] = useState('');
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!bookingReference.trim() || !email.trim()) {
      setError('Enter your Booking ID and the email used to book.');
      return;
    }
    if (rating < 1) {
      setError('Please select a star rating.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(bookingReference.trim())}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), rating, reviewText: reviewText.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }
      setSubmitted(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <Layout>
        <div className="max-w-md mx-auto px-4 sm:px-6 py-16 text-center">
          <span className="inline-flex w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 items-center justify-center mb-4">
            <Icon name="check_circle" className="text-3xl" filled />
          </span>
          <h1 className="text-xl font-bold text-ink mb-2">Thanks for your feedback!</h1>
          <p className="text-sm text-ink-muted mb-8">Your rating helps other travellers and the organizer improve future trips.</p>
          <Link to="/">
            <Button variant="outline">Back to Home</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-md mx-auto px-4 sm:px-6 py-12">
        <h1 className="text-2xl font-bold text-ink mb-2 text-center">Rate your experience</h1>
        <p className="text-sm text-ink-muted text-center mb-8">
          Feedback is only accepted for confirmed bookings after the event has taken place.
        </p>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-card p-6 space-y-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-muted">Booking ID</span>
            <input
              value={bookingReference}
              onChange={(e) => setBookingReference(e.target.value)}
              placeholder="INV-BKG-2026-AB12CD"
              className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-muted">Email used to book</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-muted">Your rating</span>
            <div className="flex items-center gap-1" role="radiogroup" aria-label="Star rating">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  role="radio"
                  aria-checked={rating === star}
                  aria-label={`${star} star${star > 1 ? 's' : ''}`}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-0.5"
                >
                  <Icon
                    name="star"
                    filled={star <= (hoverRating || rating)}
                    className={`text-3xl ${star <= (hoverRating || rating) ? 'text-amber-400' : 'text-slate-300'}`}
                  />
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-muted">Review (optional)</span>
            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              rows={4}
              placeholder="Tell other travellers about your experience..."
              className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </label>

          {error && <p className="text-xs text-danger-600">{error}</p>}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit Feedback'}
          </Button>
        </form>
      </div>
    </Layout>
  );
}
