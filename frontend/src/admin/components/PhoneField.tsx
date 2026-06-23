import React from "react";
import { ui } from "../views/shared";
import {
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

const PHONE_COUNTRY_SELECT_WIDTH = "clamp(136px, 38vw, 150px)";
const formatCountryOption = (country: (typeof LATAM_COUNTRY_CODES)[number]) =>
  `${country.code} ${country.country}`;

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
          flexWrap: "wrap",
          minWidth: 0,
          maxWidth: "100%",
        }}
      >
        <div
          style={{
            position: "relative",
            flex: `0 0 ${PHONE_COUNTRY_SELECT_WIDTH}`,
            width: PHONE_COUNTRY_SELECT_WIDTH,
            maxWidth: "100%",
          }}
        >
          <select
            aria-label="LADA internacional"
            value={selectedCountry.iso}
            onChange={(event) => onCountryChange(event.target.value)}
            disabled={disabled}
            title={formatCountryOption(selectedCountry)}
            style={{
              ...ui.input,
              width: "100%",
              padding: "10px 26px 10px 10px",
              appearance: "none",
              WebkitAppearance: "none",
              MozAppearance: "none",
              cursor: disabled ? "not-allowed" : "pointer",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {LATAM_COUNTRY_CODES.map((country) => (
              <option key={country.iso} value={country.iso}>
                {formatCountryOption(country)}
              </option>
            ))}
          </select>
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              right: 9,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-secondary)",
              fontSize: 11,
              lineHeight: 1,
              pointerEvents: "none",
            }}
          >
            ▼
          </span>
        </div>
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
            flex: "1 1 96px",
            minWidth: 96,
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
