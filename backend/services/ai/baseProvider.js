/**
 * Base AI Provider Interface
 * All AI providers (Gemini, Groq, etc.) must implement this interface.
 */
class BaseAIProvider {
  constructor(name) {
    this.name = name;
    this.cooldownUntil = 0;
    this.lastError = null;
  }

  isConfigured() {
    return false;
  }

  getStatus() {
    const now = Date.now();
    const inCooldown = this.cooldownUntil > now;
    return {
      provider: this.name,
      isConfigured: this.isConfigured(),
      tier: 'Free Tier',
      isQuotaExhausted: inCooldown,
      cooldownSeconds: inCooldown ? Math.ceil((this.cooldownUntil - now) / 1000) : 0,
      lastError: this.lastError ? this.lastError.message : null
    };
  }

  /**
   * Sets cooldown on provider when 429 quota exhaustion is detected.
   * @param {number} seconds - Number of seconds to pause before retrying
   * @param {Error} err - The error object
   */
  setQuotaCooldown(seconds, err) {
    const delay = Math.max(10, Math.min(seconds || 60, 600)); // between 10s and 10 mins
    this.cooldownUntil = Date.now() + (delay * 1000);
    this.lastError = err;
    console.warn(`[${this.name}] Rate limit / Quota exceeded. Cooldown active for ${delay}s.`);
  }

  isInCooldown() {
    return Date.now() < this.cooldownUntil;
  }

  getRemainingCooldownSeconds() {
    const remainingMs = this.cooldownUntil - Date.now();
    return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
  }

  /**
   * Attempts to parse retry-after delay in seconds from error headers, details, or message.
   * @param {any} err - Error caught from API call
   * @returns {number} Delay in seconds, or default fallback (60)
   */
  parseRetryDelay(err) {
    if (!err) return 60;

    // Check header retry-after
    const headerRetry = err.response?.headers?.['retry-after'] || err.headers?.['retry-after'];
    if (headerRetry) {
      const parsed = parseInt(headerRetry, 10);
      if (!Number.isNaN(parsed) && parsed > 0) return parsed;
    }

    // Check Google Gen AI errorDetails
    if (err.errorDetails && Array.isArray(err.errorDetails)) {
      for (const detail of err.errorDetails) {
        if (detail.quotaResetDelay) {
          const match = String(detail.quotaResetDelay).match(/(\d+)/);
          if (match) return parseInt(match[1], 10);
        }
        if (detail.metadata && detail.metadata.quotaResetDelay) {
          const match = String(detail.metadata.quotaResetDelay).match(/(\d+)/);
          if (match) return parseInt(match[1], 10);
        }
      }
    }

    // Check message string for patterns like "retry after 35s" or "35 seconds" or "in 35s"
    const msg = String(err.message || '');
    const regex1 = /retry\s+after\s+(\d+)\s*(s|sec|seconds)?/i;
    const match1 = msg.match(regex1);
    if (match1) return parseInt(match1[1], 10);

    const regex2 = /quotaResetDelay[":\s]+(\d+)/i;
    const match2 = msg.match(regex2);
    if (match2) return parseInt(match2[1], 10);

    const regex3 = /try\s+again\s+in\s+(\d+)\s*(s|sec|seconds)?/i;
    const match3 = msg.match(regex3);
    if (match3) return parseInt(match3[1], 10);

    return 60; // Safe default
  }

  /**
   * Cleans JSON markdown fence wrappers from raw text.
   */
  cleanJsonOutput(raw) {
    if (!raw) return '';
    let cleaned = raw.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    return cleaned.trim();
  }

  async generateQuizQuestions(options) {
    throw new Error('generateQuizQuestions() must be implemented');
  }

  async generateCodingProblems(options) {
    throw new Error('generateCodingProblems() must be implemented');
  }
}

module.exports = BaseAIProvider;
