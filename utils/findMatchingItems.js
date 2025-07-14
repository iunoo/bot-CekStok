const Logger = require('./logger');

function findMatchingItems(keyword, data, legacyLog) {
  // Support for legacy log parameter (backward compatibility)
  const log = legacyLog || Logger;
  
  const matches = [];
  const lowerKeyword = keyword.toLowerCase().trim();
  
  log.debug(`Finding matches for keyword: "${keyword}", data length: ${data ? data.length : 'undefined'}`);

  if (!data || !Array.isArray(data) || !lowerKeyword) {
    log.warn('Data invalid or keyword empty, returning empty array');
    return matches;
  }

  for (const item of data) {
    if (!item || typeof item !== 'object') {
      log.warn(`Skipping invalid item: ${JSON.stringify(item)}`);
      continue;
    }
    
    const name = item.nama;
    if (!name || typeof name !== 'string') {
      log.warn(`Invalid name for item: ${JSON.stringify(item)}`);
      continue;
    }
    
    const lowerName = name.toLowerCase();
    
    // Use Levenshtein distance for fuzzy matching
    const distance = require('fast-levenshtein').get(lowerName, lowerKeyword);

    if ((lowerName.includes(lowerKeyword) || distance < 3) && lowerKeyword.length > 0) {
      matches.push(item);
      log.debug(`Matched item: ${name} with distance ${distance}`);
    }
  }

  log.info(`Found ${matches.length} matching items for keyword: "${keyword}"`);
  return matches;
}

module.exports = findMatchingItems;