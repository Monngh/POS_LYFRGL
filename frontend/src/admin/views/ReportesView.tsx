import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import api from "../../shared/services/api";
import { ui, type ViewProps, SectionHeader, Badge } from "./shared";
import { REPORTS, REPORT_CATEGORIES, type ReportDef } from "./reports/reportConfig";
import ReportRunner from "./reports/ReportRunner";
import ExecutiveSummaryReport from "./reports/ExecutiveSummaryReport";
import SalesReport from "./reports/SalesReport";
import ArticulosReport from "./reports/ArticulosReport";
import ExistenciasReport from "./reports/ExistenciasReport";
import KardexReport from "./reports/KardexReport";
import ComprasReport from "./reports/ComprasReport";
import PersonnelReport from "./reports/PersonnelReport";
import HistorialFacturasView from "./HistorialFacturasView";
import { useAuth } from "../../auth";

interface BranchOption {
  id: number;
  name: string;
}

const ReportesView: React.FC<ViewProps> = ({ branchId, refreshToken, initialFilters }) => {
  const { user } = useAuth();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [branches, setBranches] = useState<BranchOption[]>([]);

  useEffect(() => {
    api.get<{ branches: BranchOption[] }>("/api/auth/branches").then((r) => setBranches(r.data.branches)).catch(() => { });
  }, []);

  // Aplica el filtro entregado por la vista de origen (ej. tarjetas del Dashboard)
  // una sola vez al montar, sin quedar "pegado" a cambios manuales posteriores.
  const appliedInitialFilters = useRef(false);
  useEffect(() => {
    if (appliedInitialFilters.current) return;
    appliedInitialFilters.current = true;
    if (initialFilters?.tab === "resumen-ejecutivo") setSelectedKey("resumen");
  }, [initialFilters]);

  const branchLabel =
    branchId === "all" ? "Todas las sucursales" : branches.find((b) => String(b.id) === branchId)?.name || `Sucursal #${branchId}`;

  const selected = selectedKey ? REPORTS.find((r) => r.key === selectedKey) ?? null : null;

  if (selected) {
    return (
      <div style={{ padding: 0, margin: 0, width: '100%', maxWidth: '100%' }}>
        <button
          style={{
            ...ui.ghostBtn,
            marginBottom: 16,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 700,
            color: "var(--accent-strong)",
            border: "1px solid var(--border-strong)",
            backgroundColor: "var(--surface)",
            cursor: "pointer",
          }}
          className="active-tap"
          onClick={() => setSelectedKey(null)}
        >
          <ArrowLeft size={15} /> Catálogo de reportes
        </button>
        <SectionHeader
          title={selected.title}
          subtitle={selected.description}
          right={
            selected.branchScoped ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  color: "var(--text-muted)",
                  fontWeight: 600,
                  backgroundColor: "var(--accent-soft)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "5px 10px",
                }}
              >
                Sucursal:
                <span style={{ color: "var(--accent-strong)", fontWeight: 800 }}>{branchLabel}</span>
              </span>
            ) : undefined
          }
        />
        {selected.key === "historial-facturas" ? (
          <HistorialFacturasView branchId={branchId} refreshToken={refreshToken} />
        ) : selected.key === "ventas" ? (
          <SalesReport branchId={branchId} branchLabel={branchLabel} />
        ) : selected.key === "articulos" ? (
          <ArticulosReport branchId={branchId} branchLabel={branchLabel} />
        ) : selected.key === "existencias" ? (
          <ExistenciasReport branchId={branchId} branchLabel={branchLabel} />
        ) : selected.key === "kardex" ? (
          <KardexReport branchId={branchId} branchLabel={branchLabel} />
        ) : selected.key === "compras" ? (
          <ComprasReport branchId={branchId} branchLabel={branchLabel} />
        ) : selected.key === "operaciones" ? (
          <PersonnelReport variant="operaciones" branchId={branchId} branchLabel={branchLabel} />
        ) : selected.key === "ventas-usuario" ? (
          <PersonnelReport variant="usuario" branchId={branchId} branchLabel={branchLabel} />
        ) : selected.kind === "summary" ? (
          <ExecutiveSummaryReport branchId={branchId} branchLabel={branchLabel} />
        ) : (
          <ReportRunner def={selected} branchId={branchId} branchLabel={branchLabel} />
        )}
      </div>
    );
  }
  return (
    <div>
      <SectionHeader title="Reportes" subtitle="Centro de reportes — seleccione el documento que desea generar" />

      {REPORT_CATEGORIES.map((category) => {
        const items = REPORTS.filter((r) => r.category === category && (!r.adminOnly || user?.role === "ADMIN"));
        if (items.length === 0) return null;
        return (
          <div key={category} style={{ marginBottom: 32 }}>
            <div style={styles.catLabel}>
              <span style={styles.catLabelText}>{category}</span>
            </div>
            <div style={styles.grid}>
              {items.map((def) => (
                <ReportCard key={def.key} def={def} onClick={() => setSelectedKey(def.key)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const ReportCard: React.FC<{ def: ReportDef; onClick: () => void }> = ({ def, onClick }) => {
  const Icon = def.icon;
  const [hovered, setHovered] = React.useState(false);
  return (
    <button
      onClick={onClick}
      className="active-tap"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...styles.card,
        borderColor: hovered ? "var(--accent)" : "var(--border)",
        boxShadow: hovered
          ? "0 8px 24px rgba(37,99,235,0.15), 0 2px 6px rgba(0,0,0,0.08)"
          : "0 1px 3px rgba(0,0,0,0.06)",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
      }}
    >
      <div style={styles.cardHead}>
        <div style={{
          ...styles.cardIcon,
          background: hovered
            ? "linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)"
            : "#eff6ff",
        }}>
          <Icon size={20} color="#2563eb" />
        </div>
        {!def.available && <Badge tone="amber">Próximamente</Badge>}
        <ChevronRight
          size={16}
          color={hovered ? "#2563eb" : "#cbd5e1"}
          style={{ marginLeft: "auto", flexShrink: 0, transition: "color 0.15s ease" }}
        />
      </div>
      <div style={styles.cardTitle}>{def.title}</div>
      <div style={styles.cardDesc}>{def.description}</div>
    </button>
  );
};

const styles: { [k: string]: React.CSSProperties } = {
  catLabel: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
    paddingBottom: 10,
    borderBottom: "1px solid var(--border)",
  },
  catLabelText: {
    fontSize: 11,
    fontWeight: 800,
    color: "var(--text-muted)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.7px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: 14,
  },
  card: {
    textAlign: "left",
    backgroundColor: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: "18px 20px",
    cursor: "pointer",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    transition: "border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    fontFamily: "inherit",
  },
  cardHead: { display: "flex", alignItems: "center", gap: 10 },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#eff6ff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    transition: "background 0.2s ease",
  },
  cardTitle: { fontSize: 14.5, fontWeight: 800, color: "var(--text)", marginTop: 2, lineHeight: 1.3 },
  cardDesc: { fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.55 },
};

export default ReportesView;