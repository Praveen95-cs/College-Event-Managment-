import React, { useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { HeartIcon, LightBulbIcon } from '@heroicons/react/24/outline';

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
      setError('Failed to generate motivation. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        duration: 0.5
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-purple-400 mb-4">
            Daily Motivation
          </h1>
          <p className="text-gray-300 text-lg">
            Share how you're feeling and get personalized motivation to boost your day
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid gap-8 md:grid-cols-2 mb-12"
        >
          <motion.div variants={itemVariants} className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
            <div className="flex items-center mb-4">
              <HeartIcon className="h-8 w-8 text-pink-400" />
              <h3 className="text-xl font-semibold text-gray-100 ml-3">Emotional Support</h3>
            </div>
            <p className="text-gray-300">Share your feelings and receive uplifting messages tailored to your mood.</p>
          </motion.div>

          <motion.div variants={itemVariants} className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
            <div className="flex items-center mb-4">
              <LightBulbIcon className="h-8 w-8 text-yellow-400" />
              <h3 className="text-xl font-semibold text-gray-100 ml-3">Success Tips</h3>
            </div>
            <p className="text-gray-300">Practical advice and strategies to help you achieve your goals.</p>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-8 border border-gray-700"
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}
            
            <div>
              <label htmlFor="feeling" className="block text-sm font-medium text-gray-200 mb-2">
                How are you feeling today?
              </label>
              <textarea
                id="feeling"
                name="feeling"
                rows={4}
                required
                className="block w-full border border-gray-700 rounded-lg shadow-sm py-3 px-4 bg-gray-700/50 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-colors duration-200"
                placeholder="Share your thoughts and feelings..."
                value={feeling}
                onChange={(e) => setFeeling(e.target.value)}
              />
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500 transition-all duration-200"
            >
              {loading ? (
                <div className="flex items-center">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Generating...
                </div>
              ) : (
                'Get Motivation'
              )}
            </motion.button>
          </form>

          {motivation && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mt-8 space-y-6"
            >
              <h4 className="text-xl font-semibold text-gray-100 mb-4">Your Personalized Motivation</h4>
              
              <div className="space-y-4">
                {motivation.quotes.map((quote, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                    className="bg-gray-700/50 backdrop-blur-sm p-4 rounded-lg border border-gray-600"
                  >
                    <p className="text-gray-200 italic">"{quote.text}"</p>
                    <p className="text-gray-400 text-sm mt-2">- {quote.author}</p>
                  </motion.div>
                ))}
              </div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="bg-violet-900/30 p-4 rounded-lg border border-violet-700"
              >
                <h5 className="text-sm font-medium text-violet-300 mb-3">Personalized Tips</h5>
                <ul className="space-y-2">
                  {motivation.tips.map((tip, index) => (
                    <motion.li
                      key={index}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.5, delay: 0.4 + index * 0.1 }}
                      className="text-violet-200 flex items-start"
                    >
                      <span className="text-violet-400 mr-2">•</span>
                      {tip.text}
                    </motion.li>
                  ))}
                </ul>
              </motion.div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default Motivation; 