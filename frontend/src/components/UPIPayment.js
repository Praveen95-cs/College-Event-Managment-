import React from 'react';
import { motion } from 'framer-motion';

const UPIPayment = ({ amount = 99, upiId = 'praveensumathi12@okicici', businessName = 'College Events' }) => {
  const upiLink = `upi://pay?pa=${upiId}&pn=${businessName}&am=${amount}&cu=INR`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(upiLink)}&size=200x200`;

  const handlePayment = () => {
    window.location.href = upiLink;
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
      <div className="h-full w-full max-w-md flex items-center justify-center py-16 px-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full"
        >
          <div className="bg-white/10 backdrop-blur-lg rounded-3xl shadow-xl p-6 border border-white/20">
            <div className="text-center">
              <motion.h1 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-2xl font-bold text-white mb-2"
              >
                Make a Payment
              </motion.h1>
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-base text-gray-300 mb-6"
              >
                Pay securely via UPI
              </motion.p>
              
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="mb-6 bg-white/5 rounded-2xl p-4 border border-white/10"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-gray-300">Amount</span>
                  <span className="text-xl font-bold text-white">₹{amount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-300">UPI ID</span>
                  <span className="text-white font-mono text-sm">{upiId}</span>
                </div>
              </motion.div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handlePayment}
                className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white py-3 px-6 rounded-xl text-base font-semibold shadow-lg hover:shadow-green-500/25 transition-all duration-200 mb-6"
              >
                Pay ₹{amount} Now
              </motion.button>

              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="border-t border-white/10 pt-6"
              >
                <p className="text-sm text-gray-300 mb-3">Or scan this QR code to pay</p>
                <div className="bg-white p-3 rounded-2xl inline-block">
                  <img
                    src={qrCodeUrl}
                    alt="Pay via UPI QR"
                    className="w-40 h-40"
                  />
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default UPIPayment; 