const fs = require('fs');

const verifiedUsersFile = 'verified-users.json';
let verificationStatus = {};

function loadVerificationStatus() {
  try {
    if (fs.existsSync(verifiedUsersFile)) {
      const data = fs.readFileSync(verifiedUsersFile, 'utf8');
      verificationStatus = JSON.parse(data); // Validasi JSON
    } else {
      verificationStatus = {};
    }
  } catch (err) {
    console.error(`Error loading verified users: ${err.message}`);
    verificationStatus = {};
  }
}

function saveVerificationStatus() {
  try {
    fs.writeFileSync(verifiedUsersFile, JSON.stringify(verificationStatus, null, 2));
  } catch (err) {
    console.error(`Error saving verified users: ${err.message}`);
  }
}

function isVerified(userId) {
  return verificationStatus[userId] === true;
}

function verifyUser(userId, name, verificationNames, allowedUserIds) {
  if (verificationNames.includes(name.toLowerCase()) || allowedUserIds.includes(parseInt(userId))) {
    verificationStatus[userId] = true;
    saveVerificationStatus();
    return true;
  }
  return false;
}

function resetVerification() {
  verificationStatus = {};
  saveVerificationStatus();
}

module.exports = {
  loadVerificationStatus,
  saveVerificationStatus,
  isVerified,
  verifyUser,
  resetVerification,
};