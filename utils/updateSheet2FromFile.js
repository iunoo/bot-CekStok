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

// Fungsi konversi serial date Excel ke format DD/MM/YYYY (adjust bug 1900)
function excelSerialToDate(serial) {
  if (typeof serial !== 'number' || isNaN(serial)) {
    // Kalau bukan angka, anggap udah string tanggal (misal, "08/05/25")
    return serial?.trim() || '';
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
  log('Header row (raw):', headerRow, 'INFO');
  const dataRows = rawData.slice(1);
  log('Data rows (after header):', dataRows, 'INFO');

  return { headerRow, dataRows };
}

// Fungsi mapping data ke format Spreadsheet untuk Sheet2
function mapToSheet2Data(dataRows, headerRow) {
  // Validasi header untuk Sheet2
  const requiredHeaders = ['Wilayah', 'Kota', 'No. Pelanggan', 'Nama Pelanggan', 'Kategori Barang', 'Kode Barang', 'Nama Barang', 'Qty', 'Satuan', 'Total Harga', 'Nomor PO', 'Tgl. Pesan'];
  const foundHeaders = requiredHeaders.filter(header => headerRow.includes(header));
  if (foundHeaders.length !== requiredHeaders.length) {
    throw new Error(`Format file tidak sesuai untuk Sheet2. Header yang hilang: ${requiredHeaders.filter(h => !foundHeaders.includes(h)).join(', ')}`);
  }

  const data = dataRows.map(row => {
    if (!Array.isArray(row) || row.length < 24) { // Minimal 24 kolom (0-23)
      log(`Row skipped due to invalid format: ${row}`, 'WARN');
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
      log(`Invalid indices for row: ${row}`, 'WARN');
      return null;
    }
    const wilayah = row[wilayahIndex]?.trim() || '';
    const kota = row[kotaIndex]?.trim() || '';
    const noPelanggan = row[noPelangganIndex]?.trim() || '';
    const namaPelanggan = row[namaPelangganIndex]?.trim() || '';
    const kategori = row[kategoriIndex]?.trim() || '';
    const kode = row[kodeIndex]?.trim() || '';
    const nama = row[nameIndex]?.trim() || 'Unnamed Item';
    const qty = row[qtyIndex] ? String(row[qtyIndex]).replace(/\D/g, '') || '0' : '0';
    const satuan = row[satuanIndex]?.trim() || '';
    const totalHargaRaw = row[totalHargaIndex];
    const totalHarga = totalHargaRaw !== undefined && totalHargaRaw !== null 
      ? String(totalHargaRaw).trim() || '0' 
      : '0';
    const nomorPO = row[nomorPOIndex]?.trim() || '';
    const tglPesanRaw = row[tglPesanIndex];
    const tglPesan = tglPesanRaw !== undefined && tglPesanRaw !== null 
      ? excelSerialToDate(tglPesanRaw) 
      : '';
    log(`Raw tglPesan at index ${tglPesanIndex}: ${tglPesanRaw} (type: ${typeof tglPesanRaw}), Converted: ${tglPesan}`, 'INFO'); // Debug
    if (!nama || nama === 'Unnamed Item') {
      log(`Skipping row due to invalid name: ${row}`, 'WARN');
      return null;
    }
    return { wilayah, kota, noPelanggan, namaPelanggan, kategori, kode, nama, qty, satuan, totalHarga, nomorPO, tglPesan };
  }).filter(item => item !== null);

  log('Processed data (Sheet2):', data, 'INFO');

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
  log('Padded data (Sheet2):', paddedData, 'INFO');

  return paddedData;
}

async function updateSheet2FromFile(bot, msg) {
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
    const paddedData = mapToSheet2Data(dataRows, headerRow);

    if (paddedData.length === 0) {
      throw new Error('No valid data found in the file after processing.');
    }

    // Ambil jumlah baris aktual untuk pembersihan range dinamis
    const existingData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet2!A2:X',
    });
    const rowCount = existingData.data.values?.length || 0;
    const clearRange = `Sheet2!A2:X${rowCount + 1}`;
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: clearRange,
    });
    log(`Cleared old data in range ${clearRange}`, 'INFO');

    // Tentukan range dinamis berdasarkan jumlah data
    const startRow = 2;
    const endRow = startRow + paddedData.length - 1;
    const range = `Sheet2!A${startRow}:X${endRow}`;
    const timestampRange = 'Sheet2!Y1';
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

    log(`Data in Sheet2 successfully updated at ${now} (rows: ${paddedData.length})`, 'INFO');
    await bot.sendMessage(chatId, `✅ Data di Sheet2 berhasil diperbarui pada ${now}. Total baris: ${paddedData.length}.`, { parse_mode: 'Markdown' });
  } catch (err) {
    log(`Error updating sheet Sheet2: ${err.message}`, 'ERROR');
    await bot.sendMessage(chatId, `⚠️ Gagal memperbarui data. Pastikan format file dan caption (/sheet2) sesuai. Error: ${err.message}`, { parse_mode: 'Markdown' });
  }
}

module.exports = updateSheet2FromFile;