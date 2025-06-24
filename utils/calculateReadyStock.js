function calculateReadyStock(stokData, pesananData) {
  const result = [];

  for (const stok of stokData) {
    const totalPesanan = pesananData
      .filter(p => p.nama.toLowerCase().includes(stok.nama.toLowerCase()))
      .map(p => ({
        pelanggan: p.pelanggan,
        qty: parseInt(p.qty || '0', 10) || 0
      }));

    const totalQtyPesanan = totalPesanan.reduce((acc, p) => acc + p.qty, 0);
    const stokQty = parseInt(stok.qty || '0', 10) || 0;
    const readyQty = Math.max(stokQty - totalQtyPesanan, 0);

    result.push({
      nama: stok.nama,
      gudang: stok.gudang,
      qty: stokQty,
      ready: readyQty,
      pesanan: totalPesanan
    });
  }

  return result;
}

module.exports = calculateReadyStock;
