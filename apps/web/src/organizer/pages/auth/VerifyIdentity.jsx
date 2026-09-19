import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { FileCheck, UploadCloud, Shield, CheckCircle, ArrowRight } from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';

export default function VerifyIdentity() {
  const [docType, setDocType] = useState('aadhaar');
  const [docNumber, setDocNumber] = useState('XXXX-XXXX-4912');
  const [fileName, setFileName] = useState('gov_identity_proof.pdf');
  const [loading, setLoading] = useState(false);

  const { showToast } = useNotifications();
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      showToast('Identity document verified successfully!', 'success');
      navigate('/organizer/complete-setup');
    }, 400);
  };

  return (
    <div>
      <div className="mb-6">
        <div className="w-12 h-12 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center mb-3">
          <Shield className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Organizer Identity Verification</h2>
        <p className="text-xs text-slate-500 mt-1">
          In compliance with merchant financial regulations, we require legal identification to enable ticket payouts.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Document Type</label>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          >
            <option value="aadhaar">Aadhaar Card (India)</option>
            <option value="pan">PAN Card (Company / Individual)</option>
            <option value="passport">Passport</option>
            <option value="gst">GST Registration Certificate</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Identification Number</label>
          <input
            type="text"
            required
            value={docNumber}
            onChange={(e) => setDocNumber(e.target.value)}
            placeholder="e.g. 1234 5678 9012"
            className="w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Upload Document Copy (PDF / PNG / JPG)</label>
          <div className="border-2 border-dashed border-slate-200 hover:border-brand-500 rounded-xl p-4 text-center bg-slate-50 hover:bg-blue-50/30 transition-colors cursor-pointer">
            <UploadCloud className="w-8 h-8 text-slate-400 mx-auto mb-1" />
            <p className="text-xs font-semibold text-slate-700">{fileName || "Click to browse or drop file here"}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Maximum file size: 10MB</p>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-70"
        >
          <span>{loading ? 'Submitting...' : 'Verify & Continue'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
