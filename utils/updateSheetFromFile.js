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

// Fungsi konversi serial date Excel ke format DD/MM/YYYY (adjust bug 1900)
function excelSerialToDate(serial) {
  if (typeof serial !== 'number' || isNaN(serial)) {
    // Kalau bukan angka, anggap udah string tanggal (misal, "08/05/25")
    return serial?.toString().trim() || '';
  }
  
  const excelEpoch = new Date('1900-01-01'); // Adjust buat bug Excel 1900
  const date = new Date(excelEpoch.getTime() + (serial - 2) * 24 * 60 * 60 * 1000); // -2 buat kompensasi
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0'); // +1 karena Januari = 0
  const year = date.getFullYear();
  
  return `${day}/${month}/${year}`;
}

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
  
  Logger.info(`Excel parsed for Sheet2 - Header: ${JSON.stringify(headerRow)}`);
  Logger.debug(`Data rows count: ${dataRows.length}`);

  return { headerRow, dataRows };
}

// Fungsi mapping data ke format Spreadsheet untuk Sheet2
function mapToSheet2Data(dataRows, headerRow) {
  // Validasi header untuk Sheet2
  const requiredHeaders = ['Wilayah', 'Kota', 'No. Pelanggan', 'Nama Pelanggan', 'Kategori Barang', 'Kode Barang', 'Nama Barang', 'Qty', 'Satuan', 'Total Harga', 'Nomor PO', 'Tgl. Pesan'];
  const foundHeaders = requiredHeaders.filter(header => headerRow.includes(header));
  
  if (foundHeaders.length !== requiredHeaders.length) {
    const missingHeaders = requiredHeaders.filter(h => !foundHeaders.includes(h));
    throw new Error(`Format file tidak sesuai untuk Sheet2. Header yang hilang: ${missingHeaders.join(', ')}`);
  }

  const data = dataRows.map((row, index) => {
    if (!Array.isArray(row) || row.length < 24) { // Minimal 24 kolom (0-23)
      Logger.warn(`Row ${index + 2} skipped due to invalid format: ${JSON.stringify(row)}`);
      return null;
    }
    
    const wilayahIndex = headerRow.indexOf('Wilayah');
    const kotaIndex = headerRow.indexOf('Kota');
    const noPelangganIndex = headerRow.indexOf('No. Pelanggan');
    const namaPelangganIndex = headerRow.indexOf('Nama Pelanggan');
    const kategoriIndex = headerRow.indexOf('Kategori Barang');
    const kodeIndex = headerRow.indexOf('Kode Barang');
    const nameIndex = headerRow.indexOf('Nama Barang');
    const qtyIndex = headerRow.indexOf('Qty');
    const satuanIndex = headerRow.indexOf('Satuan');
    const totalHargaIndex = headerRow.indexOf('Total Harga');
    const nomorPOIndex = headerRow.indexOf('Nomor PO');
    const tglPesanIndex = headerRow.indexOf('Tgl. Pesan');
    
    if ([wilayahIndex, kotaIndex, noPelangganIndex, namaPelangganIndex, kategoriIndex, kodeIndex, nameIndex, qtyIndex, satuanIndex, totalHargaIndex, nomorPOIndex, tglPesanIndex].some(idx => idx < 0)) {
      Logger.warn(`Invalid indices for row ${index + 2}: ${JSON.stringify(row)}`);
      return null;
    }
    
    const wilayah = row[wilayahIndex]?.toString().trim() || '';
    const kota = row[kotaIndex]?.toString().trim() || '';
    const noPelanggan = row[noPelangganIndex]?.toString().trim() || '';
    const namaPelanggan = row[namaPelangganIndex]?.toString().trim() || '';
    const kategori = row[kategoriIndex]?.toString().trim() || '';
    const kode = row[kodeIndex]?.toString().trim() || '';
    const nama = row[nameIndex]?.toString().trim() || 'Unnamed Item';
    const qty = row[qtyIndex] ? row[qtyIndex].toString().replace(/\D/g, '') || '0' : '0';
    const satuan = row[satuanIndex]?.toString().trim() || '';
    const totalHargaRaw = row[totalHargaIndex];
    const totalHarga = totalHargaRaw !== undefined && totalHargaRaw !== null 
      ? totalHargaRaw.toString().trim() || '0' 
      : '0';
    const nomorPO = row[nomorPOIndex]?.toString().trim() || '';
    const tglPesanRaw = row[tglPesanIndex];
    const tglPesan = tglPesanRaw !== undefined && tglPesanRaw !== null 
      ? excelSerialToDate(tglPesanRaw) 
      : '';
    
    Logger.debug(`Row ${index + 2} - tglPesan: ${tglPesanRaw} (${typeof tglPesanRaw}) -> ${tglPesan}`);
    
    if (!nama || nama === 'Unnamed Item') {
      Logger.warn(`Row ${index + 2} skipped due to invalid name: ${JSON.stringify(row)}`);
      return null;
    }
    
    return { wilayah, kota, noPelanggan, namaPelanggan, kategori, kode, nama, qty, satuan, totalHarga, nomorPO, tglPesan };
  }).filter(item => item !== null);

  Logger.info(`Processed ${data.length} valid items from ${dataRows.length} rows for Sheet2`);

  // Mapping ke 24 kolom untuk Sheet2!A2:X dengan offset
  const paddedData = data.map(item => [
    '',              // Kolom A (kosong)
    item.wilayah,    // Kolom B
    '',              // Kolom C
    item.kota,       // Kolom D
    '',              // Kolom E
    item.noPelanggan,// Kolom F
    '',              // Kolom G
    item.namaPelanggan, // Kolom H
    '',              // Kolom I
    item.kategori,   // Kolom J
    '',              // Kolom K
    item.kode,       // Kolom L
    '',              // Kolom M
    item.nama,       // Kolom N
    '',              // Kolom O
    item.qty,        // Kolom P
    '',              // Kolom Q
    item.satuan,     // Kolom R
    '',              // Kolom S
    item.totalHarga, // Kolom T
    '',              // Kolom U
    item.nomorPO,    // Kolom V
    '',              // Kolom W
    item.tglPesan,   // Kolom X
  ]);

  return paddedData;
}

async function updateSheet2FromFile(bot, msg) {
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
  Logger.info(`Processing file upload: ${fileId} for Sheet2`);

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
    const paddedData = mapToSheet2Data(dataRows, headerRow);

    if (paddedData.length === 0) {
      throw new Error('No valid data found in the file after processing.');
    }

    // Clear existing data
    const existingData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet2!A2:X',
    });
    
    const rowCount = existingData.data.values?.length || 0;
    if (rowCount > 0) {
      const clearRange = `Sheet2!A2:X${rowCount + 1}`;
      await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: clearRange,
      });
      Logger.info(`Cleared old data in range ${clearRange}`);
    }

    // Update with new data
    const startRow = 2;
    const endRow = startRow + paddedData.length - 1;
    const range = `Sheet2!A${startRow}:X${endRow}`;
    
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
      range: 'Sheet2!Y1',
      valueInputOption: 'RAW',
      resource: { values: [[now]] },
    });

    Logger.info(`Sheet2 updated successfully at ${now} with ${paddedData.length} rows`);
    await bot.sendMessage(chatId, 
      `✅ Data di Sheet2 berhasil diperbarui pada ${now}. Total baris: ${paddedData.length}.`, 
      { parse_mode: 'Markdown' }
    );

  } catch (error) {
    Logger.error(`Error updating Sheet2: ${error.stack}`);
    await bot.sendMessage(chatId, 
      `⚠️ Gagal memperbarui data. Pastikan format file dan caption (/sheet2) sesuai. Error: ${error.message}`, 
      { parse_mode: 'Markdown' }
    );
  }
}

module.exports = updateSheet2FromFile;