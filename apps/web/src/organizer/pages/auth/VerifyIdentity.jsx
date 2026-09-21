import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, ArrowRight } from 'lucide-react';

const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

// Cashfree's exact fixed enum for kyc_details.business_type — kept in
// sync with the same list in the backend's cashfreeClient.ts. A value
// outside this list is rejected outright by Cashfree's real API
// ("Invalid business type"), so this has to be a dropdown, not free
// text.
const CASHFREE_BUSINESS_TYPES = [
  'Grocery',
  'Jewellery',
  'Miscellaneous',
  'Web host/Domain seller',
  'E-commerce',
  'Online Gaming',
  'Society/Trust/Club/Association',
  'Mutual funds/Broking',
  'B2B',
  'Real Estate',
  'Housing',
  'Rentals',
  'Utilities',
  'Travel and Hospitality',
  'Education',
  'Food and Beverages',
  'NBFCs/Organizations into Lending',
  'Chit Funds',
  'Non Profit/NGO',
  'Financial Services',
  'Government',
  'Readymade',
  'SaaS',
  'Professional Services (Doctors, Lawyers, Architects, CAs, and other Professionals)',
  'Open and Semi Open Wallet',
  'Social Media and Entertainment',
  'Pan shop',
  'Telecom',
  'Digital Goods',
  'Insurance',
  'Pharmacy',
  'Healthcare',
  'Retail and Shopping',
  'Gaming',
  'Logistics',
];

export default function VerifyIdentity() {
  const [panNumber, setPanNumber] = useState('');
  const [accountType, setAccountType] = useState('individual');
  const [businessType, setBusinessType] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [error, setError] = useState('');

  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    const pan = panNumber.trim().toUpperCase();
    if (!PAN_PATTERN.test(pan)) {
      setError('Enter a valid PAN number (format: AAAAA9999A).');
      return;
    }
    if (accountType === 'business' && !businessType.trim()) {
      setError('Enter your business type (e.g. Proprietorship, Partnership, LLP).');
      return;
    }
    const digitsOnly = contactPhone.replace(/[^0-9]/g, '');
    if (digitsOnly.length < 10) {
      setError('Enter a valid contact phone number.');
      return;
    }

    // Collected here, submitted together with bank details on the next
    // step — Cashfree's vendor registration (see
    // organizerVerification.ts) needs both KYC and bank details in one
    // request, so nothing is actually sent to the server until
    // CompleteSetup has everything.
    navigate('/organizer/complete-setup', {
      state: { panNumber: pan, accountType, businessType: businessType.trim(), contactPhone: contactPhone.trim() },
    });
  };

  return (
    <div>
      <div className="mb-6">
        <div className="w-12 h-12 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center mb-3">
          <Shield className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Organizer Identity Verification</h2>
        <p className="text-xs text-slate-500 mt-1">
          In compliance with payment regulations, we verify your identity with Cashfree before enabling ticket payouts.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Account Type</label>
          <div className="flex gap-3">
            <label className="flex-1 flex items-center gap-2 px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg cursor-pointer has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
              <input type="radio" name="accountType" value="individual" checked={accountType === 'individual'} onChange={() => setAccountType('individual')} />
              Individual
            </label>
            <label className="flex-1 flex items-center gap-2 px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg cursor-pointer has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
              <input type="radio" name="accountType" value="business" checked={accountType === 'business'} onChange={() => setAccountType('business')} />
              Business
            </label>
          </div>
        </div>

        {accountType === 'business' && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Business Type</label>
            <select
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              className="w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            >
              <option value="">Select a category…</option>
              {CASHFREE_BUSINESS_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">PAN Number</label>
          <input
            type="text"
            required
            value={panNumber}
            onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
            placeholder="ABCDE1234F"
            maxLength={10}
            className="w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 font-mono uppercase"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Phone</label>
          <input
            type="tel"
            required
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="+91 98765 43210"
            className="w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
        </div>

        {error && <p className="text-[11px] text-red-600">{error}</p>}

        <button
          type="submit"
          className="w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs rounded-lg shadow-sm transition-all flex items-center justify-center gap-2"
        >
          <span>Continue to Bank Details</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
