const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const verification = require('./utils/verification');
const getSheetsData = require('./utils/getSheetsData');
const calculateReadyStock = require('./utils/calculateReadyStock');
const findMatchingItems = require('./utils/findMatchingItems');
const formatMessage = require('./utils/formatMessage');
const updateSheetFromFile = require('./utils/updateSheetFromFile');
const updateSheet2FromFile = require('./utils/updateSheet2FromFile');
require('dotenv').config();

// Fungsi log ke file (diekspor)
const log = (message, level = 'INFO') => {
  const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const logEntry = `[${timestamp}] ${level}: ${message}\n`;
  fs.appendFileSync('bot-log.txt', logEntry, 'utf8');
  console.log(logEntry.trim());
};

module.exports = { log }; // Ekspor fungsi log

// Fungsi retry untuk operasi async
async function retry(fn, maxAttempts = 3, delay = 500) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await fn();
      return;
    } catch (err) {
      if (i === maxAttempts - 1) {
        log(`Retry failed after ${maxAttempts} attempts: ${err.message}`, 'ERROR');
        throw err;
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Deklarasi searchSessions
const searchSessions = {};

const verificationNames = process.env.VERIFICATION_NAMES?.split(',').map(name => name.trim().toLowerCase()) || [];
const allowedUserIds = process.env.ALLOWED_USER_ID?.split(',').map(id => parseInt(id.trim())) || [];

verification.loadVerificationStatus();

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// Array emotikon untuk animasi
const loadingEmojis = ['⏳', '🔄', '✨', '🌟'];

// Simpan status user yang lagi verifikasi dan kredensial terakhir
const awaitingVerification = {};
const lastCredential = {};

// Fungsi bantu ekstrak nama dasar dan angka
function extractBaseNameAndNumber(name) {
  const baseMatch = name.replace(/@\s*\d+\s*/g, '').replace(/\s*\(Pcs\)/g, ''); // Hapus @ dan (Pcs)
  const numMatch = name.match(/(\d+(?:\s*\d+\/*\d*))/); // Ekstrak angka seperti 1, 1 1/2, 10
  const num = numMatch ? parseFloat(numMatch[1].replace(/\s/g, '').replace('/', '.')) || 0 : Infinity;
  return { baseName: baseMatch.trim(), number: num };
}

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text?.toLowerCase().trim();

  if (awaitingVerification[userId]) {
    lastCredential[userId] = text;
    if (verification.verifyUser(userId, text, verificationNames, allowedUserIds)) {
      delete awaitingVerification[userId];
      delete lastCredential[userId];
      const welcomeMessage = `
👋 Selamat Datang di Bot Cek Stok ${text.charAt(0).toUpperCase() + text.slice(1)}!  
*📌 Apa yang Bisa Dilakukan:*  
  - Cek stok barang cepat dengan */s <nama barang>*  
    (Contoh: /s mizu d)  
  - Butuh panduan? Ketik */bantuan*  
*📥 Untuk Admin:*  
  - Update data via file Excel dengan caption:  
    - */sheet1* (stok)  
    - */sheet2* (pesanan)  
*🚀 Yuk, mulai cek stok sekarang!*  
      `;
      await bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
      log(`User ${userId} verified successfully with name ${text}`);
    } else {
      delete awaitingVerification[userId];
      await bot.sendMessage(chatId, '⚠️ Kredensial tidak valid. Coba lagi.', { parse_mode: 'Markdown' });
      log(`Failed verification attempt for user ${userId} with name ${text}`);
    }
  }
});

bot.on('document', async (msg) => {
  log(`Received document from user ${msg.from.id} in chat ${msg.chat.id}`);
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = (msg.caption || '').toLowerCase().trim();

  if (!allowedUserIds.includes(userId)) {
    await bot.sendMessage(chatId, '⚠️ Anda bukan admin. Hanya admin yang boleh mengunggah file.', { parse_mode: 'Markdown' });
    return;
  }

  if (!text || (!text.startsWith('/sheet1') && !text.startsWith('/sheet2'))) {
    log(`Invalid caption: "${text}"`, 'WARN');
    await bot.sendMessage(chatId, '⚠️ Gunakan /sheet1 atau /sheet2 sebagai caption saat mengunggah file.', { parse_mode: 'Markdown' });
    return;
  }

  let loadingMessage;
  let animationInterval;
  try {
    loadingMessage = await bot.sendMessage(chatId, 'Mengupload.. ⏳', { parse_mode: 'Markdown' });
    let emojiIndex = 0;
    let lastText = 'Mengupload.. ⏳';
    animationInterval = setInterval(async () => {
      try {
        if (!loadingMessage) return;
        emojiIndex = (emojiIndex + 1) % loadingEmojis.length;
        const newText = `Mengupload.. ${loadingEmojis[emojiIndex]}`;
        if (newText !== lastText && emojiIndex % 2 === 0) {
          log(`Editing message to: ${newText}`, 'INFO');
          await bot.editMessageText(newText, {
            chat_id: chatId,
            message_id: loadingMessage.message_id,
            parse_mode: 'Markdown'
          }).catch(err => log(`Animation edit failed: ${err.message}`, 'WARN'));
          lastText = newText;
        }
      } catch (err) {
        log(`Error in animation: ${err.message}`, 'ERROR');
      }
    }, 1000);
  } catch (err) {
    log(`Error starting animation: ${err.message}`, 'ERROR');
  }

  if (text === '/sheet1') {
    log(`Processing file upload for Sheet1`);
    try {
      await updateSheetFromFile(bot, msg, 'Sheet1');
    } catch (err) {
      log(`Error processing file upload: ${err.message}`, 'ERROR');
      await bot.sendMessage(chatId, `⚠️ Gagal memproses file. Error: ${err.message}`, { parse_mode: 'Markdown' });
    }
  } else if (text === '/sheet2') {
    log(`Processing file upload for Sheet2`);
    try {
      await updateSheet2FromFile(bot, msg);
    } catch (err) {
      log(`Error processing file upload: ${err.message}`, 'ERROR');
      await bot.sendMessage(chatId, `⚠️ Gagal memproses file. Error: ${err.message}`, { parse_mode: 'Markdown' });
    }
  }

  if (animationInterval) {
    clearInterval(animationInterval);
    log(`Stopped animation interval`, 'INFO');
  }
  if (loadingMessage) {
    try {
      setTimeout(async () => {
        log(`Attempting to delete loading message with ID ${loadingMessage.message_id}`, 'INFO');
        await retry(() => bot.deleteMessage(chatId, loadingMessage.message_id)).catch(err => {
          log(`Failed to delete message: ${err.message}`, 'WARN');
        });
      }, 1500);
    } catch (err) {
      log(`Error deleting loading message: ${err.message}`, 'ERROR');
    }
  }
});

bot.onText(/\/s(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const keyword = match[1] ? match[1].trim() : '';
  let processingMessage;

  if (!verification.isVerified(userId) && !allowedUserIds.includes(userId)) {
    awaitingVerification[userId] = true;
    const promptMessage = `
👋 *Selamat Datang di Bot Cek Stok!*  
*🔐 Verifikasi:*  
  Silahkan masukan kredensial anda  
  `;
    log(`Sent verification prompt to user ${chatId} for command /s`);
    await bot.sendMessage(chatId, promptMessage, { parse_mode: 'Markdown' });
    return;
  }

  try {
    log(`Processing /s command for keyword: ${keyword || '(none)'}`);
    processingMessage = await bot.sendMessage(chatId, 'Memproses... ⏳', { parse_mode: 'Markdown' });
    let emojiIndex = 0;
    let lastText = 'Memproses... ⏳';
    const animation = setInterval(async () => {
      try {
        if (!processingMessage) return;
        emojiIndex = (emojiIndex + 1) % loadingEmojis.length;
        const newText = `Memproses... ${loadingEmojis[emojiIndex]}`;
        if (newText !== lastText && emojiIndex % 2 === 0) {
          log(`Editing message to: ${newText}`, 'INFO');
          if (processingMessage) {
            await bot.editMessageText(newText, {
              chat_id: chatId,
              message_id: processingMessage.message_id,
              parse_mode: 'Markdown'
            }).catch(err => log(`Animation edit failed: ${err.message}`, 'WARN'));
            lastText = newText;
          }
        }
      } catch (err) {
        log(`Error in animation: ${err.message}`, 'ERROR');
      }
    }, 1000);

    const { stokData, pesananData, updatedAtStok, updatedAtPesanan } = await getSheetsData();
    log(`Stok data received: ${stokData ? stokData.length : 'undefined'} items`, 'DEBUG');
    log(`Pesanan data received: ${pesananData ? pesananData.length : 'undefined'} items`, 'DEBUG');
    const calculated = await calculateReadyStock(stokData, pesananData);
    log(`Calculated data: ${calculated ? calculated.length : 'undefined'} items`, 'DEBUG');
    let matchingItems = findMatchingItems(keyword, calculated, log);

    if (!matchingItems || !Array.isArray(matchingItems)) {
      log(`Error: matchingItems is undefined or not an array, setting to empty array`, 'ERROR');
      matchingItems = [];
    } else {
      log(`Matching items before filter: ${JSON.stringify(matchingItems)}`, 'DEBUG');
      matchingItems = matchingItems.filter(item => item && item.nama && item.nama.trim() !== '');
      if (matchingItems.length > 0) {
        matchingItems.sort((a, b) => {
          const aBase = extractBaseNameAndNumber(a.nama);
          const bBase = extractBaseNameAndNumber(b.nama);
          if (aBase.baseName !== bBase.baseName) return aBase.baseName.localeCompare(bBase.baseName);
          const aHasAt = a.nama.includes('@');
          const bHasAt = b.nama.includes('@');
          if (aHasAt !== bHasAt) return aHasAt ? -1 : 1; // @ di depan
          return aBase.number - bBase.number; // Urut numerik
        });
      }
      log(`Matching items after filter and sort: ${JSON.stringify(matchingItems.map(item => item.nama))}`, 'DEBUG');
    }

    clearInterval(animation);

    if (matchingItems.length === 0) {
      if (!keyword) {
        await bot.sendMessage(chatId, '⚠️ Perintah */s* memerlukan nama barang. Contoh: */s mizu d*', { parse_mode: 'Markdown' });
      } else if (keyword.length > 0) {
        await bot.sendMessage(chatId, `⚠️ Barang *${keyword}* tidak ditemukan. Pastikan penulisan benar atau coba kata kunci lain seperti */s mizu d*.`, { parse_mode: 'Markdown' });
      }
      if (processingMessage) {
        await retry(() => bot.deleteMessage(chatId, processingMessage.message_id)).catch(err => {
          log(`Failed to delete message: ${err.message}`, 'WARN');
        });
      }
      return;
    }

    const { text, reply_markup } = formatMessage(matchingItems, updatedAtStok, updatedAtPesanan, 0);
    const resultMessage = await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup });
    if (processingMessage) {
      await retry(() => bot.deleteMessage(chatId, processingMessage.message_id)).catch(err => {
        log(`Failed to delete message: ${err.message}`, 'WARN');
      });
    }

    const sessionKey = `${chatId}_${resultMessage.message_id}`;
    searchSessions[sessionKey] = { keyword, items: matchingItems, updatedAtStok, updatedAtPesanan };
    log(`Sesi disimpan untuk ${sessionKey}`);
    setTimeout(() => {
      delete searchSessions[sessionKey];
      log(`Sesi ${sessionKey} dihapus`);
    }, 900000);
  } catch (err) {
    log(`Error processing /s: ${err.stack}`, 'STACKTRACE');
    await bot.sendMessage(chatId, '⚠️ Terjadi kesalahan saat mengambil data.', { parse_mode: 'Markdown' });
    if (processingMessage) {
      await retry(() => bot.deleteMessage(chatId, processingMessage.message_id)).catch(err => {
        log(`Failed to delete message: ${err.message}`, 'WARN');
      });
    }
  }
});

// Handler untuk pesan nggak dikenali
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.toLowerCase().trim();
  const validCommands = ['/s', '/start', '/bantuan'];

  // Cek kalau bukan command yang valid
  if (text && (!text.startsWith('/') || (text.startsWith('/') && !validCommands.some(cmd => text.startsWith(cmd))))) {
    bot.sendMessage(chatId, '⚠️ Command tidak dikenali. Coba perintah seperti */s <nama barang>*, */start*, atau */bantuan*.', { parse_mode: 'Markdown' });
    log(`Unknown command or text received: ${text} from user ${msg.from.id}`);
  }
});

// Handler untuk tombol paginasi
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const page = parseInt(query.data.split('_')[1]);
  const sessionKey = `${chatId}_${messageId}`;

  try {
    const session = searchSessions[sessionKey];
    if (!session) {
      log(`Sesi tidak ditemukan untuk ${sessionKey}`, 'WARN');
      await bot.answerCallbackQuery(query.id, { text: 'Sesi pencarian telah kadaluarsa. Silakan coba lagi dengan perintah /s!' });
      return;
    }

    log(`Sesi ditemukan untuk ${sessionKey}, memuat halaman ${page}`);
    const { items, updatedAtStok, updatedAtPesanan } = session;
    const { text, reply_markup } = formatMessage(items, updatedAtStok, updatedAtPesanan, page);
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup
    });
    await bot.answerCallbackQuery(query.id);
  } catch (err) {
    log(`Error handling callback: ${err.stack}`, 'ERROR');
    await bot.sendMessage(chatId, '⚠️ Terjadi kesalahan saat mengubah halaman.', { parse_mode: 'Markdown' });
    await bot.answerCallbackQuery(query.id);
  }
});

// Perintah /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!verification.isVerified(userId) && !allowedUserIds.includes(userId)) {
    awaitingVerification[userId] = true;
    const promptMessage = `
👋 *Selamat Datang di Bot Cek Stok!*  
*🔐 Verifikasi:*  
  Silahkan masukan kredensial anda  
  `;
    log(`Sent verification prompt to user ${chatId}`);
    bot.sendMessage(chatId, promptMessage, { parse_mode: 'Markdown' });
  } else {
    const credential = lastCredential[userId] || (allowedUserIds.includes(userId) ? 'Admin' : 'User');
    const welcomeMessage = `
👋 Selamat Datang di Bot Cek Stok ${credential.charAt(0).toUpperCase() + credential.slice(1)}!  
*📌 Apa yang Bisa Dilakukan:*  
  - Cek stok barang cepat dengan */s <nama barang>*  
    (Contoh: /s mizu d)  
  - Butuh panduan? Ketik */bantuan*  
*📥 Untuk Admin:*  
  - Update data via file Excel dengan caption:  
    - */sheet1* (stok)  
    - */sheet2* (pesanan)  
*🚀 Yuk, mulai cek stok sekarang!*  
    `;
    log(`Sent welcome message to ${chatId}`);
    bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
  }
});

// Perintah /bantuan
bot.onText(/\/bantuan/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!verification.isVerified(userId) && !allowedUserIds.includes(userId)) {
    await bot.sendMessage(chatId, '⚠️ Anda belum terverifikasi. Verifikasi kredensial diperlukan.', { parse_mode: 'Markdown' });
    return;
  }
  const credential = lastCredential[userId] || (allowedUserIds.includes(userId) ? 'Admin' : 'User');
  const helpMessage = `
📚 *Panduan Bot Cek Stok ${credential.charAt(0).toUpperCase() + credential.slice(1)}*  
*🔍 Cara Pakai:*  
  - Gunakan: */s <nama barang>*  
    (Contoh: /s mizu d)  
  - Tombol "Berikutnya" aktif 15 menit  
  - Kadaluarsa? Coba lagi dengan */s*  
*📥 Untuk Admin:*  
  - Update data: Kirim file Excel dengan caption:  
    - */sheet1* (stok)  
    - */sheet2* (pesanan)  
*💡 Info Tambahan:*  
  - Hubungi admin untuk bantuan  
  - Verifikasi dilakukan sekali per user (kecuali admin)  
  -----------------------  
  `;
  log(`Sent help message to ${chatId}`);
  await bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});