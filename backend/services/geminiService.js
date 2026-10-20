/**
 * Backward compatibility wrapper for AI question generation services.
 * Integrates with unified AIService supporting Gemini, Groq, and MongoDB ProblemCache.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const aiService = require('./ai/aiService');

async function getVerifiedModel() {
  const status = await aiService.getStatus();
  return status.verifiedModel;
}

async function generateQuizQuestions(options) {
  return aiService.generateQuizQuestions(options);
}

async function generateCodingProblems(options) {
  return aiService.generateCodingProblems(options);
}

async function getStatus() {
  return aiService.getStatus();
}

module.exports = {
  getVerifiedModel,
  generateQuizQuestions,
  generateCodingProblems,
  getStatus,
  aiService
};
