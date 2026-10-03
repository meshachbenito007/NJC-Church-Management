const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { google } = require('googleapis');

require('dotenv').config({
  path: path.join(__dirname, '../../.env')
});

let driveClient;

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function getDriveClient() {
  if (driveClient) return driveClient;

  const clientId = required('GOOGLE_OAUTH_CLIENT_ID');
  const clientSecret = required('GOOGLE_OAUTH_CLIENT_SECRET');
  const refreshToken = required('GOOGLE_OAUTH_REFRESH_TOKEN');

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    process.env.GOOGLE_OAUTH_REDIRECT_URI || 'http://localhost:3000/oauth2callback'
  );

  oauth2Client.setCredentials({
    refresh_token: refreshToken
  });

  driveClient = google.drive({
    version: 'v3',
    auth: oauth2Client
  });

  return driveClient;
}

function getDriveFolderId() {
  return required('GOOGLE_DRIVE_FOLDER_ID');
}

function cleanExtension(name) {
  const ext = path.extname(name || '').toLowerCase();
  const allowed = new Set([
    '.mp3', '.jpg', '.jpeg', '.png', '.webp', '.gif',
    '.mp4', '.webm', '.mov', '.m4v'
  ]);
  return allowed.has(ext) ? ext : '';
}

function safePrefix(category, mimeType) {
  if (category) {
    return String(category)
      .replace(/[^a-z0-9_-]/gi, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'media';
  }
  if (mimeType?.startsWith('audio/')) return 'sermon-audio';
  if (mimeType?.startsWith('image/')) return 'sermon-image';
  if (mimeType?.startsWith('video/')) return 'sermon-video';
  return 'sermon-file';
}

async function uploadFile(filePath, originalName, mimeType, category) {
  const drive = getDriveClient();
  const folderId = getDriveFolderId();
  const ext = cleanExtension(originalName);

  if (!ext) throw new Error(`Unsupported file type: ${originalName}`);

  const prefix = safePrefix(category, mimeType);
  const uniqueName = `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;

  try {
    const response = await drive.files.create({
      requestBody: {
        name: uniqueName,
        parents: [folderId],
        mimeType
      },
      media: {
        mimeType,
        body: fs.createReadStream(filePath)
      },
      fields: 'id,name,mimeType,size,webViewLink,webContentLink'
    });

    const file = response.data;
    return {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType || mimeType,
      size: file.size,
      webViewLink: file.webViewLink || null,
      webContentLink: file.webContentLink || null
    };
  } finally {
    try { await fs.promises.unlink(filePath); } catch (_) {}
  }
}

async function getFileMetadata(fileId) {
  return (await getDriveClient().files.get({
    fileId,
    fields: 'id,name,mimeType,size'
  })).data;
}

async function getFileStream(fileId, range) {
  const options = { responseType: 'stream' };
  if (range) options.headers = { Range: range };

  const response = await getDriveClient().files.get(
    { fileId, alt: 'media' },
    options
  );

  return { stream: response.data, response };
}

module.exports = { uploadFile, getFileMetadata, getFileStream };
