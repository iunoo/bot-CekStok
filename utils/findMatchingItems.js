function findMatchingItems(keyword, data, log) {
  const matches = [];
  const lowerKeyword = keyword.toLowerCase().trim();
  log(`Finding matches for keyword: "${keyword}", data length: ${data ? data.length : 'undefined'}`, 'DEBUG');

  if (!data || !Array.isArray(data) || !lowerKeyword) {
    log(`Error: Data invalid or keyword empty, returning empty array`, 'WARN');
    return matches;
  }

  for (const item of data) {
    if (!item || typeof item !== 'object') {
      log(`Skipping invalid item: ${JSON.stringify(item)}`, 'WARN');
      continue;
    }
    const name = item.nama;
    if (!name || typeof name !== 'string') {
      log(`Invalid name for item: ${JSON.stringify(item)}`, 'WARN');
      continue;
    }
    const lowerName = name.toLowerCase();
    const distance = require('fast-levenshtein').get(lowerName, lowerKeyword);

    if ((lowerName.includes(lowerKeyword) || distance < 3) && lowerKeyword.length > 0) {
      matches.push(item);
      log(`Matched item: ${name} with distance ${distance}`, 'DEBUG');
    }
  }

  log(`Found ${matches.length} matching items`, 'DEBUG');
  return matches;
}

module.exports = findMatchingItems;