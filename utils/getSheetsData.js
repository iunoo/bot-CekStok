const { google } = require('googleapis');
require('dotenv').config();

const auth = new google.auth.GoogleAuth({
  keyFile: 'credentials.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

// Fungsi untuk validasi dan bersihkan timestamp
function cleanTimestamp(raw) {
  if (!raw || typeof raw !== 'string') return '';
  // Regex untuk cocokkan format DD/MM/YYYY HH.MM.SS
  const match = raw.match(/\d{2}\/\d{2}\/\d{4}\s+\d{2}\.\d{2}\.\d{2}/);
  const cleaned = match ? match[0].trim() : '';
  console.log(`[DEBUG] Raw timestamp: "${raw}", Cleaned: "${cleaned}"`);
  return cleaned;
}

async function getSheetsData() {
  const [stokResponse, pesananResponse, stokTimeRes, pesananTimeRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Sheet1!A2:L' }),
    sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Sheet2!A2:Z' }),
    sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Sheet1!L1' }),
    sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Sheet2!Y1' }),
  ]);

  const stokData = stokResponse.data.values.map(row => ({
    nama: row[5]?.trim() || '',
    gudang: row[9]?.trim() || '',
    qty: row[7]?.replace(/\D/g, '') || '0',
  })).filter(item => item.nama !== '');

  const pesananData = pesananResponse.data.values.map(row => ({
    pelanggan: row[7]?.trim() || '',
    nama: row[13]?.trim() || '',
    qty: row[15]?.replace(/\D/g, '') || '0',
  })).filter(item => item.nama !== '');

  const rawUpdatedAtStok = stokTimeRes.data.values?.[0]?.[0]?.trim() || '';
  const rawUpdatedAtPesanan = pesananTimeRes.data.values?.[0]?.[0]?.trim() || '';

  return {
    stokData,
    pesananData,
    updatedAtStok: cleanTimestamp(rawUpdatedAtStok),
    updatedAtPesanan: cleanTimestamp(rawUpdatedAtPesanan),
  };
}

module.exports = getSheetsData;