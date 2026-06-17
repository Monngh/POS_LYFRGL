import React from "react";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  message: string;
  icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ message, icon }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "48px 24px",
      gap: 12,
    }}
  >
    {icon ?? <Inbox size={36} color="#94a3b8" />}
    <span style={{ fontSize: 14, fontWeight: 500, color: "#64748b" }}>{message}</span>
  </div>
);
