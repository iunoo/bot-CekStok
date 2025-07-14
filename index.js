const TelegramBot = require('node-telegram-bot-api');
const config = require('./config/constants');
const Logger = require('./utils/logger');
const verification = require('./utils/verification');
const sessionManager = require('./utils/sessionManager');

// Import handlers
const messageHandler = require('./handlers/messageHandler');
const commandHandler = require('./handlers/commandHandler');
const fileHandler = require('./handlers/fileHandler');
const callbackHandler = require('./handlers/callbackHandler');

// Initialize bot
const bot = new TelegramBot(config.telegram.token, { polling: true });

// Load verification status
verification.loadVerificationStatus();

// Wrapper untuk error handling
const asyncHandler = (handler) => {
  return async (...args) => {
    try {
      await handler(...args);
    } catch (error) {
      Logger.error(`Handler error: ${error.stack}`);
      const msg = args[0];
      if (msg && msg.chat && msg.chat.id) {
        try {
          await bot.sendMessage(msg.chat.id, '⚠️ Terjadi kesalahan sistem. Silakan coba lagi.', { 
            parse_mode: 'Markdown' 
          });
        } catch (sendError) {
          Logger.error(`Failed to send error message: ${sendError.message}`);
        }
      }
    }
  };
};

// === SINGLE MESSAGE HANDLER === (Ini yang fix masalah duplicate!)
bot.on('message', asyncHandler(async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text?.toLowerCase().trim();

  Logger.info(`Message from user ${userId} in chat ${chatId}: ${text || '[non-text]'}`);

  // Handle file uploads
  if (msg.document) {
    await fileHandler.handleFileUpload(bot, msg);
    return;
  }

  // Handle verification input
  if (sessionManager.isAwaitingVerification(userId)) {
    await messageHandler.handleVerificationInput(bot, msg);
    return;
  }

  // Handle commands
  if (text && text.startsWith('/')) {
    await commandHandler.handleCommand(bot, msg);
    return;
  }

  // Handle unknown text
  if (text) {
    await messageHandler.handleUnknownMessage(bot, msg);
  }
}));

// === CALLBACK QUERY HANDLER ===
bot.on('callback_query', asyncHandler(async (query) => {
  await callbackHandler.handleCallback(bot, query);
}));

// === ERROR HANDLERS ===
bot.on('polling_error', (error) => {
  Logger.error(`Polling error: ${error.message}`);
});

bot.on('error', (error) => {
  Logger.error(`Bot error: ${error.message}`);
});

// === STARTUP ===
Logger.info('🚀 Bot starting...');
Logger.info(`📊 Config loaded - Allowed users: ${config.telegram.allowedUserIds.length}`);

// Graceful shutdown
process.on('SIGINT', () => {
  Logger.info('🛑 Bot stopping...');
  bot.stopPolling();
  process.exit(0);
});

process.on('SIGTERM', () => {
  Logger.info('🛑 Bot terminating...');
  bot.stopPolling();
  process.exit(0);
});

Logger.info('✅ Bot started successfully!');