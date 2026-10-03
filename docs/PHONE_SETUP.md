# Phone-only setup

The simplest route is GitHub Codespaces in Chrome on Android. No laptop is required.

### Upload from phone
GitHub app/browser → New repository → Add file → Upload files → select the extracted project files.

If the ZIP cannot be extracted by the GitHub UI, use the Files app on Android to extract it first, or upload the ZIP to Codespaces and unzip it there.

### Codespaces commands
```bash
cd server && npm install
cp .env.example .env
npm run seed-admin
npm start
```
Open a second terminal:
```bash
cd apps/member-app && npm install && npm start
```
Open a third:
```bash
cd apps/admin-panel && npm install && npm start
```

Use the forwarded HTTPS URLs shown by Codespaces.
