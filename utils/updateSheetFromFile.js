const { google } = require('googleapis');
const XLSX = require('xlsx');
const Logger = require('./logger');
const HttpClient = require('./httpClient');
const config = require('../config/constants');

const auth = new google.auth.GoogleAuth({
  keyFile: config.google.credentialsFile,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = config.google.spreadsheetId;

// Fungsi parsing data dari Excel
function parseExcelData(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('No sheets found in the Excel file.');
  }
  
  const dataSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawData = XLSX.utils.sheet_to_json(dataSheet, { header: 1 });
  
  if (!rawData || rawData.length <= 1) {
    throw new Error('No data rows found in the Excel file.');
  }
  
  const headerRow = rawData[0];
  const dataRows = rawData.slice(1);
  
  Logger.info(`Excel parsed - Header: ${JSON.stringify(headerRow)}`);
  Logger.debug(`Data rows count: ${dataRows.length}`);

  return { headerRow, dataRows };
}

// Fungsi untuk mencari index kolom dengan nama yang fleksibel
function findColumnIndex(headerRow, possibleNames) {
  for (const name of possibleNames) {
    const index = headerRow.findIndex(header => 
      header && header.toString().toLowerCase().includes(name.toLowerCase())
    );
    if (index >= 0) return index;
  }
  return -1;
}

// Fungsi mapping data ke format Spreadsheet untuk Sheet1 (STOK)
function mapToSheet1Data(dataRows, headerRow) {
  Logger.info('Mapping data for Sheet1 (STOK)');
  
  // Cari index kolom dengan nama yang fleksibel
  const kategoriIndex = findColumnIndex(headerRow, ['kategori', 'category', 'jenis']);
  const kodeIndex = findColumnIndex(headerRow, ['kode', 'code', 'sku', 'barcode']);
  const nameIndex = findColumnIndex(headerRow, ['nama', 'name', 'barang', 'produk', 'item']);
  const qtyIndex = findColumnIndex(headerRow, ['qty', 'kuantitas', 'quantity', 'stok', 'stock', 'jumlah']);
  const gudangIndex = findColumnIndex(headerRow, ['gudang', 'warehouse', 'lokasi', 'location']);

  Logger.info(`Column mapping - Kategori: ${kategoriIndex}, Kode: ${kodeIndex}, Nama: ${nameIndex}, Qty: ${qtyIndex}, Gudang: ${gudangIndex}`);

  // Validasi minimal: harus ada nama dan qty
  if (nameIndex < 0) {
    throw new Error('Kolom nama barang tidak ditemukan. Pastikan ada kolom dengan nama seperti: "Nama", "Nama Barang", "Produk", atau "Item"');
  }
  
  if (qtyIndex < 0) {
    throw new Error('Kolom quantity tidak ditemukan. Pastikan ada kolom dengan nama seperti: "Qty", "Kuantitas", "Quantity", "Stok", atau "Jumlah"');
  }

  const data = dataRows.map((row, index) => {
    if (!Array.isArray(row) || row.length < 2) {
      Logger.warn(`Row ${index + 2} skipped due to invalid format: ${JSON.stringify(row)}`);
      return null;
    }
    
    const kategori = kategoriIndex >= 0 ? (row[kategoriIndex]?.toString().trim() || '') : '';
    const kode = kodeIndex >= 0 ? (row[kodeIndex]?.toString().trim() || '') : '';
    const nama = row[nameIndex]?.toString().trim() || '';
    const qty = row[qtyIndex] ? row[qtyIndex].toString().replace(/\D/g, '') || '0' : '0';
    const gudang = gudangIndex >= 0 ? (row[gudangIndex]?.toString().trim() || 'Main') : 'Main';
    
    if (!nama) {
      Logger.warn(`Row ${index + 2} skipped due to empty name: ${JSON.stringify(row)}`);
      return null;
    }
    
    return { kategori, kode, nama, gudang, qty };
  }).filter(item => item !== null);

  Logger.info(`Processed ${data.length} valid items from ${dataRows.length} rows for Sheet1`);

  // Mapping ke 12 kolom untuk Sheet1!A2:L dengan offset
  const paddedData = data.map(item => [
    '',              // Kolom A (kosong)
    item.kategori,   // Kolom B
    '',              // Kolom C
    item.kode,       // Kolom D
    '',              // Kolom E
    item.nama,       // Kolom F
    '',              // Kolom G
    item.qty,        // Kolom H
    '',              // Kolom I
    item.gudang,     // Kolom J
    '',              // Kolom K
    '',              // Kolom L
  ]);

  return paddedData;
}

async function updateSheetFromFile(bot, msg, sheetName = 'Sheet1') {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!config.telegram.allowedUserIds.includes(userId)) {
    Logger.warn(`Access denied for user ${userId} in chat ${chatId}`);
    await bot.sendMessage(chatId, '⚠️ Maaf, hanya admin yang boleh mengunggah file.', { 
      parse_mode: 'Markdown' 
    });
    return;
  }

  const fileId = msg.document.file_id;
  Logger.info(`Processing file upload: ${fileId} for ${sheetName} (STOK)`);

  try {
    // Get file from Telegram
    const file = await bot.getFile(fileId);
    if (!file || !file.file_path) {
      throw new Error('Failed to get file information from Telegram');
    }

    const fileUrl = `https://api.telegram.org/file/bot${config.telegram.token}/${file.file_path}`;
    Logger.debug(`File URL: ${fileUrl}`);

    // Download file
    const buffer = await HttpClient.getBuffer(fileUrl);
    Logger.info(`File downloaded successfully, size: ${buffer.length} bytes`);

    // Parse Excel data
    const { headerRow, dataRows } = parseExcelData(buffer);
    
    // Map to sheet format
    const paddedData = mapToSheet1Data(dataRows, headerRow);

    if (paddedData.length === 0) {
      throw new Error('No valid data found in the file after processing.');
    }

    // Clear existing data
    const existingData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A2:L',
    });
    
    const rowCount = existingData.data.values?.length || 0;
    if (rowCount > 0) {
      const clearRange = `Sheet1!A2:L${rowCount + 1}`;
      await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: clearRange,
      });
      Logger.info(`Cleared old data in range ${clearRange}`);
    }

    // Update with new data
    const startRow = 2;
    const endRow = startRow + paddedData.length - 1;
    const range = `Sheet1!A${startRow}:L${endRow}`;
    
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
      valueInputOption: 'RAW',
      resource: { values: paddedData },
    });

    // Update timestamp
    const now = new Date().toLocaleString('id-ID', { 
      timeZone: 'Asia/Jakarta', 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit', 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    }).replace(/,/, '');
    
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!L1',
      valueInputOption: 'RAW',
      resource: { values: [[now]] },
    });

    Logger.info(`${sheetName} (STOK) updated successfully at ${now} with ${paddedData.length} rows`);
    await bot.sendMessage(chatId, 
      `✅ Data STOK di ${sheetName} berhasil diperbarui pada ${now}. Total baris: ${paddedData.length}.`, 
      { parse_mode: 'Markdown' }
    );

  } catch (error) {
    Logger.error(`Error updating ${sheetName} (STOK): ${error.stack}`);
    await bot.sendMessage(chatId, 
      `⚠️ Gagal memperbarui data STOK. Error: ${error.message}`, 
      { parse_mode: 'Markdown' }
    );
  }
}

module.exports = updateSheetFromFile;