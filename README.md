# Maya AI Mobile App

Expo React Native app for reporting local community issues with photo + location.

## Features
- Welcome + onboarding flow
- Home feed of nearby issues
- Map tab with:
  - current user location center
  - nearby issue markers
- Report flow:
  - location permission
  - camera capture
  - report form submit to backend
- Profile screen

## Tech Stack
- Expo SDK 54
- React Native
- TypeScript
- `expo-camera`
- `expo-location`
- `react-native-maps`

## Prerequisites
- Node.js 18+
- npm (or bun)
- Expo Go (for local testing)
- EAS CLI (for cloud builds): `npm i -g eas-cli`

## Setup
From `mobile/`:

```bash
npm install
cp .env.example .env
```

Set env:
- `EXPO_PUBLIC_API_BASE_URL=https://scroll-backend-latest.onrender.com`

## Run Locally
```bash
npx expo start -c
```

Useful commands:
```bash
npm run ios
npm run android
npm run web
```

## Build & Distribution (EAS)
EAS config is in `eas.json`.

Internal iOS build (install on registered devices):
```bash
eas build -p ios --profile preview
```

Register test devices:
```bash
eas device:create
eas device:list
```

Production/store build:
```bash
eas build -p ios --profile production
```

## Backend Integration
Mobile app calls:
- `GET /feed`
- `GET /issue/{id}`
- `POST /report`

API base URL is defined in:
- `App.tsx` (from `EXPO_PUBLIC_API_BASE_URL`)

## Common Troubleshooting
- `Unable to resolve "expo-camera"`:
  - run `npm install`
  - restart with `npx expo start -c`
- `CommandError: failed to start tunnel`:
  - ngrok tunnel issue; use LAN mode or retry tunnel
- iOS IPA "integrity could not be verified":
  - build with internal profile
  - ensure device UDID is registered before build

## Security
- Never commit `.env`.
- Keep API keys and credentials in env variables only.
