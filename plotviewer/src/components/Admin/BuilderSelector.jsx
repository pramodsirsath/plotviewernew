import React, { useEffect, useMemo, useState } from "react";
import API from "../../services/api";

const normalizeId = (value) => String(value?._id || value || "");

const BuilderSelector = ({ layoutId, assignedBuilders = [], onAssigned }) => {
  const [builders, setBuilders] = useState([]);
  const [selected, setSelected] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchBuilders();
  }, []);

  useEffect(() => {
    setSelected(
      assignedBuilders
        .map((builder) => normalizeId(builder))
        .filter(Boolean)
    );
  }, [assignedBuilders]);

  const selectedBuilderSet = useMemo(
    () => new Set(selected.map((id) => normalizeId(id))),
    [selected]
  );

  const fetchBuilders = async () => {
    try {
      const res = await API.get("/users/builders");
      setBuilders(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const handleChange = (id) => {
    const normalizedId = normalizeId(id);
    setSelected((prev) =>
      prev.includes(normalizedId)
        ? prev.filter((builderId) => builderId !== normalizedId)
        : [...prev, normalizedId]
    );
  };

  const save = async () => {
    try {
      setIsSaving(true);
      await API.post(`/layouts/${layoutId}/assign`, { builders: selected });
      onAssigned?.();
      alert("Builders assigned");
    } catch (error) {
      console.error(error);
      alert("Could not assign builders");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section style={styles.card}>
      <div>
        <h4 style={styles.title}>Assign Builders</h4>
        <p style={styles.subtitle}>
          Saved selections stay checked after refresh. Pick one or many builders for this layout.
        </p>
      </div>

      <div style={styles.list}>
        {builders.map((builder) => {
          const builderId = normalizeId(builder._id);

          return (
            <label key={builderId} style={styles.item}>
              <input
                type="checkbox"
                checked={selectedBuilderSet.has(builderId)}
                onChange={() => handleChange(builderId)}
                style={styles.checkbox}
              />

              <div style={styles.textContainer}>
                <strong style={styles.name}>{builder.name}</strong>
                <span style={styles.email}>{builder.email}</span>
              </div>
            </label>
          );
        })}
      </div>

      <div style={styles.buttonRow}>
        <button onClick={save} disabled={isSaving} className="btn btn-primary" style={styles.button}>
          {isSaving ? "Saving..." : "Save Assignment"}
        </button>
      </div>
    </section>
  );
};

const styles = {
  card: {
    width: "100%",
    maxWidth: "100%",
    margin: "0 auto",
    padding: "16px",
    borderRadius: "16px",
    background: "var(--surface)",
    border: "1px solid var(--line)",
    boxSizing: "border-box",
    overflow: "hidden"
  },

  title: {
    fontSize: "1rem",
    fontWeight: 700,
    margin: 0,
    color: "var(--text)"
  },

  subtitle: {
    fontSize: "0.85rem",
    color: "var(--muted)",
    marginTop: 4,
    marginBottom: 12
  },

  list: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    width: "100%"
  },

  item: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    width: "100%",
    padding: "12px",
    borderRadius: "12px",
    background: "var(--surface-strong)",
    boxSizing: "border-box",
    overflow: "hidden"
  },

  checkbox: {
    width: "16px",
    height: "16px",
    flexShrink: 0
  },

  textContainer: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minWidth: 0   // 🔥 VERY IMPORTANT (fix overflow)
  },

  name: {
    fontSize: "0.9rem",
    color: "var(--text)"
  },

  email: {
    fontSize: "0.8rem",
    color: "var(--muted)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis"   // 🔥 prevents overflow
  },

  buttonRow: {
    marginTop: "14px",
    display: "flex",
    justifyContent: "center"
  },

  button: {
    width: "100%",
    maxWidth: "300px"
  }
};

export default BuilderSelector;