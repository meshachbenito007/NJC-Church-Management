const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

require('dotenv').config({
  path: path.join(__dirname, '../../.env')
});

function getDriveFolder() {
  const folder = process.env.GOOGLE_DRIVE_LOCAL_FOLDER;

  if (!folder) {
    throw new Error(
      'GOOGLE_DRIVE_LOCAL_FOLDER is not configured'
    );
  }

  if (!fs.existsSync(folder)) {
    throw new Error(
      `Google Drive folder does not exist: ${folder}`
    );
  }

  return folder;
}

function cleanExtension(name) {
  const ext = path.extname(name || '').toLowerCase();

  if (ext === '.mp3') return '.mp3';

  if (ext === '.jpg' || ext === '.jpeg') return ext;
  if (ext === '.png') return '.png';
  if (ext === '.webp') return '.webp';
  if (ext === '.gif') return '.gif';

  return '';
}

async function uploadFile(filePath, originalName, mimeType) {
  const folder = getDriveFolder();

  const ext = cleanExtension(originalName);

  if (!ext) {
    throw new Error(
      'Unsupported file type'
    );
  }

  const prefix =
    mimeType?.startsWith('audio/')
      ? 'sermon-audio'
      : mimeType?.startsWith('image/')
        ? 'sermon-image'
        : 'sermon-file';

  const uniqueName =
    `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;

  const destination =
    path.join(folder, uniqueName);

  await fs.promises.copyFile(
    filePath,
    destination
  );

  return {
    id: uniqueName,
    name: uniqueName,
    mimeType,
    localPath: destination
  };
}

module.exports = {
  uploadFile
};
