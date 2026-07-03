import React, { useEffect, useState } from "react";
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

const ReportesView: React.FC<ViewProps> = ({ branchId, refreshToken }) => {
  const { user } = useAuth();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [branches, setBranches] = useState<BranchOption[]>([]);

  useEffect(() => {
    api.get<{ branches: BranchOption[] }>("/api/auth/branches").then((r) => setBranches(r.data.branches)).catch(() => {});
  }, []);

  const branchLabel =
    branchId === "all" ? "Todas las sucursales" : branches.find((b) => String(b.id) === branchId)?.name || `Sucursal #${branchId}`;

  const selected = selectedKey ? REPORTS.find((r) => r.key === selectedKey) ?? null : null;

  // ---------------- Vista de un reporte seleccionado ----------------
  if (selected) {
    return (
      <div>
        <button style={{ ...ui.ghostBtn, marginBottom: 16 }} className="active-tap" onClick={() => setSelectedKey(null)}>
          <ArrowLeft size={15} /> Catálogo de reportes
        </button>
        <SectionHeader
          title={selected.title}
          subtitle={selected.description}
          right={
            selected.branchScoped ? (
              <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>
                Sucursal: <span style={{ color: "var(--accent-strong)", fontWeight: 700 }}>{branchLabel}</span>
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

  // ---------------- Catálogo ----------------
  return (
    <div>
      <SectionHeader title="Reportes" subtitle="Centro de reportes — seleccione el documento que desea generar" />

      {REPORT_CATEGORIES.map((category) => {
        const items = REPORTS.filter((r) => r.category === category && (!r.adminOnly || user?.role === "ADMIN"));
        if (items.length === 0) return null;
        return (
          <div key={category} style={{ marginBottom: 28 }}>
            <div style={styles.catLabel}>{category}</div>
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
  return (
    <button onClick={onClick} className="active-tap" style={styles.card}>
      <div style={styles.cardHead}>
        <div style={styles.cardIcon}>
          <Icon size={20} color="#2563eb" />
        </div>
        {!def.available && <Badge tone="amber">Próximamente</Badge>}
        <ChevronRight size={16} color="#cbd5e1" style={{ marginLeft: "auto" }} />
      </div>
      <div style={styles.cardTitle}>{def.title}</div>
      <div style={styles.cardDesc}>{def.description}</div>
    </button>
  );
};

const styles: { [k: string]: React.CSSProperties } = {
  catLabel: {
    fontSize: 12,
    fontWeight: 800,
    color: "var(--text-faint)",
    textTransform: "uppercase",
    letterSpacing: "0.6px",
    marginBottom: 12,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: 16,
  },
  card: {
    textAlign: "left",
    backgroundColor: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 18,
    cursor: "pointer",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    fontFamily: "inherit",
  },
  cardHead: { display: "flex", alignItems: "center", gap: 10 },
  cardIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#eff6ff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 15, fontWeight: 800, color: "var(--text)", marginTop: 2 },
  cardDesc: { fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5 },
};

export default ReportesView;
