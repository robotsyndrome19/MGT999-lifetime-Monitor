<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/b2dfc703-3c37-4af9-a638-2c923c7171de

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`

## Production

1. Build the app:
   `npm run build`
2. Start the production server:
   `npm run start`

## Deploy To Railway

This project is configured for Railway with [`railway.json`](./railway.json).

Railway will:
- install dependencies
- run `npm run build`
- start the app with `npm run start`

The production server serves the Vite `dist` output and exposes a health check at `/health`.
