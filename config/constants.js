require('dotenv').config();

const config = {
  telegram: {
    token: process.env.TELEGRAM_TOKEN,
    allowedUserIds: process.env.ALLOWED_USER_ID?.split(',').map(id => parseInt(id.trim())) || []
  },
  
  google: {
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    credentialsFile: 'credentials.json'
  },
  
  verification: {
    names: process.env.VERIFICATION_NAMES?.split(',').map(name => name.trim().toLowerCase()) || [],
    usersFile: 'verified-users.json'
  },
  
  app: {
    itemsPerPage: 5,
    sessionTimeout: 900000, // 15 minutes
    loadingEmojis: ['⏳', '🔄', '✨', '🌟'],
    logFile: 'bot-log.txt',
    cleanupInterval: 60000 // 1 minute
  }
};

module.exports = config;