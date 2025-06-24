const { google } = require('googleapis');
const XLSX = require('xlsx');

// Impor fungsi log dari index.js
let log = console.log;
if (typeof global.log === 'function') {
  log = global.log;
}

const auth = new google.auth.GoogleAuth({
  keyFile: 'credentials.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

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
  log('Header row (raw):', headerRow, 'INFO');
  const dataRows = rawData.slice(1);
  log('Data rows (after header):', dataRows, 'INFO');

  return { headerRow, dataRows };
}

// Fungsi mapping data ke format Spreadsheet untuk Sheet1
function mapToSheet1Data(dataRows, headerRow) {
  // Validasi header untuk Sheet1
  const requiredHeaders = ['Kategori Barang', 'Kode Barang', 'Nama Barang', 'Kuantitas', 'Nama Gudang'];
  const foundHeaders = requiredHeaders.filter(header => headerRow.includes(header));
  if (foundHeaders.length !== requiredHeaders.length) {
    throw new Error(`Format file tidak sesuai untuk Sheet1. Header yang hilang: ${requiredHeaders.filter(h => !foundHeaders.includes(h)).join(', ')}`);
  }

  const data = dataRows.map(row => {
    if (!Array.isArray(row) || row.length < 10) { // Minimal 10 kolom
      log(`Row skipped due to invalid format: ${row}`, 'WARN');
      return null;
    }
    const kategoriIndex = headerRow.indexOf('Kategori Barang');
    const kodeIndex = headerRow.indexOf('Kode Barang');
    const nameIndex = headerRow.indexOf('Nama Barang');
    const qtyIndex = headerRow.indexOf('Kuantitas');
    const gudangIndex = headerRow.indexOf('Nama Gudang');
    if (kategoriIndex < 0 || kodeIndex < 0 || nameIndex < 0 || qtyIndex < 0 || gudangIndex < 0) {
      log(`Invalid indices for row: ${row}`, 'WARN');
      return null;
    }
    const kategori = row[kategoriIndex]?.trim() || '';
    const kode = row[kodeIndex]?.trim() || '';
    const nama = row[nameIndex]?.trim() || 'Unnamed Item';
    const qty = row[qtyIndex] ? String(row[qtyIndex]).replace(/\D/g, '') || '0' : '0';
    const gudang = row[gudangIndex]?.trim() || 'Main';
    if (!nama || nama === 'Unnamed Item') {
      log(`Skipping row due to invalid name: ${row}`, 'WARN');
      return null;
    }
    return { kategori, kode, nama, gudang, qty };
  }).filter(item => item !== null);

  log('Processed data (Sheet1):', data, 'INFO');

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
  log('Padded data (Sheet1):', paddedData, 'INFO');

  return paddedData;
}

async function updateSheetFromFile(bot, msg, sheetName) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const allowedUserIds = process.env.ALLOWED_USER_ID ? process.env.ALLOWED_USER_ID.split(',').map(id => parseInt(id.trim())) : [];

  if (allowedUserIds.length > 0 && !allowedUserIds.includes(userId)) {
    log(`Access denied for user ${userId} in chat ${chatId}`, 'WARN');
    await bot.sendMessage(chatId, '⚠️ Maaf, hanya admin yang boleh mengunggah file.', { parse_mode: 'Markdown' });
    return;
  }

  const fileId = msg.document.file_id;
  log(`Attempting to get file with fileId: ${fileId}`, 'INFO');
  const file = await bot.getFile(fileId);
  if (!file || !file.file_path) {
    log('Failed to get file information from Telegram', 'ERROR');
    await bot.sendMessage(chatId, '⚠️ Gagal mengambil informasi file dari Telegram.', { parse_mode: 'Markdown' });
    return;
  }
  const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${file.file_path}`;
  log(`Generated file URL: ${fileUrl}`, 'INFO');

  try {
    const response = await fetch(fileUrl, { method: 'GET' });
    log(`Fetch response status: ${response.status} ${response.statusText}`, 'INFO');
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parsing data
    const { headerRow, dataRows } = parseExcelData(buffer);
    // Mapping data ke format Spreadsheet
    const paddedData = mapToSheet1Data(dataRows, headerRow);

    if (paddedData.length === 0) {
      throw new Error('No valid data found in the file after processing.');
    }

    // Ambil jumlah baris aktual untuk pembersihan range dinamis
    const existingData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A2:L',
    });
    const rowCount = existingData.data.values?.length || 0;
    const clearRange = `Sheet1!A2:L${rowCount + 1}`;
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: clearRange,
    });
    log(`Cleared old data in range ${clearRange}`, 'INFO');

    // Tentukan range dinamis berdasarkan jumlah data
    const startRow = 2;
    const endRow = startRow + paddedData.length - 1;
    const range = `Sheet1!A${startRow}:L${endRow}`;
    const timestampRange = 'Sheet1!L1';
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
      valueInputOption: 'RAW',
      resource: { values: paddedData },
    });

    // Update timestamp
    const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/,/, '');
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: timestampRange,
      valueInputOption: 'RAW',
      resource: { values: [[now]] },
    });

    log(`Data in ${sheetName} successfully updated at ${now} (rows: ${paddedData.length})`, 'INFO');
    await bot.sendMessage(chatId, `✅ Data di ${sheetName} berhasil diperbarui pada ${now}. Total baris: ${paddedData.length}.`, { parse_mode: 'Markdown' });
  } catch (err) {
    log(`Error updating sheet ${sheetName}: ${err.message}`, 'ERROR');
    await bot.sendMessage(chatId, `⚠️ Gagal memperbarui data. Pastikan format file dan caption (/sheet1) sesuai. Error: ${err.message}`, { parse_mode: 'Markdown' });
  }
}

module.exports = updateSheetFromFile;