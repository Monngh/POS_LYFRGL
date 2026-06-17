import React from "react";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  message?: string;
}

const sizeMap = { sm: 16, md: 24, lg: 32 };

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = "md",
  message,
}) => {
  const px = sizeMap[size];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <style>{`@keyframes spin-loader { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div
        style={{
          width: px,
          height: px,
          border: "3px solid #e2e8f0",
          borderTop: "3px solid #1e3a8a",
          borderRadius: "50%",
          animation: "spin-loader 0.75s linear infinite",
        }}
      />
      {message && (
        <span style={{ fontSize: 13, color: "#64748b" }}>{message}</span>
      )}
    </div>
  );
};
