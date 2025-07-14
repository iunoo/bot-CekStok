const { google } = require('googleapis');
const Logger = require('./logger');
const config = require('../config/constants');

const auth = new google.auth.GoogleAuth({
  keyFile: config.google.credentialsFile,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = config.google.spreadsheetId;

// Fungsi untuk validasi dan bersihkan timestamp
function cleanTimestamp(raw) {
  if (!raw || typeof raw !== 'string') return '';
  
  // Regex untuk cocokkan format DD/MM/YYYY HH.MM.SS
  const match = raw.match(/\d{2}\/\d{2}\/\d{4}\s+\d{2}\.\d{2}\.\d{2}/);
  const cleaned = match ? match[0].trim() : '';
  
  Logger.debug(`Raw timestamp: "${raw}", Cleaned: "${cleaned}"`);
  return cleaned;
}

async function getSheetsData() {
  try {
    Logger.debug('Fetching data from Google Sheets...');
    
    const [stokResponse, pesananResponse, stokTimeRes, pesananTimeRes] = await Promise.all([
      sheets.spreadsheets.values.get({ 
        spreadsheetId: SPREADSHEET_ID, 
        range: 'Sheet1!A2:L' 
      }),
      sheets.spreadsheets.values.get({ 
        spreadsheetId: SPREADSHEET_ID, 
        range: 'Sheet2!A2:Z' 
      }),
      sheets.spreadsheets.values.get({ 
        spreadsheetId: SPREADSHEET_ID, 
        range: 'Sheet1!L1' 
      }),
      sheets.spreadsheets.values.get({ 
        spreadsheetId: SPREADSHEET_ID, 
        range: 'Sheet2!Y1' 
      }),
    ]);

    // Process stok data
    const stokData = (stokResponse.data.values || []).map(row => ({
      nama: row[5]?.trim() || '',
      gudang: row[9]?.trim() || '',
      qty: row[7]?.replace(/\D/g, '') || '0',
    })).filter(item => item.nama !== '');

    // Process pesanan data
    const pesananData = (pesananResponse.data.values || []).map(row => ({
      pelanggan: row[7]?.trim() || '',
      nama: row[13]?.trim() || '',
      qty: row[15]?.replace(/\D/g, '') || '0',
    })).filter(item => item.nama !== '');

    // Get timestamps
    const rawUpdatedAtStok = stokTimeRes.data.values?.[0]?.[0]?.trim() || '';
    const rawUpdatedAtPesanan = pesananTimeRes.data.values?.[0]?.[0]?.trim() || '';

    const result = {
      stokData,
      pesananData,
      updatedAtStok: cleanTimestamp(rawUpdatedAtStok),
      updatedAtPesanan: cleanTimestamp(rawUpdatedAtPesanan),
    };

    Logger.info(`Sheets data fetched - Stok: ${stokData.length} items, Pesanan: ${pesananData.length} items`);
    return result;

  } catch (error) {
    Logger.error(`Error fetching sheets data: ${error.message}`);
    throw error;
  }
}

module.exports = getSheetsData;