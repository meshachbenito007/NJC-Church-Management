# NJC Free/Low-Cost Cloud Setup

## Architecture

Android APK -> Render Node.js API -> TiDB Cloud Starter (MySQL-compatible) + Google Drive

## Render API

Create a Render Web Service from this repository using `render.yaml`.
Free Render web services are suitable for testing/hobby use but spin down after 15 minutes of inactivity, so the first request after idle can be slow.

## Database

The existing server uses `mysql2`, so it can connect to TiDB Cloud Starter, which is MySQL-compatible. TiDB Cloud Starter currently provides a free quota and requires TLS. Put its host, port 4000, username, password and database into Render environment variables.

Run `database/schema.sql` against the TiDB database before using the API.

## Google Drive

Keep actual sermon MP3/audio, images and videos in Google Drive. Store only metadata/file IDs in the database. Configure the Drive service-account credentials as a Render secret; never place them in the APK.

## OTP

The current development OTP service must be replaced with a real SMS provider before production. Until then, use the development mode only for testing.
