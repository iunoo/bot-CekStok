class Validator {
  static isValidUserId(userId) {
    return Number.isInteger(userId) && userId > 0;
  }

  static isValidKeyword(keyword) {
    return typeof keyword === 'string' && keyword.trim().length > 0;
  }

  static sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    return input.trim().substring(0, 100); // Limit panjang input
  }

  static isValidFileId(fileId) {
    return typeof fileId === 'string' && fileId.length > 0;
  }

  static isValidChatId(chatId) {
    return Number.isInteger(chatId);
  }

  static isValidCommand(text) {
    if (typeof text !== 'string') return false;
    return text.startsWith('/') && text.length > 1;
  }

  static isValidCaption(caption, expectedCommands = []) {
    if (!caption || typeof caption !== 'string') return false;
    const trimmed = caption.toLowerCase().trim();
    return expectedCommands.some(cmd => trimmed.startsWith(cmd));
  }

  static extractKeyword(text) {
    if (!text || typeof text !== 'string') return '';
    return text.trim().substring(0, 50); // Limit keyword length
  }

  static isValidPageNumber(page) {
    return Number.isInteger(page) && page >= 0;
  }
}

module.exports = Validator;