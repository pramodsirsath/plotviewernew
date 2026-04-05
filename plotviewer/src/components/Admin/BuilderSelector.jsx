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
    setSelected(assignedBuilders.map((builder) => normalizeId(builder)).filter(Boolean));
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
    <section className="surface-card section-stack">
      <div>
        <h4 className="panel-title" style={{ fontSize: "1.05rem" }}>Assign Builders</h4>
        <p className="panel-subtitle">Saved selections stay checked after refresh. Pick one or many builders for this layout.</p>
      </div>

      <div className="checkbox-list">
        {builders.map((builder) => {
          const builderId = normalizeId(builder._id);

          return (
            <label key={builderId} className="checkbox-card">
              <input
                type="checkbox"
                checked={selectedBuilderSet.has(builderId)}
                onChange={() => handleChange(builderId)}
              />
              <span>
                <strong>{builder.name}</strong>
                <span className="inline-note" style={{ display: "block", marginTop: 2 }}>{builder.email}</span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="button-row">
        <button onClick={save} disabled={isSaving} className="btn btn-primary">
          {isSaving ? "Saving..." : "Save Assignment"}
        </button>
      </div>
    </section>
  );
};

export default BuilderSelector;
