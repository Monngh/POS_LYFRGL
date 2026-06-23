import React from "react";
import { ui } from "../views/shared";
import {
  countryFlag,
  getCountryCodeByIso,
  LATAM_COUNTRY_CODES,
  normalizeLocalPhone,
} from "../utils/phone";

interface PhoneFieldProps {
  value: string;
  onChange: (value: string) => void;
  countryIso: string;
  onCountryChange: (countryIso: string) => void;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  label?: string;
  id?: string;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
}

export const PhoneField: React.FC<PhoneFieldProps> = ({
  value,
  onChange,
  countryIso,
  onCountryChange,
  error,
  required = false,
  disabled = false,
  label = "Teléfono",
  id,
  onBlur,
}) => {
  const generatedId = React.useId();
  const inputId = id ?? `admin-phone-${generatedId}`;
  const errorId = `${inputId}-error`;
  const selectedCountry = getCountryCodeByIso(countryIso);
  const maxLength = selectedCountry.code === "+52" ? 10 : 15;

  return (
    <div style={{ minWidth: 0, maxWidth: "100%" }}>
      <label htmlFor={inputId} style={ui.fieldLabel}>
        {label}{required ? " *" : ""}
      </label>
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          gap: 8,
          minWidth: 0,
          maxWidth: "100%",
        }}
      >
        <select
          aria-label="LADA internacional"
          value={selectedCountry.iso}
          onChange={(event) => onCountryChange(event.target.value)}
          disabled={disabled}
          style={{
            ...ui.input,
            flex: "0 0 172px",
            width: 172,
            maxWidth: "100%",
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          {LATAM_COUNTRY_CODES.map((country) => (
            <option key={country.iso} value={country.iso}>
              {countryFlag(country.iso)} {country.code} {country.country}
            </option>
          ))}
        </select>
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="tel-national"
          maxLength={maxLength}
          value={value}
          onChange={(event) => onChange(normalizeLocalPhone(event.target.value, selectedCountry.code))}
          onBlur={onBlur}
          placeholder="7711234567"
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-required={required}
          aria-describedby={error ? errorId : undefined}
          style={{
            ...ui.input,
            flex: "1 1 80px",
            minWidth: 0,
            borderColor: error ? "var(--color-danger)" : "var(--border)",
          }}
        />
      </div>
      {error && (
        <p id={errorId} role="alert" style={ui.fieldError}>
          {error}
        </p>
      )}
    </div>
  );
};
