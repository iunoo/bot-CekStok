const Logger = require('./logger');
const config = require('../config/constants');

class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.awaitingVerification = new Map();
    this.lastCredentials = new Map();
    this.startCleanup();
  }

  // Search sessions
  setSearchSession(key, data) {
    this.sessions.set(key, {
      data,
      expires: Date.now() + config.app.sessionTimeout,
      type: 'search'
    });
    Logger.debug(`Search session created: ${key}`);
  }

  getSearchSession(key) {
    const session = this.sessions.get(key);
    if (!session || Date.now() > session.expires || session.type !== 'search') {
      this.sessions.delete(key);
      return null;
    }
    return session.data;
  }

  // Verification sessions
  setAwaitingVerification(userId, status = true) {
    this.awaitingVerification.set(userId, status);
    Logger.debug(`Verification status set for user ${userId}: ${status}`);
  }

  isAwaitingVerification(userId) {
    return this.awaitingVerification.get(userId) === true;
  }

  removeAwaitingVerification(userId) {
    this.awaitingVerification.delete(userId);
  }

  // Credential tracking
  setLastCredential(userId, credential) {
    this.lastCredentials.set(userId, credential);
  }

  getLastCredential(userId) {
    return this.lastCredentials.get(userId);
  }

  removeLastCredential(userId) {
    this.lastCredentials.delete(userId);
  }

  // Cleanup expired sessions
  startCleanup() {
    setInterval(() => {
      const now = Date.now();
      let cleanedCount = 0;
      
      for (const [key, session] of this.sessions) {
        if (now > session.expires) {
          this.sessions.delete(key);
          cleanedCount++;
        }
      }
      
      if (cleanedCount > 0) {
        Logger.debug(`Cleaned up ${cleanedCount} expired sessions`);
      }
    }, config.app.cleanupInterval);
  }

  // Get statistics
  getStats() {
    return {
      totalSessions: this.sessions.size,
      awaitingVerification: this.awaitingVerification.size,
      storedCredentials: this.lastCredentials.size
    };
  }
}

// Singleton instance
const sessionManager = new SessionManager();

module.exports = sessionManager;