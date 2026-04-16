@echo off
flutter clean
flutter pub get
flutter run -d chrome --dart-define=API_BASE_URL=http://localhost:5000/api --dart-define=SOCKET_URL=http://localhost:5000
