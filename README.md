# NJC Church Management App — Complete Phone-Ready Project

A complete starter implementation for a church member PWA, admin panel, Node.js API and MySQL database. It is designed so the whole development workflow can be done from an Android phone using GitHub Codespaces.

## Included
- Member PWA: splash/home, OTP login, registration, announcements, events, prayer requests, Bible verses, sermons, profile
- Admin panel: dashboard, members, address/map coordinates, content management, prayer management, expenses and balance
- Roles: super_admin, pastor, church_admin, finance_admin, event_manager, content_manager
- Finance is **expenses/spent balance only**. There is no donation/offering/payment module.
- MySQL schema
- Google Drive upload service for large files
- PWA manifest + service worker

## Phone setup
1. Create a GitHub repository and upload this folder.
2. Open the repository on your phone in Chrome.
3. Tap **Code → Codespaces → Create codespace on main**.
4. In the Codespace terminal:
   ```bash
   cd server
   npm install
   cp .env.example .env
   # edit .env with your cloud MySQL details
   npm run seed-admin
   npm start
   ```
5. In a second terminal, run the member PWA:
   ```bash
   cd apps/member-app
   npm install
   npm start
   ```
6. Run the admin panel in another terminal:
   ```bash
   cd apps/admin-panel
   npm install
   npm start
   ```

Codespaces will provide forwarded HTTPS URLs. Use the API URL in the browser app's `localStorage` if the API is not on localhost:
```js
localStorage.API_URL='https://YOUR-API-CODESPACE-URL/api'
```

## Database
Import `database/schema.sql` into your MySQL database. Then set MYSQL_HOST, MYSQL_PORT, MYSQL_DATABASE, MYSQL_USER and MYSQL_PASSWORD in `server/.env`.

## Development admin
If the database has no admin row, the API accepts `admin / Admin@123` as a temporary development login. For a real deployment, run `npm run seed-admin` with a strong `ADMIN_PASSWORD` and remove the development fallback in `server/src/index.js`.

## Google Drive
Create a Google Cloud service account, enable Drive API, share your target Drive folder with the service account, then set `GOOGLE_SERVICE_ACCOUNT_JSON` and `GOOGLE_DRIVE_FOLDER_ID` in `.env`. Never place Google credentials in the frontend.

## Production checklist
- Replace console OTP with an SMS OTP provider
- Use HTTPS and a strong JWT secret
- Remove development admin fallback
- Add rate limiting, validation, audit logs and backups
- Configure Google Drive service account securely
- Add real push notifications if required
- Configure a proper PWA icon set
- Build Android with PWABuilder/Trusted Web Activity or Capacitor after deployment

## Architecture
Member PWA + Admin Web → Node.js/Express API → MySQL; files → Google Drive.
