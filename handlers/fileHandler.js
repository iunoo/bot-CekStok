const config = require('../config/constants');
const Logger = require('../utils/logger');
const Validator = require('../utils/validator');
const updateSheetFromFile = require('../utils/updateSheetFromFile');
const updateSheet2FromFile = require('../utils/updateSheet2FromFile');

class FileHandler {
  static async handleFileUpload(bot, msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const caption = (msg.caption || '').toLowerCase().trim();

    Logger.info(`File upload from user ${userId} in chat ${chatId} with caption: "${caption}"`);

    // Check if user is admin
    if (!config.telegram.allowedUserIds.includes(userId)) {
      await bot.sendMessage(chatId, 
        '⚠️ Anda bukan admin. Hanya admin yang boleh mengunggah file.', 
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Validate caption
    if (!Validator.isValidCaption(caption, ['/sheet1', '/sheet2'])) {
      Logger.warn(`Invalid caption: "${caption}"`);
      await bot.sendMessage(chatId, 
        '⚠️ Gunakan /sheet1 atau /sheet2 sebagai caption saat mengunggah file.', 
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Validate file
    if (!Validator.isValidFileId(msg.document?.file_id)) {
      await bot.sendMessage(chatId, 
        '⚠️ File tidak valid. Pastikan file Excel terkirim dengan benar.', 
        { parse_mode: 'Markdown' }
      );
      return;
    }

    let loadingMessage;
    let animationInterval;

    try {
      // Start loading animation
      loadingMessage = await bot.sendMessage(chatId, 'Mengupload.. ⏳', { parse_mode: 'Markdown' });
      animationInterval = this.startUploadAnimation(bot, chatId, loadingMessage);

      // Process file based on caption - INI YANG DIPERBAIKI!
      if (caption === '/sheet1') {
        Logger.info('Processing file upload for Sheet1 (STOK)');
        await updateSheetFromFile(bot, msg, 'Sheet1');
      } else if (caption === '/sheet2') {
        Logger.info('Processing file upload for Sheet2 (PESANAN)');
        await updateSheet2FromFile(bot, msg);
      }

    } catch (error) {
      Logger.error(`Error processing file upload: ${error.stack}`);
      await bot.sendMessage(chatId, 
        `⚠️ Gagal memproses file. Error: ${error.message}`, 
        { parse_mode: 'Markdown' }
      );
    } finally {
      // Clean up loading animation
      if (animationInterval) {
        clearInterval(animationInterval);
        Logger.debug('Upload animation stopped');
      }
      
      if (loadingMessage) {
        setTimeout(async () => {
          try {
            Logger.debug(`Deleting loading message ${loadingMessage.message_id}`);
            await bot.deleteMessage(chatId, loadingMessage.message_id);
          } catch (err) {
            Logger.warn(`Failed to delete loading message: ${err.message}`);
          }
        }, 1500);
      }
    }
  }

  static startUploadAnimation(bot, chatId, message) {
    let emojiIndex = 0;
    let lastText = 'Mengupload.. ⏳';
    
    return setInterval(async () => {
      try {
        emojiIndex = (emojiIndex + 1) % config.app.loadingEmojis.length;
        const newText = `Mengupload.. ${config.app.loadingEmojis[emojiIndex]}`;
        
        if (newText !== lastText && emojiIndex % 2 === 0) {
          Logger.debug(`Updating upload animation: ${newText}`);
          await bot.editMessageText(newText, {
            chat_id: chatId,
            message_id: message.message_id,
            parse_mode: 'Markdown'
          }).catch(err => Logger.warn(`Upload animation edit failed: ${err.message}`));
          lastText = newText;
        }
      } catch (err) {
        Logger.error(`Error in upload animation: ${err.message}`);
      }
    }, 1000);
  }
}

module.exports = FileHandler;