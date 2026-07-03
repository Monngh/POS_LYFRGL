import React from "react";

interface SkeletonTableProps {
  columns?: number;
  rows?: number;
}

export const SkeletonTable: React.FC<SkeletonTableProps> = ({
  columns = 5,
  rows = 5,
}) => {
  const shimmerStyle: React.CSSProperties = {
    animation: "shimmer 1.6s ease-in-out infinite",
    background: "linear-gradient(90deg, var(--surface-2) 25%, var(--border) 50%, var(--surface-3) 75%)",
    backgroundSize: "200% 100%",
    borderRadius: "6px",
    height: "14px",
    width: "100%",
    opacity: 0.85,
  };
  const widths = ["80%", "60%", "90%", "70%", "50%"];

  return (
    <div
      style={{
        overflowX: "auto",
        backgroundColor: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        width: "100%",
      }}
    >
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200px 0; }
          100% { background-position: 200px 0; }
        }
      `}</style>
      <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
        <thead>
          <tr style={{ backgroundColor: "var(--surface-3)", borderBottom: "1px solid var(--border)" }}>
            {Array.from({ length: columns }).map((_, i) => (
              <th
                key={i}
                style={{
                  padding: "10px 14px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div style={{ ...shimmerStyle, width: "60%" }} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr key={rowIndex}>
              {Array.from({ length: columns }).map((_, colIndex) => (
                <td
                  key={colIndex}
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div
                    style={{
                      ...shimmerStyle,
                      width: widths[colIndex % widths.length]
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
