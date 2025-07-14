const config = require('../config/constants');
const Logger = require('../utils/logger');
const verification = require('../utils/verification');
const sessionManager = require('../utils/sessionManager');
const messageHandler = require('./messageHandler');
const Validator = require('../utils/validator');

// Import utils
const getSheetsData = require('../utils/getSheetsData');
const calculateReadyStock = require('../utils/calculateReadyStock');
const findMatchingItems = require('../utils/findMatchingItems');
const formatMessage = require('../utils/formatMessage');

class CommandHandler {
  static async handleCommand(bot, msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text.toLowerCase().trim();

    // Parse command dan parameter
    const [command, ...params] = text.split(' ');
    const parameter = params.join(' ').trim();

    switch (command) {
      case '/start':
        await this.handleStart(bot, msg);
        break;
      case '/s':
        await this.handleSearch(bot, msg, parameter);
        break;
      case '/bantuan':
        await this.handleHelp(bot, msg);
        break;
      default:
        await messageHandler.handleUnknownMessage(bot, msg);
    }
  }

  static async handleStart(bot, msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!verification.isVerified(userId) && !config.telegram.allowedUserIds.includes(userId)) {
      sessionManager.setAwaitingVerification(userId, true);
      await messageHandler.sendVerificationPrompt(bot, chatId);
    } else {
      const credential = sessionManager.getLastCredential(userId) || 
                       (config.telegram.allowedUserIds.includes(userId) ? 'Admin' : 'User');
      
      const welcomeMessage = `
🎉 *Selamat Datang di Bot Cek Stok* 🎉
👋 Halo ${credential.charAt(0).toUpperCase() + credential.slice(1)}!

────────────────────

📱 *MENU UTAMA*

🔍 *Cek Stok Barang:*
• Ketik: \`/s nama_barang\`
• Contoh: \`/s mizu d\`

❓ *Butuh Bantuan?*
• Ketik: \`/bantuan\`

${config.telegram.allowedUserIds.includes(userId) ? `
🔧 *Menu Admin:*
• Upload Excel + caption \`/sheet1\` (stok)
• Upload Excel + caption \`/sheet2\` (pesanan)
` : ''}

💡 *Tips:* Gunakan kata kunci singkat untuk hasil yang lebih akurat!

────────────────────
🚀 *Siap melayani Anda!*
      `;
      
      await bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
      Logger.info(`Enhanced welcome message sent to ${chatId}`);
    }
  }

  static async handleSearch(bot, msg, keyword) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Check verification
    if (!verification.isVerified(userId) && !config.telegram.allowedUserIds.includes(userId)) {
      sessionManager.setAwaitingVerification(userId, true);
      await messageHandler.sendVerificationPrompt(bot, chatId);
      return;
    }

    // Validate keyword
    const cleanKeyword = Validator.extractKeyword(keyword);
    if (!cleanKeyword) {
      await bot.sendMessage(chatId, 
        '⚠️ Perintah */s* memerlukan nama barang. Contoh: */s mizu d*', 
        { parse_mode: 'Markdown' }
      );
      return;
    }

    let processingMessage;
    let animationInterval;

    try {
      Logger.info(`Processing search for keyword: ${cleanKeyword}`);
      
      // Show loading animation
      processingMessage = await bot.sendMessage(chatId, 'Memproses... ⏳', { parse_mode: 'Markdown' });
      animationInterval = this.startLoadingAnimation(bot, chatId, processingMessage);

      // Get data
      const { stokData, pesananData, updatedAtStok, updatedAtPesanan } = await getSheetsData();
      const calculated = await calculateReadyStock(stokData, pesananData);
      let matchingItems = findMatchingItems(cleanKeyword, calculated, Logger);

      // Process results
      if (!matchingItems || !Array.isArray(matchingItems)) {
        matchingItems = [];
      } else {
        matchingItems = matchingItems.filter(item => item && item.nama && item.nama.trim() !== '');
        if (matchingItems.length > 0) {
          matchingItems.sort((a, b) => this.sortItems(a, b));
        }
      }

      // Stop animation
      if (animationInterval) {
        clearInterval(animationInterval);
      }

      // Send results
      if (matchingItems.length === 0) {
        await bot.sendMessage(chatId, 
          `⚠️ Barang *${cleanKeyword}* tidak ditemukan. Pastikan penulisan benar atau coba kata kunci lain seperti */s mizu d*.`, 
          { parse_mode: 'Markdown' }
        );
      } else {
        const { text, reply_markup } = formatMessage(matchingItems, updatedAtStok, updatedAtPesanan, 0);
        const resultMessage = await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup });

        // Save session
        const sessionKey = `${chatId}_${resultMessage.message_id}`;
        sessionManager.setSearchSession(sessionKey, { 
          keyword: cleanKeyword, 
          items: matchingItems, 
          updatedAtStok, 
          updatedAtPesanan 
        });
      }

      // Clean up loading message
      if (processingMessage) {
        setTimeout(async () => {
          try {
            await bot.deleteMessage(chatId, processingMessage.message_id);
          } catch (err) {
            Logger.warn(`Failed to delete loading message: ${err.message}`);
          }
        }, 1500);
      }

    } catch (error) {
      Logger.error(`Search error: ${error.stack}`);
      
      if (animationInterval) {
        clearInterval(animationInterval);
      }
      
      await bot.sendMessage(chatId, '⚠️ Terjadi kesalahan saat mengambil data.', { parse_mode: 'Markdown' });
      
      if (processingMessage) {
        setTimeout(async () => {
          try {
            await bot.deleteMessage(chatId, processingMessage.message_id);
          } catch (err) {
            Logger.warn(`Failed to delete loading message: ${err.message}`);
          }
        }, 1500);
      }
    }
  }

  static async handleHelp(bot, msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!verification.isVerified(userId) && !config.telegram.allowedUserIds.includes(userId)) {
      await bot.sendMessage(chatId, '⚠️ Anda belum terverifikasi. Gunakan \`/start\` untuk memulai.', { 
        parse_mode: 'Markdown' 
      });
      return;
    }

    const credential = sessionManager.getLastCredential(userId) || 
                     (config.telegram.allowedUserIds.includes(userId) ? 'Admin' : 'User');
    
    // Send paginated help (halaman 1)
    const { text, reply_markup } = this.getHelpPage(1, credential, userId);
    const helpMessage = await bot.sendMessage(chatId, text, { 
      parse_mode: 'Markdown', 
      reply_markup 
    });

    // Save help session for pagination
    const helpSessionKey = `help_${chatId}_${helpMessage.message_id}`;
    sessionManager.setSearchSession(helpSessionKey, { 
      type: 'help',
      credential,
      userId
    });

    Logger.info(`Paginated help page 1 sent to ${chatId}`);
  }

  static getHelpPage(page, credential, userId) {
    const isAdmin = config.telegram.allowedUserIds.includes(userId);
    const totalPages = isAdmin ? 4 : 3;

    let text = '';
    let keyboard = [];

    switch (page) {
      case 1:
        text = `
📚 *PANDUAN BOT CEK STOK* (1/${totalPages})
👤 Mode: ${credential.charAt(0).toUpperCase() + credential.slice(1)}

────────────────────

🔍 *CARA CEK STOK*

📝 *Format Pencarian:*
• \`/s [nama barang]\`

✨ *Contoh Penggunaan:*
• \`/s mizu\` → Cari semua produk Mizu
• \`/s botol 500ml\` → Cari botol 500ml
• \`/s d\` → Cari produk dengan huruf D

🎯 *Tips Pencarian:*
• Gunakan kata kunci singkat
• Tidak perlu mengetik nama lengkap
• Bot akan cari yang mirip

────────────────────
📄 Halaman 1 dari ${totalPages}
        `;
        break;

      case 2:
        text = `
📚 *PANDUAN BOT CEK STOK* (2/${totalPages})
👤 Mode: ${credential.charAt(0).toUpperCase() + credential.slice(1)}

────────────────────

⚙️ *FITUR NAVIGASI*

◀️ *Tombol Navigasi* ▶️
• Aktif selama 15 menit
• Otomatis hilang setelah timeout

🔄 *Jika Tombol Tidak Aktif:*
• Lakukan pencarian ulang dengan \`/s\`

🕐 *Update Terakhir:*
• Tampil di setiap hasil pencarian
• Format: DD/MM/YYYY HH.MM.SS

────────────────────
📄 Halaman 2 dari ${totalPages}
        `;
        break;

      case 3:
        text = `
📚 *PANDUAN BOT CEK STOK* (3/${totalPages})
👤 Mode: ${credential.charAt(0).toUpperCase() + credential.slice(1)}

────────────────────

💬 *PERINTAH TERSEDIA*

\`/start\` → Menu utama
\`/s [barang]\` → Cek stok
\`/bantuan\` → Panduan ini

🔐 *Keamanan:*
• Verifikasi sekali per user
• Admin memiliki akses penuh

❓ *Butuh bantuan lebih?*
• Hubungi administrator

────────────────────
🤖 *Bot Cek Stok v2.0* | Siap Melayani 24/7

📄 Halaman 3 dari ${totalPages}
        `;
        break;

      case 4:
        if (isAdmin) {
          text = `
📚 *PANDUAN BOT CEK STOK* (4/${totalPages})
👤 Mode: ${credential.charAt(0).toUpperCase() + credential.slice(1)}

────────────────────

👑 *MENU KHUSUS ADMIN*

📤 *Upload Data Stok:*
• Kirim file Excel
• Tambahkan caption: \`/sheet1\`

📤 *Upload Data Pesanan:*
• Kirim file Excel  
• Tambahkan caption: \`/sheet2\`

⚡ *Format File Excel:*
• Sheet1: Kategori, Kode, Nama, Kuantitas, Gudang
• Sheet2: Wilayah, Kota, Pelanggan, Barang, dll

🔔 *Notifikasi:*
• Update berhasil → Timestamp tercatat
• Error upload → Pesan kesalahan detail

────────────────────
📄 Halaman 4 dari ${totalPages}
          `;
        }
        break;
    }

    // Create navigation buttons
    const navButtons = [];
    if (page > 1) {
      navButtons.push({ text: '⬅️ Sebelumnya', callback_data: `help_${page - 1}` });
    }
    if (page < totalPages) {
      navButtons.push({ text: 'Berikutnya ➡️', callback_data: `help_${page + 1}` });
    }

    // Add close button
    const closeButton = { text: '❌ Tutup', callback_data: 'help_close' };

    if (navButtons.length > 0) {
      keyboard.push(navButtons);
    }
    keyboard.push([closeButton]);

    return {
      text: text.trim(),
      reply_markup: { inline_keyboard: keyboard }
    };
  }

  // Helper methods
  static startLoadingAnimation(bot, chatId, message) {
    let emojiIndex = 0;
    let lastText = 'Memproses... ⏳';
    
    return setInterval(async () => {
      try {
        emojiIndex = (emojiIndex + 1) % config.app.loadingEmojis.length;
        const newText = `Memproses... ${config.app.loadingEmojis[emojiIndex]}`;
        
        if (newText !== lastText && emojiIndex % 2 === 0) {
          await bot.editMessageText(newText, {
            chat_id: chatId,
            message_id: message.message_id,
            parse_mode: 'Markdown'
          }).catch(err => Logger.warn(`Animation edit failed: ${err.message}`));
          lastText = newText;
        }
      } catch (err) {
        Logger.error(`Error in loading animation: ${err.message}`);
      }
    }, 1000);
  }

  static extractBaseNameAndNumber(name) {
    const baseMatch = name.replace(/@\s*\d+\s*/g, '').replace(/\s*\(Pcs\)/g, '');
    const numMatch = name.match(/(\d+(?:\s*\d+\/*\d*))/);
    const num = numMatch ? parseFloat(numMatch[1].replace(/\s/g, '').replace('/', '.')) || 0 : Infinity;
    return { baseName: baseMatch.trim(), number: num };
  }

  static sortItems(a, b) {
    const aBase = this.extractBaseNameAndNumber(a.nama);
    const bBase = this.extractBaseNameAndNumber(b.nama);
    
    if (aBase.baseName !== bBase.baseName) {
      return aBase.baseName.localeCompare(bBase.baseName);
    }
    
    const aHasAt = a.nama.includes('@');
    const bHasAt = b.nama.includes('@');
    
    if (aHasAt !== bHasAt) {
      return aHasAt ? -1 : 1; // @ di depan
    }
    
    return aBase.number - bBase.number; // Urut numerik
  }
}

module.exports = CommandHandler;