const Logger = require('../utils/logger');
const sessionManager = require('../utils/sessionManager');
const Validator = require('../utils/validator');
const formatMessage = require('../utils/formatMessage');
const CommandHandler = require('./commandHandler');

class CallbackHandler {
  static async handleCallback(bot, query) {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const callbackData = query.data;

    Logger.debug(`Callback query received: ${callbackData} for message ${messageId}`);

    try {
      // Handle help pagination
      if (callbackData.startsWith('help_')) {
        await this.handleHelpCallback(bot, query);
        return;
      }

      // Handle search pagination
      if (callbackData.startsWith('page_')) {
        await this.handleSearchCallback(bot, query);
        return;
      }

      // Unknown callback
      await bot.answerCallbackQuery(query.id, { 
        text: 'Aksi tidak valid.' 
      });

    } catch (error) {
      Logger.error(`Callback handler error: ${error.stack}`);
      
      try {
        await bot.answerCallbackQuery(query.id, { 
          text: 'Terjadi kesalahan saat memproses aksi.' 
        });
      } catch (sendError) {
        Logger.error(`Failed to send error response: ${sendError.message}`);
      }
    }
  }

  static async handleHelpCallback(bot, query) {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const callbackData = query.data;

    // Handle close button
    if (callbackData === 'help_close') {
      try {
        await bot.deleteMessage(chatId, messageId);
        await bot.answerCallbackQuery(query.id, { 
          text: 'Panduan ditutup.' 
        });
        
        // Clean up session
        const helpSessionKey = `help_${chatId}_${messageId}`;
        const session = sessionManager.getSearchSession(helpSessionKey);
        if (session) {
          // Remove session (it will auto-expire anyway)
        }
        
        Logger.debug(`Help closed for message ${messageId}`);
        return;
      } catch (err) {
        Logger.warn(`Failed to delete help message: ${err.message}`);
        await bot.answerCallbackQuery(query.id, { 
          text: 'Panduan ditutup.' 
        });
        return;
      }
    }

    // Handle page navigation
    const pageMatch = callbackData.match(/^help_(\d+)$/);
    if (!pageMatch) {
      await bot.answerCallbackQuery(query.id, { 
        text: 'Aksi tidak valid.' 
      });
      return;
    }

    const page = parseInt(pageMatch[1]);
    if (!Validator.isValidPageNumber(page - 1)) { // Convert to 0-based for validator
      await bot.answerCallbackQuery(query.id, { 
        text: 'Nomor halaman tidak valid.' 
      });
      return;
    }

    // Get session to retrieve user info
    const helpSessionKey = `help_${chatId}_${messageId}`;
    const session = sessionManager.getSearchSession(helpSessionKey);

    if (!session || session.type !== 'help') {
      Logger.warn(`Help session not found for ${helpSessionKey}`);
      await bot.answerCallbackQuery(query.id, { 
        text: 'Sesi bantuan telah kadaluarsa. Gunakan /bantuan untuk membuka ulang.' 
      });
      return;
    }

    Logger.debug(`Help session found for ${helpSessionKey}, loading page ${page}`);

    // Get help page content
    const { credential, userId } = session;
    const { text, reply_markup } = CommandHandler.getHelpPage(page, credential, userId);

    // Update message
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup
    });

    // Answer callback
    await bot.answerCallbackQuery(query.id, { 
      text: `Halaman ${page}` 
    });

    Logger.debug(`Successfully updated help to page ${page}`);
  }

  static async handleSearchCallback(bot, query) {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const callbackData = query.data;

    // Parse callback data
    const pageStr = callbackData.split('_')[1];
    const page = parseInt(pageStr);

    if (!Validator.isValidPageNumber(page)) {
      await bot.answerCallbackQuery(query.id, { 
        text: 'Nomor halaman tidak valid.' 
      });
      return;
    }

    // Get session
    const sessionKey = `${chatId}_${messageId}`;
    const session = sessionManager.getSearchSession(sessionKey);

    if (!session || session.type === 'help') {
      Logger.warn(`Search session not found for ${sessionKey}`);
      await bot.answerCallbackQuery(query.id, { 
        text: 'Sesi pencarian telah kadaluarsa. Silakan coba lagi dengan perintah /s!' 
      });
      return;
    }

    Logger.debug(`Search session found for ${sessionKey}, loading page ${page}`);

    // Format new page
    const { items, updatedAtStok, updatedAtPesanan } = session;
    const { text, reply_markup } = formatMessage(items, updatedAtStok, updatedAtPesanan, page);

    // Update message
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup
    });

    // Answer callback
    await bot.answerCallbackQuery(query.id, { 
      text: `Halaman ${page + 1}` 
    });

    Logger.debug(`Successfully updated search to page ${page + 1}`);
  }
}

module.exports = CallbackHandler;