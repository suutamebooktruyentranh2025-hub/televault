/** @typedef {{ iso: string, dial: string, nameVi: string, nameEn: string }} PhoneCountry */

/** @type {PhoneCountry[]} */
export const PHONE_COUNTRIES = [
  { iso: 'VN', dial: '+84', nameVi: 'Việt Nam', nameEn: 'Vietnam' },
  { iso: 'US', dial: '+1', nameVi: 'Hoa Kỳ', nameEn: 'United States' },
  { iso: 'GB', dial: '+44', nameVi: 'Anh', nameEn: 'United Kingdom' },
  { iso: 'AU', dial: '+61', nameVi: 'Úc', nameEn: 'Australia' },
  { iso: 'SG', dial: '+65', nameVi: 'Singapore', nameEn: 'Singapore' },
  { iso: 'TH', dial: '+66', nameVi: 'Thái Lan', nameEn: 'Thailand' },
  { iso: 'JP', dial: '+81', nameVi: 'Nhật Bản', nameEn: 'Japan' },
  { iso: 'KR', dial: '+82', nameVi: 'Hàn Quốc', nameEn: 'South Korea' },
  { iso: 'CN', dial: '+86', nameVi: 'Trung Quốc', nameEn: 'China' },
  { iso: 'TW', dial: '+886', nameVi: 'Đài Loan', nameEn: 'Taiwan' },
  { iso: 'HK', dial: '+852', nameVi: 'Hồng Kông', nameEn: 'Hong Kong' },
  { iso: 'MY', dial: '+60', nameVi: 'Malaysia', nameEn: 'Malaysia' },
  { iso: 'ID', dial: '+62', nameVi: 'Indonesia', nameEn: 'Indonesia' },
  { iso: 'PH', dial: '+63', nameVi: 'Philippines', nameEn: 'Philippines' },
  { iso: 'IN', dial: '+91', nameVi: 'Ấn Độ', nameEn: 'India' },
  { iso: 'DE', dial: '+49', nameVi: 'Đức', nameEn: 'Germany' },
  { iso: 'FR', dial: '+33', nameVi: 'Pháp', nameEn: 'France' },
  { iso: 'CA', dial: '+1', nameVi: 'Canada', nameEn: 'Canada' },
  { iso: 'RU', dial: '+7', nameVi: 'Nga', nameEn: 'Russia' },
  { iso: 'NL', dial: '+31', nameVi: 'Hà Lan', nameEn: 'Netherlands' },
  { iso: 'SE', dial: '+46', nameVi: 'Thụy Điển', nameEn: 'Sweden' },
  { iso: 'CH', dial: '+41', nameVi: 'Thụy Sĩ', nameEn: 'Switzerland' },
  { iso: 'AE', dial: '+971', nameVi: 'UAE', nameEn: 'United Arab Emirates' },
  { iso: 'SA', dial: '+966', nameVi: 'Ả Rập Xê Út', nameEn: 'Saudi Arabia' },
  { iso: 'BR', dial: '+55', nameVi: 'Brazil', nameEn: 'Brazil' },
  { iso: 'MX', dial: '+52', nameVi: 'Mexico', nameEn: 'Mexico' },
];

export const DEFAULT_PHONE_COUNTRY_ISO = 'VN';

/** @param {string} iso */
export function getPhoneCountry(iso) {
  return PHONE_COUNTRIES.find((c) => c.iso === iso) || PHONE_COUNTRIES[0];
}

/** @param {string} iso */
export function countryFlagEmoji(iso) {
  const code = String(iso || '').trim().toUpperCase();
  if (code.length !== 2) return '🏳️';
  return String.fromCodePoint(...[...code].map((c) => 127397 + c.charCodeAt(0)));
}

/**
 * @param {string} dial E.g. "+84"
 * @param {string} national Local digits only
 */
export function formatInternationalPhone(dial, national) {
  const dialDigits = String(dial || '').replace(/\D/g, '');
  let local = String(national || '').replace(/\D/g, '');
  if (!dialDigits || !local) return '';

  if (dial === '+84' && local.startsWith('0')) {
    local = local.slice(1);
  }

  return `+${dialDigits}${local}`;
}
