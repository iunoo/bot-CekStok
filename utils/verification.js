const fs = require('fs');
const Logger = require('./logger');
const config = require('../config/constants');

const verifiedUsersFile = config.verification.usersFile;
let verificationStatus = {};

function loadVerificationStatus() {
  try {
    if (fs.existsSync(verifiedUsersFile)) {
      const data = fs.readFileSync(verifiedUsersFile, 'utf8');
      verificationStatus = JSON.parse(data);
      Logger.info(`Loaded verification status for ${Object.keys(verificationStatus).length} users`);
    } else {
      verificationStatus = {};
      Logger.info('No existing verification file found, starting fresh');
    }
  } catch (err) {
    Logger.error(`Error loading verified users: ${err.message}`);
    verificationStatus = {};
  }
}

function saveVerificationStatus() {
  try {
    fs.writeFileSync(verifiedUsersFile, JSON.stringify(verificationStatus, null, 2));
    Logger.debug('Verification status saved successfully');
  } catch (err) {
    Logger.error(`Error saving verified users: ${err.message}`);
  }
}

function isVerified(userId) {
  return verificationStatus[userId] === true;
}

function verifyUser(userId, name, verificationNames, allowedUserIds) {
  const lowerName = name.toLowerCase();
  
  if (verificationNames.includes(lowerName) || allowedUserIds.includes(parseInt(userId))) {
    verificationStatus[userId] = true;
    saveVerificationStatus();
    Logger.info(`User ${userId} verified with name: ${name}`);
    return true;
  }
  
  Logger.warn(`Verification failed for user ${userId} with name: ${name}`);
  return false;
}

function resetVerification() {
  verificationStatus = {};
  saveVerificationStatus();
  Logger.info('All verification status reset');
}

function getVerificationStats() {
  return {
    totalVerified: Object.keys(verificationStatus).length,
    verifiedUsers: Object.keys(verificationStatus)
  };
}

module.exports = {
  loadVerificationStatus,
  saveVerificationStatus,
  isVerified,
  verifyUser,
  resetVerification,
  getVerificationStats
};