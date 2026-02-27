# Quick Start Guide

## 🚀 Starting the Backend Server

### Option 1: Using the Batch File (Windows)
1. Navigate to the `backend` folder
2. Double-click `start.bat`
3. The server will start on `whttp://localhost:3000`

### Option 2: Using Command Line
1. Open PowerShell or Command Prompt
2. Navigate to the backend folder:
   ```powershell
   cd bhavtol\backend
   ```
3. Install dependencies (first time only):
   ```powershell
   npm install
   ```
4. Start the server:
   ```powershell
   npm start
   ```

## 🧪 Testing the Scrapers

### Option 1: Using the Batch File (Windows)
1. Navigate to the `backend` folder
2. Double-click `test.bat`

### Option 2: Using Command Line
```powershell
cd bhavtol\backend
node test-all-scrapers.js
```

## ✅ Verify Backend is Running

1. Start the server (see above)
2. Open your browser and go to: `hadd some product in the  food delivery sections  with help of rapid api`
3. You should see: `{"status":"ok","message":"BhavTOL Backend is running","stores":10}`

## 📱 Connecting Flutter App

The Flutter app is configured to connect to:
- **Windows/Desktop**: `http://127.0.0.1:3000`
- **Android Emulator**: `http://10.0.2.2:3000` (update `lib/utils/constants.dart`)
- **iOS Simulator**: `http://localhost:3000` (update `lib/utils/constants.dart`)
- **Physical Device**: `http://YOUR-COMPUTER-IP:3000` (update `lib/utils/constants.dart`)

### To find your computer's IP address:
- **Windows**: Open Command Prompt and type `ipconfig`
- Look for "IPv4 Address" under your active network adapter

## 🔧 Troubleshooting

### "Cannot find module" error
- Make sure you're in the `backend` folder
- Run `npm install` to install dependencies

### "Port already in use" error
- Another process is using port 3000
- Change the port in `server.js` or set `PORT=3001` in `.env` file

### Flutter app can't connect
- Make sure the backend server is running
- Check the API_BASE_URL in `lib/utils/constants.dart`
- For physical devices, make sure your phone and computer are on the same WiFi network
- Check Windows Firewall settings

### Scrapers not working
- Check console logs for errors
- Look for screenshot files: `*-error.png`, `*-empty.png`
- Some websites may block automated access








