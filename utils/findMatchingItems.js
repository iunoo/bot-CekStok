function normalize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

function findMatchingItems(keyword, calculatedStock) {
  if (!Array.isArray(calculatedStock)) return [];
  const normKeyword = normalize(keyword);
  return calculatedStock.filter(item =>
    normalize(item.nama).includes(normKeyword)
  );
}

module.exports = findMatchingItems;
