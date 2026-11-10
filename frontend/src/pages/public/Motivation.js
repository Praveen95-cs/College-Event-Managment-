import React, { useState } from 'react';
import axios from 'axios';
import { HeartIcon, LightBulbIcon } from '@heroicons/react/24/outline';
import AvenorLoader from '../../components/common/AvenorLoader';

const Motivation = () => {
  const [feeling, setFeeling] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [motivation, setMotivation] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setLoading(true);
      const response = await axios.post('/api/motivation', { feeling });
      setMotivation(response.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to generate motivation. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const normalizedQuotes = motivation
    ? Array.isArray(motivation.quotes) && motivation.quotes.length > 0
      ? motivation.quotes
      : motivation.message
        ? [{ text: motivation.message, author: 'Avenor Study Guide' }]
        : []
    : [];

  const normalizedTips = motivation && Array.isArray(motivation.tips) ? motivation.tips : [];

  return (
    <div className="max-w-4xl mx-auto py-4 space-y-8">
      <div className="pb-6 border-b border-[#efe9de]/[0.08]">
        <span className="text-[12px] font-mono text-[#ebb05d]">Student wellbeing</span>
        <h1 className="text-[28px] sm:text-[32px] font-medium tracking-[-0.02em] text-[#efe9de] leading-[1.15] mt-1">
          Daily motivation
        </h1>
        <p className="mt-1.5 text-[15px] text-[#aaa398]">
          Share how you are feeling before an exam, hackathon, or workshop to get grounded next steps.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] p-5 sm:p-6 space-y-2.5">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-[8px] bg-[#262421] border border-[#efe9de]/[0.08] flex items-center justify-center text-[#ebb05d]">
              <HeartIcon className="h-5 w-5" strokeWidth={1.5} />
            </div>
            <h2 className="text-[16px] font-medium text-[#efe9de]">Calm perspective</h2>
          </div>
          <p className="text-[14px] text-[#aaa398] leading-relaxed">
            Turn pre-event stress or fatigue into steady, realistic encouragement.
          </p>
        </div>

        <div className="rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] p-5 sm:p-6 space-y-2.5">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-[8px] bg-[#262421] border border-[#efe9de]/[0.08] flex items-center justify-center text-[#ebb05d]">
              <LightBulbIcon className="h-5 w-5" strokeWidth={1.5} />
            </div>
            <h2 className="text-[16px] font-medium text-[#efe9de]">Actionable steps</h2>
          </div>
          <p className="text-[14px] text-[#aaa398] leading-relaxed">
            Focused preparation tips tailored to whatever challenge is in front of you today.
          </p>
        </div>
      </div>

      <div className="rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] p-6 sm:p-8 space-y-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-[8px] bg-[#e5484d]/10 border border-[#e5484d]/30 text-[#e5484d] text-[13px]" role="alert">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="feeling" className="block text-[13px] font-medium text-[#aaa398] mb-1.5">
              How are you feeling today?
            </label>
            <textarea
              id="feeling"
              name="feeling"
              rows={4}
              required
              className="input-field resize-y"
              placeholder="Share what is on your mind before class, contests, or project deadlines..."
              value={feeling}
              onChange={(e) => setFeeling(e.target.value)}
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full h-10 text-[14px]">
            {loading ? (
              <>
                <AvenorLoader variant="inline" tone="dark" />
                <span>Generating guidance...</span>
              </>
            ) : (
              <span>Get motivation</span>
            )}
          </button>
        </form>

        {motivation && (
          <div className="pt-6 border-t border-[#efe9de]/[0.08] space-y-5">
            <h3 className="text-[17px] font-medium text-[#efe9de]">Guidance for today</h3>

            {normalizedQuotes.length > 0 && (
              <div className="space-y-3">
                {normalizedQuotes.map((quote, index) => (
                  <div
                    key={index}
                    className="p-4 rounded-[10px] bg-[#161513] border border-[#efe9de]/[0.08]"
                  >
                    <p className="text-[14px] text-[#efe9de] leading-relaxed whitespace-pre-line">
                      {quote.text}
                    </p>
                    {quote.author && (
                      <p className="text-[12px] font-mono text-[#8a847a] mt-2">— {quote.author}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {normalizedTips.length > 0 && (
              <div className="p-4 rounded-[10px] bg-[#e09132]/10 border border-[#e09132]/25 space-y-2.5">
                <h4 className="text-[13px] font-medium text-[#ebb05d]">Practical tips</h4>
                <ul className="space-y-2 text-[13px] text-[#efe9de]/90">
                  {normalizedTips.map((tip, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="font-mono text-[#ebb05d] tabular-nums">{index + 1}.</span>
                      <span>{typeof tip === 'string' ? tip : tip.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Motivation;
