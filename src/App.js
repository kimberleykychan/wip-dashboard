import { useState } from "react";
import OpenPOs from "./OpenPOs";
import POHistory from "./POHistory";

const TABS = ["Open POs", "PO History"];

export default function App() {
  const [tab, setTab] = useState("Open POs");

  return (
    <div style={{ padding: 24, minHeight: "100vh", background: "#0f172a" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>
          WIP Dashboard
        </h1>
        <div style={{ fontSize: 12, color: "#475569", marginBottom: 16 }}>
          Live from Brightpearl · updates daily
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "6px 18px", borderRadius: 6, border: "none", cursor: "pointer",
              background: tab === t ? "#3b82f6" : "#1e293b",
              color: tab === t ? "#fff" : "#94a3b8",
              fontSize: 13, fontWeight: 600,
            }}>{t}</button>
          ))}
        </div>
      </div>

      {tab === "Open POs" && <OpenPOs />}
      {tab === "PO History" && <POHistory />}
    </div>
  );
}
