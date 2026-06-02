import React, { useEffect, useState, useCallback } from "react";
import api from "../../services/api";
import {
  ui,
  type ViewProps,
  Toolbar,
  SearchInput,
  FilterSelect,
  Badge,
  TableState,
  SectionHeader,
  fmtDate,
  roleTone,
} from "./shared";

interface EmployeeRow {
  id: number;
  name: string;
  email: string;
  role: string;
  active: boolean;
  branch: string;
  createdAt: string;
}

const EmpleadosView: React.FC<ViewProps> = ({ branchId, refreshToken }) => {
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ employees: EmployeeRow[] }>("/api/admin/employees", {
        params: {
          ...(branchId !== "all" ? { branchId } : {}),
          ...(role !== "all" ? { role } : {}),
          ...(search.trim() ? { search: search.trim() } : {}),
        },
      });
      setRows(res.data.employees);
    } catch (err: any) {
      setError(err.response?.data?.message || "No se pudieron cargar los empleados.");
    } finally {
      setLoading(false);
    }
  }, [branchId, role, search, refreshToken]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div>
      <SectionHeader title="Empleados" subtitle="Usuarios del sistema y sus permisos por sucursal" />

      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre o correo" />
        <FilterSelect
          value={role}
          onChange={setRole}
          options={[
            { value: "all", label: "Todos los roles" },
            { value: "ADMIN", label: "Administradores" },
            { value: "GERENTE", label: "Gerentes" },
            { value: "CAJERO", label: "Cajeros" },
          ]}
        />
        <span style={{ marginLeft: "auto", fontSize: 13, color: "#64748b", fontWeight: 600 }}>
          {rows.length} empleado{rows.length === 1 ? "" : "s"}
        </span>
      </Toolbar>

      <div style={ui.tableWrap}>
        <table style={ui.table}>
          <thead>
            <tr style={ui.theadRow}>
              <th style={ui.th}>Nombre</th>
              <th style={ui.th}>Correo</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Rol</th>
              <th style={ui.th}>Sucursal</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Estado</th>
              <th style={ui.th}>Alta</th>
            </tr>
          </thead>
          <tbody>
            <TableState colSpan={6} loading={loading} error={error} empty={!loading && rows.length === 0} />
            {!loading &&
              !error &&
              rows.map((u) => (
                <tr key={u.id}>
                  <td style={{ ...ui.td, fontWeight: 700, color: "#0f172a", whiteSpace: "normal" }}>{u.name}</td>
                  <td style={{ ...ui.td, color: "#475569" }}>{u.email}</td>
                  <td style={{ ...ui.td, textAlign: "center" }}>
                    <Badge tone={roleTone(u.role)}>{u.role}</Badge>
                  </td>
                  <td style={ui.td}>{u.branch}</td>
                  <td style={{ ...ui.td, textAlign: "center" }}>
                    <Badge tone={u.active ? "green" : "red"}>{u.active ? "Activo" : "Inactivo"}</Badge>
                  </td>
                  <td style={{ ...ui.td, color: "#64748b" }}>{fmtDate(u.createdAt)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default EmpleadosView;
