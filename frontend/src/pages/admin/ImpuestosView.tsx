import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BadgePercent, Pencil, Plus, Power, X } from "lucide-react";
import api from "../../services/api";
import {
  ui,
  type ViewProps,
  Toolbar,
  SearchInput,
  Badge,
  TableState,
  SectionHeader,
  fmtDate,
} from "./shared";

interface TaxRow {
  id: number;
  name: string;
  description: string | null;
  rate: number | string;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
}

interface TaxResponse {
  success: boolean;
  message: string;
  data: TaxRow | TaxRow[];
}

interface LegacyTaxResponse {
  data?: unknown;
  taxes?: unknown;
}

interface FormState {
  name: string;
  description: string;
  rate: string;
  active: boolean;
}

const emptyForm: FormState = {
  name: "",
  description: "",
  rate: "",
  active: true,
};

const TAX_ENDPOINT = "/api/admin-tax/taxes";

const normalizeRate = (rate: number | string) => {
  const value = Number(rate);
  return Number.isFinite(value) ? value : 0;
};

const formatPercent = (rate: number | string) => {
  const percent = normalizeRate(rate) * 100;
  return `${percent.toLocaleString("es-MX", {
    minimumFractionDigits: percent % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 4,
  })}%`;
};

const formatDecimal = (rate: number | string) => {
  const value = normalizeRate(rate);
  return value.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
};

const extractTaxes = (payload: TaxResponse | LegacyTaxResponse): TaxRow[] => {
  if (Array.isArray(payload?.data)) return payload.data as TaxRow[];
  if ("taxes" in payload && Array.isArray(payload.taxes)) return payload.taxes as TaxRow[];
  return [];
};

const getErrorMessage = (err: unknown, fallback: string) => {
  if (typeof err === "object" && err !== null && "response" in err) {
    const apiError = err as { response?: { data?: { message?: string } } };
    return apiError.response?.data?.message || fallback;
  }

  return fallback;
};

const ImpuestosView: React.FC<ViewProps> = ({ refreshToken }) => {
  const [rows, setRows] = useState<TaxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [editing, setEditing] = useState<"create" | TaxRow | null>(null);
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<number | null>(null);

  // TODO: integrar asignacion de impuestos desde la pantalla de Productos.

  const load = useCallback(async () => {
    void refreshToken;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<TaxResponse>(TAX_ENDPOINT, {
        params: search.trim() ? { search: search.trim() } : {},
      });
      setRows(extractTaxes(res.data));
    } catch (err: unknown) {
      setError(getErrorMessage(err, "No se pudieron cargar los impuestos."));
    } finally {
      setLoading(false);
    }
  }, [search, refreshToken]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const activeCount = useMemo(() => rows.filter((r) => r.active).length, [rows]);
  const inactiveCount = rows.length - activeCount;

  const openCreate = () => {
    setForm({ ...emptyForm });
    setFormError(null);
    setNotice(null);
    setEditing("create");
  };

  const openEdit = (tax: TaxRow) => {
    setForm({
      name: tax.name,
      description: tax.description || "",
      rate: String(normalizeRate(tax.rate)),
      active: tax.active,
    });
    setFormError(null);
    setNotice(null);
    setEditing(tax);
  };

  const closeForm = () => {
    if (!saving) {
      setEditing(null);
      setFormError(null);
    }
  };

  const validateForm = () => {
    if (!form.name.trim()) return "El nombre del impuesto es obligatorio.";
    if (!form.rate.trim()) return "La tasa del impuesto es obligatoria.";

    const rate = Number(form.rate);
    if (!Number.isFinite(rate) || rate < 0) {
      return "La tasa debe ser un numero mayor o igual a 0.";
    }

    return null;
  };

  const syncStatus = async (id: number, active: boolean) => {
    await api.put(`${TAX_ENDPOINT}/status`, { id, status: active });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = validateForm();
    if (validation) {
      setFormError(validation);
      return;
    }

    const desiredActive = form.active;
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      rate: form.rate.trim(),
      active: true,
    };

    setSaving(true);
    setFormError(null);
    try {
      if (editing === "create") {
        const res = await api.post<TaxResponse>(TAX_ENDPOINT, payload);
        const created = Array.isArray(res.data.data) ? null : res.data.data;
        if (created?.id && !desiredActive) {
          await syncStatus(created.id, false);
        }
        setNotice("Impuesto creado correctamente.");
      } else if (editing) {
        await api.put(TAX_ENDPOINT, {
          id: editing.id,
          ...payload,
        });
        if (!desiredActive) {
          await syncStatus(editing.id, false);
        }
        setNotice("Impuesto actualizado correctamente.");
      }

      setEditing(null);
      setForm({ ...emptyForm });
      await load();
    } catch (err: unknown) {
      setFormError(getErrorMessage(err, "No se pudo guardar el impuesto."));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (tax: TaxRow) => {
    const next = !tax.active;
    const label = next ? "activar" : "desactivar";
    const confirmed = window.confirm(`Desea ${label} el impuesto "${tax.name}"?`);
    if (!confirmed) return;

    setStatusUpdatingId(tax.id);
    setError(null);
    setNotice(null);
    try {
      await syncStatus(tax.id, next);
      setNotice(`Impuesto ${next ? "activado" : "desactivado"} correctamente.`);
      await load();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "No se pudo actualizar el estado del impuesto."));
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const set =
    (key: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div>
      <SectionHeader
        title="Impuestos"
        subtitle="Catalogo de tasas fiscales usadas por el punto de venta"
        right={
          <button style={ui.primaryBtn} className="active-tap" onClick={openCreate}>
            <Plus size={16} /> Nuevo impuesto
          </button>
        }
      />

      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre o ID" />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#15803d", fontSize: 13, fontWeight: 700 }}>
          <BadgePercent size={16} /> {activeCount} activo{activeCount === 1 ? "" : "s"}
        </span>
        {inactiveCount > 0 && (
          <span style={{ fontSize: 13, color: "#64748b", fontWeight: 700 }}>
            {inactiveCount} inactivo{inactiveCount === 1 ? "" : "s"}
          </span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 13, color: "#64748b", fontWeight: 600 }}>
          {rows.length} impuesto{rows.length === 1 ? "" : "s"}
        </span>
      </Toolbar>

      {notice && (
        <div style={styles.notice} role="status">
          {notice}
        </div>
      )}

      <div className="table-sticky-head" style={{ ...ui.tableWrap, overflowX: "auto", overflowY: "auto", maxHeight: "62vh" }}>
        <table style={ui.table}>
          <thead>
            <tr style={ui.theadRow}>
              <th style={ui.th}>ID</th>
              <th style={ui.th}>Nombre</th>
              <th style={ui.th}>Descripcion</th>
              <th style={{ ...ui.th, textAlign: "right" }}>Tasa</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Estado</th>
              <th style={ui.th}>Fecha de creacion</th>
              <th style={{ ...ui.th, textAlign: "center" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={7}
              loading={loading}
              error={error}
              empty={!loading && rows.length === 0}
              emptyText={search.trim() ? "No hay impuestos que coincidan con la busqueda." : "No hay impuestos registrados."}
            />
            {!loading &&
              !error &&
              rows.map((tax) => (
                <tr key={tax.id}>
                  <td style={{ ...ui.td, fontWeight: 800, color: "#1e3a8a" }}>{tax.id}</td>
                  <td style={{ ...ui.td, fontWeight: 800, color: "#0f172a", whiteSpace: "normal" }}>{tax.name}</td>
                  <td style={{ ...ui.td, color: "#475569", whiteSpace: "normal" }}>{tax.description || "Sin descripcion"}</td>
                  <td style={{ ...ui.td, textAlign: "right" }}>
                    <div style={{ fontWeight: 800, color: "#0f172a" }}>{formatPercent(tax.rate)}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>decimal {formatDecimal(tax.rate)}</div>
                  </td>
                  <td style={{ ...ui.td, textAlign: "center" }}>
                    <Badge tone={tax.active ? "green" : "red"}>{tax.active ? "Activo" : "Inactivo"}</Badge>
                  </td>
                  <td style={{ ...ui.td, color: "#64748b" }}>{fmtDate(tax.createdAt)}</td>
                  <td style={{ ...ui.td, textAlign: "center" }}>
                    <div style={styles.actions}>
                      <button style={ui.linkBtn} className="active-tap" onClick={() => openEdit(tax)}>
                        <Pencil size={14} style={{ verticalAlign: "-2px" }} /> Editar
                      </button>
                      <button
                        style={{
                          ...ui.linkBtn,
                          color: tax.active ? "#b91c1c" : "#15803d",
                          opacity: statusUpdatingId === tax.id ? 0.55 : 1,
                        }}
                        className="active-tap"
                        disabled={statusUpdatingId === tax.id}
                        onClick={() => toggleStatus(tax)}
                      >
                        <Power size={14} style={{ verticalAlign: "-2px" }} /> {tax.active ? "Desactivar" : "Activar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {editing !== null && (
        <div style={ui.overlay} onClick={closeForm}>
          <form style={{ ...ui.modal, maxWidth: 520 }} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <div style={ui.modalHeader}>
              <span style={ui.modalTitle}>{editing === "create" ? "Registrar nuevo impuesto" : "Editar impuesto"}</span>
              <button type="button" style={ui.linkBtn} onClick={closeForm}>
                <X size={18} color="#64748b" />
              </button>
            </div>
            <div style={ui.modalBody}>
              <div style={{ marginBottom: 14 }}>
                <label style={ui.fieldLabel}>Nombre *</label>
                <input style={ui.input} value={form.name} onChange={set("name")} placeholder="IVA" autoFocus />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={ui.fieldLabel}>Descripcion</label>
                <textarea
                  style={{ ...ui.input, minHeight: 82, resize: "vertical" }}
                  value={form.description}
                  onChange={set("description")}
                  placeholder="Impuesto al valor agregado"
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={ui.fieldLabel}>Tasa decimal *</label>
                <input style={ui.input} value={form.rate} onChange={set("rate")} placeholder="0.16" inputMode="decimal" />
                <p style={styles.helpText}>Use formato decimal: IVA 16% = 0.16, IEPS 8% = 0.08.</p>
              </div>

              <label style={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                  style={styles.check}
                />
                <span>Impuesto activo</span>
              </label>

              {formError && <p style={styles.formError}>{formError}</p>}

              <div style={styles.formActions}>
                <button type="button" style={{ ...ui.ghostBtn, flex: 1, justifyContent: "center" }} onClick={closeForm}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving} style={{ ...ui.primaryBtn, flex: 1, justifyContent: "center" }}>
                  {saving ? "Guardando..." : editing === "create" ? "Guardar impuesto" : "Guardar cambios"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  notice: {
    backgroundColor: "#ecfdf5",
    border: "1px solid #bbf7d0",
    borderRadius: 8,
    color: "#15803d",
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 14,
    padding: "10px 12px",
  },
  actions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  helpText: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: 600,
    marginTop: 7,
  },
  checkRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    color: "#334155",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 700,
    marginTop: 4,
  },
  check: {
    width: 16,
    height: 16,
    accentColor: "#1e3a8a",
    cursor: "pointer",
  },
  formError: {
    color: "#b91c1c",
    fontSize: 13,
    fontWeight: 700,
    marginTop: 14,
  },
  formActions: {
    display: "flex",
    gap: 10,
    marginTop: 22,
  },
};

export default ImpuestosView;
