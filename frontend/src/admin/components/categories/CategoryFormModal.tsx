import { useMemo, useState, type CSSProperties, type ChangeEvent, type FormEvent } from "react";
import { X } from "lucide-react";
import {
  adminCategoryService,
  getAdminCategoryErrorMessage,
  type AdminCategoryDetail,
  type AdminCategorySummary,
  type AdminCategoryTreeNode,
  type CategoryLevel,
} from "../../services/categoryAdmin.service";
import { levelLabel, previewNextChildCode } from "./categoryHelpers";
import {
  CATEGORY_ICON_OPTIONS,
  getCategoryIconOption,
  getCategoryIconValue,
  isUnsupportedCategoryIcon,
  renderCategoryIcon,
  renderLucideIcon,
} from "./categoryIcons";
import {
  CATEGORY_COLOR_ERROR,
  CATEGORY_COLOR_PALETTE,
  DEFAULT_CATEGORY_PICKER_COLOR,
  isValidCategoryColor,
  normalizeCategoryColor,
} from "./categoryColors";
import { ui } from "../../views/shared";

export type CategoryFormState =
  | { mode: "create"; level: CategoryLevel; parent: AdminCategoryTreeNode | null }
  | { mode: "edit"; category: AdminCategoryDetail };

interface CategoryFormModalProps {
  state: CategoryFormState | null;
  onClose: () => void;
  onSaved: (category: AdminCategorySummary, message: string) => void;
}

interface CategoryFormModalContentProps {
  state: CategoryFormState;
  onClose: () => void;
  onSaved: (category: AdminCategorySummary, message: string) => void;
}

const NAME_MAX = 30;
const DESCRIPTION_MAX = 50;

const initialFormValues = (state: CategoryFormState) => {
  if (state.mode === "edit") {
    return {
      name: state.category.name,
      description: state.category.description ?? "",
      color: state.category.color ?? "",
      icon: state.category.icon ?? "",
    };
  }

  return { name: "", description: "", color: "", icon: "" };
};

export function CategoryFormModal({ state, onClose, onSaved }: CategoryFormModalProps) {
  if (!state) return null;

  const formKey = state.mode === "edit"
    ? `edit-${state.category.id}`
    : `create-${state.level}-${state.parent?.id ?? "root"}`;

  return <CategoryFormModalContent key={formKey} state={state} onClose={onClose} onSaved={onSaved} />;
}

function CategoryFormModalContent({ state, onClose, onSaved }: CategoryFormModalContentProps) {
  const initialValues = initialFormValues(state);
  const [name, setName] = useState(initialValues.name);
  const [description, setDescription] = useState(initialValues.description);
  const [color, setColor] = useState(initialValues.color);
  const [colorError, setColorError] = useState<string | null>(null);
  const [icon, setIcon] = useState(initialValues.icon);
  const [divisionPrefix, setDivisionPrefix] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const previewCode = useMemo(() => {
    if (!state) return "";
    if (state.mode === "edit") return state.category.code;
    if (state.level === "DIVISION") return divisionPrefix || "--";
    if (!state.parent) return "";
    return previewNextChildCode(state.parent, state.level);
  }, [divisionPrefix, state]);

  const parent = state.mode === "create" ? state.parent : state.category.parent;
  const title = state.mode === "edit"
    ? `Editar ${levelLabel(state.category.level).toLowerCase()}`
    : `Nueva ${levelLabel(state.level).toLowerCase()}`;
  const categoryLevel = state.mode === "edit" ? state.category.level : state.level;
  const selectedIconOption = getCategoryIconOption(icon);
  const normalizedIconValue = selectedIconOption?.value ?? "";
  const iconUnsupported = isUnsupportedCategoryIcon(icon);
  const normalizedColor = normalizeCategoryColor(color);
  const hasValidColor = isValidCategoryColor(color);
  const colorPickerValue = hasValidColor ? normalizedColor : DEFAULT_CATEGORY_PICKER_COLOR;

  const handleColorPickerChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextColor = normalizeCategoryColor(event.target.value);
    setColor(nextColor);
    setColorError(null);
    setError(null);
  };

  const handleColorTextChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextColor = event.target.value.trim().toUpperCase();
    setColor(nextColor);
    setError(null);
    setColorError(nextColor && !isValidCategoryColor(nextColor) ? CATEGORY_COLOR_ERROR : null);
  };

  const selectPaletteColor = (nextColor: string) => {
    setColor(normalizeCategoryColor(nextColor));
    setColorError(null);
    setError(null);
  };

  const validate = (): boolean => {
    const cleanName = name.trim();
    if (!cleanName) {
      setError("El nombre de categoria es obligatorio.");
      return false;
    }
    if (cleanName.length > NAME_MAX) {
      setError(`El nombre no puede exceder ${NAME_MAX} caracteres.`);
      return false;
    }
    if (description.trim().length > DESCRIPTION_MAX) {
      setError(`La descripcion no puede exceder ${DESCRIPTION_MAX} caracteres.`);
      return false;
    }
    if (color.trim() && !isValidCategoryColor(color)) {
      setColorError(CATEGORY_COLOR_ERROR);
      setError(CATEGORY_COLOR_ERROR);
      return false;
    }
    if (state.mode === "create" && state.level === "DIVISION" && !/^[A-Z]{2}$/.test(divisionPrefix)) {
      setError("El prefijo debe tener exactamente dos letras.");
      return false;
    }
    setColorError(null);
    return true;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || !validate()) return;

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      color: color.trim() ? normalizeCategoryColor(color) : null,
      icon: iconUnsupported ? "tag" : getCategoryIconValue(icon),
    };

    setSaving(true);
    setError(null);

    try {
      if (state.mode === "edit") {
        const category = await adminCategoryService.update(state.category.id, payload);
        onSaved(category, "Categoria actualizada correctamente.");
      } else {
        const category = await adminCategoryService.create({
          ...payload,
          level: state.level,
          ...(state.level === "DIVISION" ? { divisionPrefix } : { parentId: state.parent?.id }),
        });
        onSaved(category, "Categoria creada correctamente.");
      }
    } catch (err: unknown) {
      setError(getAdminCategoryErrorMessage(
        err,
        state.mode === "edit" ? "No se pudo actualizar la categoria." : "No se pudo crear la categoria."
      ));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={() => !saving && onClose()}>
      <form style={styles.modal} onClick={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
        <div style={ui.modalHeader}>
          <div>
            <div style={ui.modalTitle}>{title}</div>
            <div style={styles.subtitle}>
              Codigo {state.mode === "edit" ? "actual" : "previsto"}: <strong>{previewCode}</strong>
            </div>
          </div>
          <button type="button" style={{ ...ui.ghostBtn, padding: "6px 10px" }} onClick={onClose} disabled={saving}>
            <X size={16} />
          </button>
        </div>

        <div style={ui.modalBody}>
          {parent && (
            <div style={styles.readOnlyBox}>
              <span style={styles.readOnlyLabel}>Padre</span>
              <strong>{parent.name} ({parent.code})</strong>
            </div>
          )}

          {state.mode === "edit" && (
            <div style={styles.lockedGrid}>
              <div style={styles.readOnlyBox}>
                <span style={styles.readOnlyLabel}>Nivel</span>
                <strong>{levelLabel(state.category.level)}</strong>
              </div>
              <div style={styles.readOnlyBox}>
                <span style={styles.readOnlyLabel}>Codigo</span>
                <strong>{state.category.code}</strong>
              </div>
            </div>
          )}

          {state.mode === "create" && state.level === "DIVISION" && (
            <div style={styles.field}>
              <label style={ui.fieldLabel}>Prefijo de division *</label>
              <input
                style={ui.input}
                value={divisionPrefix}
                onChange={(event) => setDivisionPrefix(event.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase())}
                placeholder="AB"
                maxLength={2}
                autoFocus
              />
              <p style={styles.hint}>Vista previa: {previewCode}</p>
            </div>
          )}

          <div style={styles.field}>
            <label style={ui.fieldLabel}>Nombre *</label>
            <input
              style={ui.input}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nombre de la categoria"
              maxLength={NAME_MAX}
              autoFocus={!(state.mode === "create" && state.level === "DIVISION")}
            />
            <div style={styles.counterRow}>
              <span />
              <span>{name.length}/{NAME_MAX}</span>
            </div>
          </div>

          <div style={styles.field}>
            <label style={ui.fieldLabel}>Descripcion</label>
            <textarea
              style={{ ...ui.input, minHeight: 78, resize: "vertical" }}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Descripcion breve"
              maxLength={DESCRIPTION_MAX}
            />
            <div style={styles.counterRow}>
              <span />
              <span>{description.length}/{DESCRIPTION_MAX}</span>
            </div>
          </div>

          <div style={styles.twoColumns}>
            <div style={{ ...styles.field, gridColumn: "1 / -1" }}>
              <label style={ui.fieldLabel}>Color de categoria</label>
              <div style={styles.colorPickerRow}>
                <input
                  type="color"
                  style={styles.colorPickerInput}
                  value={colorPickerValue}
                  onChange={handleColorPickerChange}
                  aria-label="Seleccionar color de categoria"
                />
                <input
                  style={{ ...ui.input, ...(colorError ? styles.inputError : {}) }}
                  value={color}
                  onChange={handleColorTextChange}
                  placeholder="#3B82F6"
                  maxLength={7}
                  spellCheck={false}
                  aria-invalid={Boolean(colorError)}
                />
              </div>
              <div style={styles.colorPalette}>
                {CATEGORY_COLOR_PALETTE.map((option) => {
                  const selected = hasValidColor && normalizedColor === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      style={{
                        ...styles.colorPaletteButton,
                        ...(selected ? styles.colorPaletteButtonSelected : {}),
                      }}
                      onClick={() => selectPaletteColor(option.value)}
                      title={`${option.label} ${option.value}`}
                    >
                      <span style={{ ...styles.colorPaletteDot, backgroundColor: option.value }} />
                      {option.label}
                    </button>
                  );
                })}
              </div>
              {colorError ? (
                <p style={styles.colorError}>{colorError}</p>
              ) : (
                <p style={styles.hint}>Opcional. Usa formato #RRGGBB o el selector visual.</p>
              )}
            </div>
            <div style={{ ...styles.field, gridColumn: "1 / -1" }}>
              <label style={ui.fieldLabel}>Icono / departamento</label>
              <div style={styles.iconPreview}>
                <span style={styles.iconPreviewBadge}>
                  {renderCategoryIcon(icon, categoryLevel, { size: 18 })}
                </span>
                <span style={styles.iconPreviewText}>
                  {iconUnsupported
                    ? "Icono no reconocido"
                    : selectedIconOption
                      ? `${selectedIconOption.label} · se guardará: ${selectedIconOption.value}`
                      : "Sin icono personalizado"}
                </span>
              </div>
              <p style={styles.iconHint}>Selecciona un icono representativo. No necesitas memorizar nombres técnicos.</p>
              <div style={styles.iconGrid}>
                <button
                  type="button"
                  style={{
                    ...styles.iconChoice,
                    ...(!icon.trim() ? styles.iconChoiceSelected : {}),
                  }}
                  onClick={() => {
                    setIcon("");
                    setError(null);
                  }}
                >
                  {renderCategoryIcon(null, categoryLevel, { size: 15 })}
                  Por nivel
                </button>
                {CATEGORY_ICON_OPTIONS.map((option) => {
                  const selected = !iconUnsupported && normalizedIconValue === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      style={{
                        ...styles.iconChoice,
                        ...(selected ? styles.iconChoiceSelected : {}),
                      }}
                      onClick={() => {
                        setIcon(option.value);
                        setError(null);
                      }}
                    >
                      {renderLucideIcon(option.Icon, { size: 15 })}
                      {option.label}
                    </button>
                  );
                })}
              </div>
              {iconUnsupported && (
                <p style={styles.iconWarning}>Icono no reconocido. Se usará el icono predeterminado.</p>
              )}
            </div>
          </div>

          {error && <p style={styles.error}>{error}</p>}
        </div>

        <div style={styles.footer}>
          <button type="button" style={{ ...ui.ghostBtn, flex: 1, justifyContent: "center" }} onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" style={{ ...ui.primaryBtn, flex: 1, justifyContent: "center" }} disabled={saving}>
            {saving ? "Guardando..." : state.mode === "edit" ? "Actualizar categoria" : "Crear categoria"}
          </button>
        </div>
      </form>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(15,23,42,0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 360,
    padding: 16,
  },
  modal: {
    ...ui.modal,
    width: "min(540px, calc(100vw - 24px))",
    maxHeight: "90vh",
  },
  subtitle: {
    fontSize: 12,
    color: "var(--text-muted)",
    marginTop: 4,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
    marginBottom: 14,
    minWidth: 0,
  },
  hint: {
    margin: 0,
    color: "var(--text-muted)",
    fontSize: 12,
    fontWeight: 700,
  },
  counterRow: {
    display: "flex",
    justifyContent: "space-between",
    color: "var(--text-muted)",
    fontSize: 12,
    fontWeight: 700,
  },
  twoColumns: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
  },
  colorPickerRow: {
    display: "grid",
    gridTemplateColumns: "46px minmax(0, 1fr)",
    gap: 10,
    alignItems: "center",
  },
  colorPickerInput: {
    width: 46,
    height: 40,
    border: "1px solid var(--border)",
    borderRadius: 8,
    backgroundColor: "var(--surface)",
    padding: 3,
    cursor: "pointer",
  },
  inputError: {
    borderColor: "var(--color-danger)",
    boxShadow: "0 0 0 2px rgba(220, 38, 38, 0.12)",
  },
  colorPalette: {
    display: "flex",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 2,
  },
  colorPaletteButton: {
    border: "1px solid var(--border)",
    borderRadius: 999,
    backgroundColor: "var(--surface)",
    color: "var(--text-secondary)",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    minHeight: 28,
    padding: "4px 9px",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 12,
    fontWeight: 800,
  },
  colorPaletteButtonSelected: {
    borderColor: "var(--accent)",
    backgroundColor: "var(--accent-soft)",
    color: "var(--accent-strong)",
  },
  colorPaletteDot: {
    width: 12,
    height: 12,
    borderRadius: "50%",
    border: "1px solid rgba(15, 23, 42, 0.16)",
    flexShrink: 0,
  },
  colorError: {
    color: "var(--color-danger)",
    fontSize: 12,
    fontWeight: 800,
    margin: 0,
  },
  iconPreview: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    backgroundColor: "var(--surface-2)",
    color: "var(--text-secondary)",
    display: "flex",
    alignItems: "center",
    gap: 9,
    minHeight: 40,
    padding: "7px 9px",
  },
  iconPreviewBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "var(--surface)",
    border: "1px solid var(--border)",
    color: "var(--accent)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  iconPreviewText: {
    fontSize: 12,
    fontWeight: 800,
    overflowWrap: "anywhere",
  },
  iconGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(138px, 1fr))",
    gap: 8,
    maxHeight: 270,
    overflowY: "auto",
    paddingRight: 2,
  },
  iconChoice: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    backgroundColor: "var(--surface)",
    color: "var(--text-secondary)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 7,
    minHeight: 36,
    padding: "7px 9px",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 12,
    fontWeight: 800,
  },
  iconChoiceSelected: {
    borderColor: "var(--accent)",
    backgroundColor: "var(--accent-soft)",
    color: "var(--accent-strong)",
  },
  iconWarning: {
    color: "var(--text-muted)",
    fontSize: 12,
    fontWeight: 700,
    margin: 0,
  },
  iconHint: {
    color: "var(--text-muted)",
    fontSize: 12,
    fontWeight: 700,
    margin: 0,
  },
  readOnlyBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    backgroundColor: "var(--surface-2)",
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 3,
    marginBottom: 12,
    color: "var(--text)",
    minWidth: 0,
  },
  readOnlyLabel: {
    color: "var(--text-muted)",
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase",
  },
  lockedGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 10,
  },
  error: {
    color: "var(--color-danger)",
    fontSize: 13,
    fontWeight: 700,
    margin: "4px 0 0",
  },
  footer: {
    borderTop: "1px solid var(--border)",
    padding: "14px 22px",
    display: "flex",
    gap: 10,
    backgroundColor: "var(--surface-2)",
    flexWrap: "wrap",
  },
};
