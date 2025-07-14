const Logger = require('./logger');

let fetch;

// Initialize fetch untuk Node.js
async function initializeFetch() {
  try {
    const fetchModule = await import('node-fetch');
    fetch = fetchModule.default;
    Logger.info('node-fetch initialized successfully');
  } catch (err) {
    Logger.error('Failed to import node-fetch, using global fetch');
    fetch = global.fetch;
    if (!fetch) {
      throw new Error('No fetch implementation available');
    }
  }
}

class HttpClient {
  static async initialize() {
    if (!fetch) {
      await initializeFetch();
    }
  }

  static async get(url, options = {}) {
    await this.initialize();
    
    Logger.debug(`HTTP GET: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      ...options
    });
    
    Logger.debug(`HTTP Response: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response;
  }

  static async getBuffer(url, options = {}) {
    const response = await this.get(url, options);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}

module.exports = HttpClient;