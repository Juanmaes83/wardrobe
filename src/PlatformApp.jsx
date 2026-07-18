import { useEffect, useMemo, useState } from "react";
import "./platform.css";

const PROJECT_ID = import.meta.env.VITE_PLATFORM_PROJECT_ID || "project-sol";
const API = "/platform-api";

function authHeaders(token, extra = {}) {
  return {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    "content-type": "application/json",
    ...extra,
  };
}

function pickAsset(entity, kindOrder = ["modeled", "garment", "reconstruction", "thumbnail"]) {
  for (const kind of kindOrder) {
    const asset = entity?.assets?.find((item) => item.kind === kind);
    if (asset) return asset;
  }
  return entity?.assets?.[0] || null;
}

export function PlatformApp() {
  const [token, setToken] = useState(() => sessionStorage.getItem("fashion-admin-token") || "");
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState("garments");
  const [showToken, setShowToken] = useState(false);

  const load = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${API}/admin/projects/${PROJECT_ID}/studio`, {
        headers: authHeaders(token),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401 || response.status === 503) setShowToken(true);
        throw new Error(body.error?.message || "No se pudo cargar Fashion Studio SOL.");
      }
      if (token) sessionStorage.setItem("fashion-admin-token", token);
      setSnapshot(body);
      setShowToken(false);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, []);

  const garmentsById = useMemo(
    () => Object.fromEntries((snapshot?.garments || []).map((garment) => [garment.id, garment])),
    [snapshot],
  );

  const saveGarment = async (garment, patch) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${API}/admin/projects/${PROJECT_ID}/garments/${encodeURIComponent(garment.id)}`, {
        method: "PATCH",
        headers: authHeaders(token, { "if-match": String(garment.version) }),
        body: JSON.stringify(patch),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message || "No se pudo guardar la prenda.");
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const queueEditorial = async (outfit) => {
    const garmentAssetIds = outfit.garmentIds
      .map((id) => pickAsset(garmentsById[id], ["garment", "reconstruction"])?.id)
      .filter(Boolean);
    if (garmentAssetIds.length !== outfit.garmentIds.length) {
      return setError("Faltan assets internos de alguna prenda del outfit.");
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${API}/admin/projects/${PROJECT_ID}/jobs`, {
        method: "POST",
        headers: authHeaders(token, { "idempotency-key": `editorial-${outfit.id}-${Date.now()}` }),
        body: JSON.stringify({
          jobType: "generate_outfit_editorial",
          targetType: "outfit",
          targetId: outfit.id,
          input: {
            garmentAssetIds,
            prompt: `Create a premium realistic editorial flat-lay for the outfit ${outfit.name}. Show exactly the supplied garments, preserve their colors, fabrics and construction, use a clean neutral fashion-editorial background, no people, no text, no logos, no extra products.`,
          },
          maxAttempts: 1,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message || "No se pudo crear el trabajo.");
      setActive("jobs");
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  if (!snapshot) {
    return (
      <main className="platform-shell">
        <section className="platform-login">
          <p>FASHION STUDIO SOL · FASE 2F</p>
          <h1>Wardrobe conectado a PostgreSQL</h1>
          <p>{showToken ? "La API requiere credenciales." : "Conectando automáticamente con la plataforma local…"}</p>
          {showToken && (
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Admin API token"
            />
          )}
          <button onClick={load} disabled={busy}>{busy ? "Conectando…" : "Reintentar conexión"}</button>
          {error && <p className="platform-error">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="platform-shell">
      <header className="platform-top">
        <div>
          <p>FASHION STUDIO SOL · API MODE</p>
          <h1>{snapshot.project.name}</h1>
          <span>{snapshot.counts.garments} prendas · {snapshot.counts.outfits} outfits · {snapshot.counts.assets} assets</span>
        </div>
        <button onClick={load} disabled={busy}>{busy ? "Actualizando…" : "Actualizar"}</button>
      </header>

      <nav className="platform-tabs">
        {[["garments", "Prendas"], ["outfits", "Outfits"], ["jobs", "Trabajos"]].map(([id, label]) => (
          <button key={id} className={active === id ? "active" : ""} onClick={() => setActive(id)}>{label}</button>
        ))}
      </nav>

      {error && <p className="platform-error">{error}</p>}

      {active === "garments" && (
        <section className="platform-grid">
          {snapshot.garments.map((garment) => {
            const asset = pickAsset(garment);
            return (
              <article className="platform-card" key={garment.id}>
                {asset ? <img src={`${API}${asset.url}`} alt={garment.name} /> : <div className="platform-placeholder">Sin imagen</div>}
                <div>
                  <span>{garment.part}</span>
                  <input
                    defaultValue={garment.name}
                    onBlur={(event) => event.target.value !== garment.name && saveGarment(garment, { name: event.target.value })}
                  />
                  <small>ID {garment.id} · v{garment.version}</small>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {active === "outfits" && (
        <section className="platform-grid">
          {snapshot.outfits.map((outfit) => {
            const asset = pickAsset(outfit, ["editorial"]);
            return (
              <article className="platform-card" key={outfit.id}>
                {asset ? <img src={`${API}${asset.url}`} alt={outfit.name} /> : <div className="platform-placeholder">Sin editorial</div>}
                <div>
                  <span>{outfit.status}</span>
                  <h2>{outfit.name}</h2>
                  <small>{outfit.garmentIds.join(" · ")}</small>
                  <button onClick={() => queueEditorial(outfit)} disabled={busy}>Generar editorial</button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {active === "jobs" && (
        <section className="platform-jobs">
          {snapshot.jobs.length ? snapshot.jobs.map((job) => (
            <article key={job.id}>
              <div>
                <strong>{job.jobType}</strong>
                <small>{job.targetType} · {job.targetId}</small>
                {job.output?.assetId && <small>Asset generado: {job.output.assetId}</small>}
                {job.errorMessage && <small className="platform-error">{job.errorCode}: {job.errorMessage}</small>}
              </div>
              <div className="platform-progress"><i style={{ width: `${job.progress}%` }} /></div>
              <span>{job.progress}% · {job.status} · intento {job.attemptCount}/{job.maxAttempts}</span>
            </article>
          )) : <p>No hay trabajos todavía.</p>}
        </section>
      )}
    </main>
  );
}
