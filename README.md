# Spotify API Service

A simple Node.js service that connects to the Spotify API. This service can be deployed on render.com.

## Features

- Connect to Spotify account
- Authentication with Spotify API
- Get user profile information
- Token refresh handling

## Setup

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file with the following variables:
   ```
   SPOTIFY_CLIENT_ID=your_spotify_client_id
   SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
   REDIRECT_URI=https://your-app-name.onrender.com/callback
   FRONTEND_URI=https://your-app-name.onrender.com
   PORT=8888
   ```
4. Register your app on the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/) and get your Client ID and Client Secret
5. Add the redirect URI to your Spotify app settings

## Local Development

Start the development server:

```
npm run dev
```

## Deployment to Render.com

1. Push your code to a Git repository (GitHub, GitLab, etc.)
2. Sign up for [Render](https://render.com)
3. Create a new Web Service and connect your repository
4. Configure the service:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Add all environment variables from your `.env` file
5. Deploy the service

## API Endpoints

- `GET /` - Home route
- `GET /login` - Start Spotify OAuth flow
- `GET /callback` - Callback after Spotify authorization
- `GET /me` - Get user profile info
- `POST /refresh` - Refresh access token
