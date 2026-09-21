declare module '@cashfreepayments/cashfree-js' {
  export interface CashfreeCheckoutOptions {
    paymentSessionId: string;
    redirectTarget?: '_self' | '_blank' | '_top' | '_modal';
  }

  export interface CashfreeCheckoutResult {
    error?: { message: string };
    redirect?: boolean;
  }

  export interface CashfreeInstance {
    checkout(options: CashfreeCheckoutOptions): Promise<CashfreeCheckoutResult>;
  }

  export function load(options: { mode: 'sandbox' | 'production' }): Promise<CashfreeInstance | null>;
}
