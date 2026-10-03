// One-time local setup for NJC Google Drive OAuth.
// Run this on your own computer, not on Render.
// Never commit this file together with real credentials or tokens.

const http = require('http');
const { URL } = require('url');
const { google } = require('googleapis');

require('dotenv').config();

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_OAUTH_REDIRECT_URI || 'http://localhost:3000/oauth2callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in your local .env first.');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
const state = require('crypto').randomBytes(32).toString('hex');

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  include_granted_scopes: true,
  scope: ['https://www.googleapis.com/auth/drive'],
  state
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3000');

  if (url.pathname !== '/oauth2callback') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('NJC Google Drive OAuth setup is running. Open the authorization URL shown in your terminal.');
    return;
  }

  if (url.searchParams.get('state') !== state) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('State mismatch. Stop the script and try again.');
    return;
  }

  const error = url.searchParams.get('error');
  if (error) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Google authorization failed: ${error}`);
    server.close(() => process.exit(1));
    return;
  }

  const code = url.searchParams.get('code');
  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No authorization code returned.');
    server.close(() => process.exit(1));
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) {
      throw new Error('Google did not return a refresh token. Re-run with prompt=consent.');
    }

    console.log('\nSUCCESS. Save these values as Render environment variables.\n');
    console.log(`GOOGLE_OAUTH_CLIENT_ID=${CLIENT_ID}`);
    console.log(`GOOGLE_OAUTH_CLIENT_SECRET=${CLIENT_SECRET}`);
    console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log(`GOOGLE_OAUTH_REDIRECT_URI=${REDIRECT_URI}`);
    console.log(`GOOGLE_DRIVE_FOLDER_ID=${process.env.GOOGLE_DRIVE_FOLDER_ID || '<your-folder-id>'}`);
    console.log('\nDo NOT commit these values to GitHub or paste them into chat.\n');

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h2>NJC Google Drive authorization successful.</h2><p>You can close this browser tab and return to the terminal.</p>');
    server.close(() => process.exit(0));
  } catch (err) {
    console.error('\nOAuth token exchange failed:', err.message);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('OAuth token exchange failed. Check the terminal for details.');
    server.close(() => process.exit(1));
  }
});

server.listen(3000, '127.0.0.1', () => {
  console.log('\nOpen this URL in your browser:\n');
  console.log(authUrl);
  console.log('\nWaiting for Google to redirect to http://localhost:3000/oauth2callback ...\n');
});
