import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { load as loadCashfree } from '@cashfreepayments/cashfree-js';
import { Layout } from '../components/Layout';
import { Icon } from '../components/Icon';

// The mobile app's online payment. The app creates the booking through the
// API, then opens /pay?session=…&mode=… in a browser tab, and this page hands
// off to Cashfree's hosted checkout. The native Cashfree SDK refuses to run
// in apps that weren't installed from the Play Store, but a browser checkout
// works for any install. Cashfree then sends the browser to the return_url
// the API set on the order, and the app reads the booking's status itself.
export function PaymentHandoffPage() {
  const [params] = useSearchParams();
  const [error, setError] = useState('');
  const session = params.get('session') ?? '';
  const mode = params.get('mode') === 'production' ? 'production' : 'sandbox';

  useEffect(() => {
    if (!session) {
      setError('This payment link is incomplete. Go back to the app and try again.');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const cashfree = await loadCashfree({ mode });
        const result = await cashfree?.checkout({ paymentSessionId: session, redirectTarget: '_self' });
        if (!cancelled && result?.error) setError(result.error.message || 'Payment could not be started.');
      } catch {
        if (!cancelled) setError('Payment could not be started. Check your connection and try again.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, mode]);

  return (
    <Layout bare>
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-card p-8 text-center">
          {error ? (
            <>
              <Icon name="error" className="text-danger-500 text-[40px] mb-3" />
              <h1 className="text-lg font-bold text-ink mb-2">Payment could not be started</h1>
              <p className="text-sm text-ink-muted">{error}</p>
              <p className="text-sm text-ink-muted mt-3">Your seats are held for a few minutes. Close this page to return to the app.</p>
            </>
          ) : (
            <>
              <div className="w-10 h-10 mx-auto mb-4 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
              <h1 className="text-lg font-bold text-ink mb-1">Opening secure payment…</h1>
              <p className="text-sm text-ink-muted">You'll pay on Cashfree's checkout page.</p>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
