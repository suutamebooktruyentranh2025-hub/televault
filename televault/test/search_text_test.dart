import 'package:flutter_test/flutter_test.dart';
import 'package:televault/utils/search_text.dart';

void main() {
  test('normalizeForSearch strips Vietnamese diacritics', () {
    expect(normalizeForSearch('Truyện'), 'truyen');
    expect(normalizeForSearch('tập-01'), 'tap-01');
    expect(normalizeForSearch('Đã đọc'), 'da doc');
  });

  test('searchTextMatches handles Đắc and Dac', () {
    expect(normalizeForSearch('Đắc'), 'dac');
    expect(normalizeForSearch('ĐẮC'), 'dac');
    expect(searchTextMatches('/Sách/Đắc Nhân Tâm.pdf', 'Dac'), isTrue);
    expect(searchTextMatches('/Sách/Đắc Nhân Tâm.pdf', 'Đắc'), isTrue);
    expect(searchTextMatches('/Sách/Đắc Nhân Tâm.pdf', 'nhan tam'), isTrue);
  });

  test('NFD path from macOS still matches Dac', () {
    final dacNfd = 'd${String.fromCharCode(0x103)}${String.fromCharCode(0x301)}c';
    final path = '/Sách/$dacNfd Nhân Tâm.pdf';
    expect(searchTextMatches(path, 'Dac'), isTrue);
    expect(searchTextMatches(path, 'Đắc'), isTrue);
  });

  test('entryMatchesSearch includes tags', () {
    expect(entryMatchesSearch('/a.pdf', ['Đắc nhân tâm'], 'Dac'), isTrue);
    expect(entryMatchesSearch('/a.pdf', ['hay'], 'Dac'), isFalse);
  });

  test('Hậ matches Hậu and full query Hậu matches too', () {
    const path = '/Sách/Hậu Nhân Tâm.pdf';
    expect(searchTextMatches(path, 'Hậ'), isTrue);
    expect(searchTextMatches(path, 'Hậu'), isTrue);

    // IME / macOS sometimes inserts zero-width space between ậ and u
    final queryZwsp = 'Hậ${String.fromCharCode(0x200B)}u';
    expect(searchTextMatches(path, queryZwsp), isTrue);

    final pathZwsp = '/Hậ${String.fromCharCode(0x200B)}u.pdf';
    expect(searchTextMatches(pathZwsp, 'Hậ'), isTrue);
    expect(searchTextMatches(pathZwsp, 'Hậu'), isTrue);
  });
}
