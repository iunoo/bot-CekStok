const fs = require('fs');
const config = require('../config/constants');

class Logger {
  static log(message, level = 'INFO') {
    const timestamp = new Date().toLocaleString('id-ID', { 
      timeZone: 'Asia/Jakarta' 
    });
    const logEntry = `[${timestamp}] ${level}: ${message}\n`;
    
    try {
      fs.appendFileSync(config.app.logFile, logEntry, 'utf8');
      console.log(logEntry.trim());
    } catch (err) {
      console.error('Failed to write log:', err.message);
    }
  }

  static info(message) {
    this.log(message, 'INFO');
  }

  static warn(message) {
    this.log(message, 'WARN');
  }

  static error(message) {
    this.log(message, 'ERROR');
  }

  static debug(message) {
    this.log(message, 'DEBUG');
  }

  static stacktrace(message) {
    this.log(message, 'STACKTRACE');
  }
}

module.exports = Logger;