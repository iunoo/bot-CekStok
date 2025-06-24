const itemsPerPage = 5; // Deklarasi itemsPerPage

function formatMessage(items, updatedAtStok, updatedAtPesanan, page = 0) {
  const start = page * itemsPerPage;
  const end = start + itemsPerPage;
  const pageItems = items.slice(start, end);

  let text = '';
  for (const item of pageItems) {
    text += `📦 *${item.nama}*\n`;                    // Nama barang
    text += `📍 Gudang: ${item.gudang}\n`;          // Tanpa indentasi
    text += `🛒 Stok: ${item.qty}\n`;               // Tanpa indentasi
    if (item.pesanan.length > 0) {
      text += `📝 Pesanan:\n`;                      // Tanpa indentasi
      for (const p of item.pesanan) {
        if (p.qty > 0) {
          text += `• *${p.pelanggan}* - ${p.qty}\n`; // Tanpa indentasi 4 spasi
        }
      }
    }
    text += `${item.ready === 0 ? '⚠️' : '✅'} *Stok Ready: ${item.ready}*\n`; // Tanpa indentasi
    text += `----------------------------------------\n`; // Pemisah
  }

  // Format timestamp dengan validasi dan bold untuk tanggal+jam
  const stokTime = updatedAtStok || 'Belum ada update';
  const pesananTime = updatedAtPesanan || 'Belum ada update';
  const stokTimeFormatted = stokTime === 'Belum ada update' ? stokTime : `*${stokTime}*`;
  const pesananTimeFormatted = pesananTime === 'Belum ada update' ? pesananTime : `*${pesananTime}*`;
  text += `\n📅 *Update Terakhir:*\n`;              // Tanpa indentasi
  text += `🕓 ${stokTimeFormatted} (Stok)\n`;      // Tanpa indentasi
  text += `🕓 ${pesananTimeFormatted} (Pesanan Belum Diproses)\n`; // Tanpa indentasi
  text += `📄 Halaman ${page + 1} dari ${Math.ceil(items.length / itemsPerPage)}`;

  const keyboard = [];
  const row = [];
  if (start > 0) row.push({ text: '⬅️ Sebelumnya', callback_data: `page_${page - 1}` });
  if (end < items.length) row.push({ text: 'Berikutnya ➡️', callback_data: `page_${page + 1}` });
  if (row.length > 0) keyboard.push(row);

  return {
    text: text.trim(),
    reply_markup: { inline_keyboard: keyboard }
  };
}

module.exports = formatMessage;