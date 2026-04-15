import { useState, useEffect, useMemo } from "react";
import { supabase, fmtDate } from "./supabase";

const TH = { padding: "8px 12px", color: "#64748b", fontWeight: 600, whiteSpace: "nowrap", textAlign: "left" };
const TD = { padding: "7px 12px", borderBottom: "1px solid #1e293b" };

export default function POHistory() {
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [supplier, setSupplier] = useState("all");
  const [sortCol, setSortCol]   = useState("delivery_date");
  const [sortDir, setSortDir]   = useState("desc");

  useEffect(() => {
    async function load() {
      const PAGE = 1000;

      // Load all PO rows
      const poRows = [];
      let from = 0;
      while (true) {
        const { data } = await supabase
          .from("purchase_orders")
          .select("po_id,po_number,sku,product_name,option,quantity,order_date,delivery_date,supplier_name,status")
          .eq("order_type_code", "PO")
          .eq("status", "Received")
          .order("po_id")
          .range(from, from + PAGE - 1);
        if (!data || data.length === 0) break;
        poRows.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }

      // Load all GRN items
      const grnItems = [];
      from = 0;
      while (true) {
        const { data } = await supabase
          .from("brightpearl_goods_receipt_items")
          .select("po_id,sku,quantity_received")
          .range(from, from + PAGE - 1);
        if (!data || data.length === 0) break;
        grnItems.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }

      // Build received map
      const grnMap = {};
      for (const g of grnItems) {
        if (!g.po_id) continue;
        const key = `${g.po_id}:${g.sku}`;
        grnMap[key] = (grnMap[key] || 0) + (g.quantity_received || 0);
      }

      // Closed = fully received (received >= 95% of ordered)
      const closed = poRows.filter(po => {
        const received = grnMap[`${po.po_id}:${po.sku}`] || 0;
        const pct = po.quantity > 0 ? received / po.quantity : 0;
        return pct >= 0.95;
      }).map(po => ({
        ...po,
        received: grnMap[`${po.po_id}:${po.sku}`] || 0,
      }));

      const { data: packiyoPOs } = await supabase
        .from("packiyo_purchase_orders")
        .select("number,tracking_number,tracking_url");
      const trackingMap = {};
      for (const p of (packiyoPOs || [])) {
        if (p.number) trackingMap[p.number] = { tracking_number: p.tracking_number, tracking_url: p.tracking_url };
      }

      setRows(closed.map(r => ({ ...r, ...(trackingMap[r.po_number] || {}) })));
      setLoading(false);
    }
    load();
  }, []);

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  const suppliers = useMemo(() => [...new Set(rows.map(r => r.supplier_name).filter(Boolean))].sort(), [rows]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows
      .filter(r => supplier === "all" || r.supplier_name === supplier)
      .filter(r => !q ||
        (r.po_number     || "").toLowerCase().includes(q) ||
        (r.product_name  || "").toLowerCase().includes(q) ||
        (r.sku           || "").toLowerCase().includes(q) ||
        (r.supplier_name || "").toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const mul = sortDir === "asc" ? 1 : -1;
        const av = a[sortCol] ?? "";
        const bv = b[sortCol] ?? "";
        if (sortCol === "quantity" || sortCol === "received") return mul * (Number(av) - Number(bv));
        return mul * String(av).localeCompare(String(bv));
      });
  }, [rows, search, supplier, sortCol, sortDir]);

  function SortHdr({ col, label }) {
    const active = sortCol === col;
    return (
      <th onClick={() => handleSort(col)} style={{ ...TH, cursor: "pointer", color: active ? "#f1f5f9" : "#64748b" }}>
        {label}{active ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
      </th>
    );
  }

  if (loading) return <div style={{ color: "#64748b", padding: 40 }}>Loading…</div>;

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Closed POs", value: new Set(rows.map(r => r.po_id)).size,                    color: "#f1f5f9" },
          { label: "Line Items", value: rows.length,                                              color: "#94a3b8" },
          { label: "Units",      value: rows.reduce((s,r) => s + r.quantity, 0).toLocaleString(), color: "#38bdf8" },
          { label: "Suppliers",  value: suppliers.length,                                         color: "#a78bfa" },
        ].map(c => (
          <div key={c.label} style={{ background: "#1e293b", borderRadius: 8, padding: "12px 20px", minWidth: 120 }}>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <input
          placeholder="Search PO, SKU, product, supplier…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ background: "#1e293b", color: "#f1f5f9", border: "1px solid #334155", borderRadius: 6, padding: "6px 12px", fontSize: 13, width: 300 }}
        />
        <select
          value={supplier}
          onChange={e => setSupplier(e.target.value)}
          style={{ background: "#1e293b", color: "#f1f5f9", border: "1px solid #334155", borderRadius: 6, padding: "6px 12px", fontSize: 13 }}
        >
          <option value="all">All suppliers</option>
          {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={{ color: "#64748b", fontSize: 13 }}>{new Set(filtered.map(r=>r.po_id)).size} POs · {filtered.length} lines</span>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #1e293b" }}>
              <SortHdr col="po_number"     label="PO" />
              <SortHdr col="supplier_name" label="Supplier" />
              <SortHdr col="product_name"  label="Product" />
              <th style={TH}>Variant</th>
              <SortHdr col="sku"           label="SKU" />
              <SortHdr col="quantity"      label="Ordered" />
              <SortHdr col="received"      label="Received" />
              <SortHdr col="order_date"    label="PO Date" />
              <SortHdr col="delivery_date" label="Received Date" />
              <th style={TH}>Tracking</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={i}>
                <td style={{ ...TD, fontFamily: "monospace", fontSize: 12 }}>
                  <div style={{ color: "#f1f5f9", fontWeight: 700 }}>{r.po_number}</div>
                  <div style={{ color: "#475569", fontSize: 11 }}>#{r.po_id}</div>
                </td>
                <td style={{ ...TD, color: "#94a3b8" }}>{r.supplier_name || "—"}</td>
                <td style={{ ...TD, color: "#f1f5f9" }}>{r.product_name || "—"}</td>
                <td style={{ ...TD, color: "#64748b" }}>{r.option || "—"}</td>
                <td style={{ ...TD, color: "#64748b", fontFamily: "monospace", fontSize: 12 }}>{r.sku}</td>
                <td style={{ ...TD, color: "#94a3b8", textAlign: "right" }}>{r.quantity?.toLocaleString()}</td>
                <td style={{ ...TD, color: "#34d399", textAlign: "right" }}>{r.received?.toLocaleString()}</td>
                <td style={{ ...TD, color: "#64748b" }}>{fmtDate(r.order_date)}</td>
                <td style={{ ...TD, color: "#64748b" }}>{fmtDate(r.delivery_date)}</td>
                <td style={{ ...TD, fontFamily: "monospace", fontSize: 12 }}>
                  {r.tracking_number
                    ? r.tracking_url
                      ? <a href={r.tracking_url} target="_blank" rel="noreferrer" style={{ color: "#38bdf8", textDecoration: "none" }}>{r.tracking_number}</a>
                      : <span style={{ color: "#94a3b8" }}>{r.tracking_number}</span>
                    : <span style={{ color: "#475569" }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
