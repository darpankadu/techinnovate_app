# Techinnovate CNG Fleet Tracker 🚀

A secure, offline-first fleet CNG monitoring and tracking application built with a React/Vite frontend and a Node.js/Express hybrid Firebase Firestore & Google Drive backend.

## Project Structure

This repository contains both the frontend and backend applications in a single monorepo structure:

```text
techinnovate-cng-system/
├── frontend/  <-- React/Vite PWA Client App
└── backend/   <-- Node.js Express Server (Firestore DB + Google Drive Uploads + OCR)
```

---

## Getting Started

### 1. Prerequisites
Ensure you have **Node.js** (v18+) and **npm** installed on your system.

### 2. Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Configuration:
   Create a `.env` file inside the `backend` folder containing your Firestore Service Account credentials, Google API OAuth2 config, and Gemini API keys.
3. Start the backend:
   ```bash
   npm install
   npm start
   ```
   The backend will run on `http://localhost:8080`.

### 3. Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd ../frontend
   ```
2. Configuration:
   Create a `.env` file with your Firebase Client SDK configuration keys.
3. Start the dev server:
   ```bash
   npm install
   npm run dev
   ```
   The application will run on `http://localhost:5173`.

---

## Pushing to GitHub

To push this entire project to a single GitHub repository, open your terminal at the root directory (`techinnovate-cng-system/`) and run the following commands:

```bash
# 1. Initialize git repository
git init

# 2. Add files (files listed in .gitignore will be ignored)
git add .

# 3. Create your first commit
git commit -m "Initial commit: unified frontend and backend monorepo structure"

# 4. Rename main branch
git branch -M main

# 5. Add your GitHub remote link
git remote add origin https://github.com/nil3108/techinnovate_app.git

# 6. Push to GitHub
git push -u origin main --force
```

---

## Features

- **Decoupled Components**: Clean architecture where complex dashboard structures are broken down into logical files.
- **Offline-First Sync**: Auto-queue transactions when offline and sync cleanly when connections resume.
- **Dual-Engine OCR**: Image scan analysis for odometer photos and receipts using Gemini 2.5 Flash and Google Cloud Vision fallback.
- **Role Authorization & BOLA protection**: Secure JWT token access for owners and admins.
- **Fraud Detection**: Smart checks matching pump and receipt GPS coords alongside last refueling ratios.
