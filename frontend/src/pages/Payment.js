import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Payment = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const sessionId = searchParams.get('session_id');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) {
      navigate('/events');
      return;
    }

    const verifyPayment = async () => {
      try {
        setLoading(true);
        setError('');
        
        const response = await fetch('/api/events/verify-payment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sessionId }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Payment verification failed');
        }

        if (data.success) {
          navigate('/events', { state: { paymentSuccess: true } });
        } else {
          setError('Payment verification failed. Please contact support.');
        }
      } catch (err) {
        console.error('Error verifying payment:', err);
        setError(err.message || 'Payment verification failed. Please contact support.');
      } finally {
        setLoading(false);
      }
    };

    verifyPayment();
  }, [sessionId, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600 mx-auto mb-4"></div>
          <h1 className="text-2xl font-bold text-gray-100 mb-4">Verifying Payment...</h1>
          <p className="text-gray-300">Please wait while we verify your payment.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-900/50 border border-red-700 text-red-200 px-6 py-4 rounded-lg mb-4">
            {error}
          </div>
          <button
            onClick={() => navigate('/events')}
            className="px-4 py-2 bg-violet-600 text-white rounded-md hover:bg-violet-700"
          >
            Return to Events
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-100 mb-4">Processing Payment...</h1>
        <p className="text-gray-300">Please wait while we verify your payment.</p>
      </div>
    </div>
  );
};

export default Payment; 