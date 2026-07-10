import { useEffect, useRef, useState } from 'react';
import { IconChevronDown, IconChevronUp } from './DriveIcons';
import {
  DEFAULT_PHONE_COUNTRY_ISO,
  PHONE_COUNTRIES,
  countryFlagEmoji,
  getPhoneCountry,
} from '../utils/phoneCountries';

/**
 * @param {{
 *   countryIso?: string,
 *   onCountryIsoChange?: (iso: string) => void,
 *   nationalNumber?: string,
 *   onNationalNumberChange?: (value: string) => void,
 *   locale?: string,
 *   label?: string,
 *   hint?: string,
 *   autoFocus?: boolean,
 *   disabled?: boolean,
 * }} props
 */
export function PhoneCountryInput({
  countryIso = DEFAULT_PHONE_COUNTRY_ISO,
  onCountryIsoChange,
  nationalNumber = '',
  onNationalNumberChange,
  locale = 'vi',
  label,
  hint,
  autoFocus = false,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const selected = getPhoneCountry(countryIso);

  useEffect(() => {
    if (!open) return undefined;
    function closeOnOutside(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  function countryLabel(country) {
    const name = locale === 'en' ? country.nameEn : country.nameVi;
    return `${countryFlagEmoji(country.iso)} ${country.dial} ${name}`;
  }

  return (
    <label className="block text-sm font-medium text-[var(--gd-text-secondary)]">
      {label}
      <div className="gd-phone-input mt-2">
        <div ref={wrapRef} className="gd-phone-country-wrap">
          <button
            type="button"
            className={`gd-phone-country-trigger${open ? ' gd-phone-country-trigger--open' : ''}`}
            aria-expanded={open}
            aria-haspopup="listbox"
            disabled={disabled}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="gd-phone-country-trigger-flag" aria-hidden>
              {countryFlagEmoji(selected.iso)}
            </span>
            <span className="gd-phone-country-trigger-dial">{selected.dial}</span>
            {open ? (
              <IconChevronUp className="gd-phone-country-chevron" />
            ) : (
              <IconChevronDown className="gd-phone-country-chevron" />
            )}
          </button>
          {open && (
            <div className="gd-phone-country-menu" role="listbox">
              {PHONE_COUNTRIES.map((country) => {
                const isSelected = country.iso === selected.iso;
                return (
                  <button
                    key={country.iso}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`gd-phone-country-option${isSelected ? ' gd-phone-country-option--selected' : ''}`}
                    onClick={() => {
                      onCountryIsoChange?.(country.iso);
                      setOpen(false);
                    }}
                  >
                    {countryLabel(country)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <input
          className="gd-phone-national"
          value={nationalNumber}
          onChange={(e) => onNationalNumberChange?.(e.target.value.replace(/[^\d\s-]/g, ''))}
          placeholder={hint}
          inputMode="tel"
          autoComplete="tel-national"
          autoFocus={autoFocus}
          disabled={disabled}
        />
      </div>
    </label>
  );
}
