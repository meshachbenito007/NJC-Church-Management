# NJC Android APK

This project packages the existing New Jerusalem Church member PWA with Capacitor.

## Build

1. Install Node.js and Android Studio.
2. In this folder run `npm install`.
3. Run `npx cap add android` (first time only).
4. Run `npm run cap:sync`.
5. Run `npm run cap:open`.
6. In Android Studio, build the debug APK or signed release APK.

## API URL

The web app accepts the production API URL through `window.NJC_API_BASE` or localStorage key `njc_api_base`.

For production, point this to the public HTTPS Node.js API, for example:
`https://njc-church-api.onrender.com`

Do not put database credentials or Google service-account credentials in the Android app.
