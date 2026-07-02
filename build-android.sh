#!/bin/bash
# TechInnovate Mobility — Android AAB Build Script
# Run this after installing Android Studio + JDK 17

set -e

echo "▶ Building web bundle..."
npm run build

echo "▶ Syncing Capacitor..."
npx cap sync android

echo "▶ Building signed AAB for Play Store..."
cd android
./gradlew bundleRelease

echo ""
echo "✅ Done! Your AAB is at:"
echo "   android/app/build/outputs/bundle/release/app-release.aab"
echo ""
echo "Upload this file to Google Play Console."
