import React from 'react';
import { Link } from 'react-router-dom';
import { QrCodeIcon, ArrowRightIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';

const UPIPayment = ({
  eventId = '',
  paymentId = '',
  amount = 99,
  upiId = '',
  businessName = 'Praveen S'
}) => {
  const safeVpa = String(upiId || '').trim();
  const safeName = encodeURIComponent(String(businessName || 'Avenor Campus Events').trim());
  const safeAmt = Number(amount || 0).toFixed(2);
  const upiLink = safeVpa ? `upi://pay?pa=${safeVpa}&pn=${safeName}&am=${safeAmt}&cu=INR` : '';
  const targetRoute = paymentId
    ? `/payment/${paymentId}`
    : eventId
      ? `/events/${eventId}/checkout`
      : '/events';

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#1c1a18] border border-[#efe9de]/[0.12] rounded-[16px] p-6 text-[#efe9de] shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-[#efe9de]/[0.08] pb-3.5">
          <div className="flex items-center gap-2 text-[#ebb05d]">
            <QrCodeIcon className="h-5 w-5" strokeWidth={1.75} />
            <span className="text-[13px] font-mono font-semibold uppercase tracking-wider">
              YouPI-PG V2 Checkout
            </span>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[#4cc38a]">
            <ShieldCheckIcon className="h-3.5 w-3.5" />
            <span>0% Fee</span>
          </span>
        </div>

        <div className="rounded-[12px] bg-[#161513] border border-[#efe9de]/[0.08] p-4 space-y-2.5 text-[13px]">
          <div className="flex items-center justify-between">
            <span className="text-[#8a847a]">Amount Payable</span>
            <span className="text-[20px] font-mono font-semibold text-[#ebb05d]">₹{safeAmt}</span>
          </div>
          {safeVpa && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#8a847a]">Payee UPI VPA</span>
              <span className="font-mono text-[#efe9de] break-all">{safeVpa}</span>
            </div>
          )}
        </div>

        <div className="space-y-2.5">
          <Link to={targetRoute} className="btn-primary w-full h-11 text-[13px]">
            <span>Open Interactive UPI Gateway &amp; QR</span>
            <ArrowRightIcon className="h-4 w-4" strokeWidth={1.75} />
          </Link>
          {upiLink && (
            <a href={upiLink} className="btn-secondary w-full h-10 text-[13px]">
              Open UPI App Directly
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

export default UPIPayment;
