import 'dart:convert';
import 'dart:typed_data';

import 'export_file_stub.dart'
    if (dart.library.html) 'export_file_web.dart'
    if (dart.library.io) 'export_file_io.dart';

Future<void> saveTextFile({
  required String filename,
  required String text,
  String mimeType = 'text/plain;charset=utf-8',
}) {
  return saveBytesFile(
    filename: filename,
    bytes: Uint8List.fromList(utf8.encode(text)),
    mimeType: mimeType,
  );
}

Future<void> saveCsvFile({
  required String filename,
  required String csv,
}) {
  return saveTextFile(
    filename: filename,
    text: '\uFEFF$csv',
    mimeType: 'text/csv;charset=utf-8',
  );
}
