# Chrome Extension: ITP Camp to Google Calendar Sync

A Chrome extension that syncs RSVPed events from ITP Camp dashboard to Google Calendar.

## Setup Instructions

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Build the Extension
```bash
pnpm run build
```

### 3. Configure Google Calendar API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the Google Calendar API
4. Create OAuth2 credentials:
   - Application type: Chrome Extension
   - Add your extension ID to authorized origins
5. Update `public/manifest.json`:
   - Replace `YOUR_GOOGLE_CLIENT_ID` with your actual client ID
   - Replace the `key` field with your extension's public key

### 4. Load Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist` folder

## Usage

1. Navigate to `https://itp.nyu.edu/camp/2025/dashboard`
2. Make sure you're logged in and have RSVPed to some events
3. Click the extension icon in the toolbar
4. Click "Sync Events" button
5. Authorize Google Calendar access when prompted
6. Your RSVPed events will be created in your Google Calendar

## Development

- `pnpm run dev` - Build in development mode with watch
- `pnpm run build` - Build for production

## Features

- ✅ Extracts RSVPed events from ITP Camp dashboard
- ✅ Creates Google Calendar events with proper date/time
- ✅ Prevents duplicate events on multiple syncs
- ✅ Simple popup interface for manual sync
- ✅ Shows sync status and event counts
- ✅ TypeScript for type safety
- ✅ Manifest V3 compatibility

## Technical Notes

- Uses Chrome's identity API for Google OAuth
- Stores synced event IDs in local storage to prevent duplicates
- Parses various time formats (e.g., "3-5pm", "10am-12pm")
- Handles timezone conversion (Eastern Time)
- Content script only runs on ITP Camp dashboard page