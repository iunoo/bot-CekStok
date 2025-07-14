const config = require('../config/constants');
const Logger = require('../utils/logger');
const verification = require('../utils/verification');
const sessionManager = require('../utils/sessionManager');
const Validator = require('../utils/validator');

class MessageHandler {
  static async handleVerificationInput(bot, msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = Validator.sanitizeInput(msg.text);

    if (!text) {
      await bot.sendMessage(chatId, `
⚠️ *Kredensial tidak boleh kosong*

🔄 Silakan masukkan kredensial yang valid.
💡 Pastikan tidak ada spasi di awal atau akhir.
      `, { 
        parse_mode: 'Markdown' 
      });
      return;
    }

    sessionManager.setLastCredential(userId, text);
    
    if (verification.verifyUser(userId, text, config.verification.names, config.telegram.allowedUserIds)) {
      sessionManager.removeAwaitingVerification(userId);
      
      const welcomeMessage = `
✅ *VERIFIKASI BERHASIL!*

🎉 Selamat datang, *${text.charAt(0).toUpperCase() + text.slice(1)}*!

────────────────────

🚀 *BOT SIAP DIGUNAKAN*

🔍 *Mulai Cek Stok:*
• Ketik: \`/s nama_barang\`
• Contoh: \`/s mizu d\`

📚 *Panduan Lengkap:*
• Ketik: \`/bantuan\`

${config.telegram.allowedUserIds.includes(userId) ? `
👑 *Akses Admin Tersedia:*
• Upload Excel dengan caption \`/sheet1\` atau \`/sheet2\`
` : ''}

💡 *Tips:* Gunakan kata kunci pendek untuk hasil pencarian yang lebih akurat!

────────────────────
✨ *Selamat menggunakan!*
      `;
      
      await bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
      Logger.info(`User ${userId} verified successfully with name ${text}`);
    } else {
      sessionManager.removeAwaitingVerification(userId);
      sessionManager.removeLastCredential(userId);
      
      await bot.sendMessage(chatId, `
❌ *VERIFIKASI GAGAL*

🔐 Kredensial yang Anda masukkan tidak valid.

────────────────────

🔄 *Cara mencoba lagi:*
• Ketik \`/start\` untuk memulai ulang
• Pastikan kredensial sudah benar
• Hubungi admin jika masih bermasalah

💡 *Tips:* Periksa ejaan dan pastikan tidak ada spasi berlebih.
      `, { 
        parse_mode: 'Markdown' 
      });
      Logger.warn(`Failed verification attempt for user ${userId} with name ${text}`);
    }
  }

  static async handleUnknownMessage(bot, msg) {
    const chatId = msg.chat.id;
    const text = msg.text?.toLowerCase().trim();

    // Jangan respond kalau user belum verifikasi
    if (!verification.isVerified(msg.from.id) && !config.telegram.allowedUserIds.includes(msg.from.id)) {
      return;
    }

    const validCommands = ['/s', '/start', '/bantuan'];
    
    if (text && (!text.startsWith('/') || (text.startsWith('/') && !validCommands.some(cmd => text.startsWith(cmd))))) {
      await bot.sendMessage(chatId, 
        '⚠️ Command tidak dikenali. Coba perintah seperti */s <nama barang>*, */start*, atau */bantuan*.', 
        { parse_mode: 'Markdown' }
      );
      Logger.info(`Unknown command received: ${text} from user ${msg.from.id}`);
    }
  }

  static async sendVerificationPrompt(bot, chatId) {
    const promptMessage = `
🔐 *VERIFIKASI DIPERLUKAN*

────────────────────

🤖 *BOT CEK STOK*

👋 Selamat datang! Untuk menggunakan bot ini, Anda perlu melakukan verifikasi terlebih dahulu.

━━━━━━━━━━━━━━━━━━━━━━━━━

🔑 *Langkah Verifikasi:*
• Masukkan kredensial yang telah diberikan
• Kirim sebagai pesan biasa (bukan command)
• Pastikan ejaan sudah benar

✅ *Setelah Verifikasi:*
• Akses penuh ke fitur cek stok
• Panduan lengkap tersedia
• Interface yang user-friendly

🔒 *Keamanan:*
• Verifikasi cukup sekali saja
• Data kredensial tersimpan aman
• Akses terkontrol untuk keamanan sistem

────────────────────

💬 *Silakan masukkan kredensial Anda:*
    `;
    
    await bot.sendMessage(chatId, promptMessage, { parse_mode: 'Markdown' });
    Logger.info(`Enhanced verification prompt sent to chat ${chatId}`);
  }
}

module.exports = MessageHandler;