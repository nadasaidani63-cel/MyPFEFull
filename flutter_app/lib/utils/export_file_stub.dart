import 'dart:typed_data';

Future<void> saveBytesFile({
  required String filename,
  required Uint8List bytes,
  required String mimeType,
}) async {
  throw UnsupportedError('File export is not supported on this platform.');
}
