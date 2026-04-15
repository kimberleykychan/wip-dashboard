import { useState, useEffect, useMemo } from "react";
import { supabase, fmtDate } from "./supabase";

const TH = { padding: "8px 12px", color: "#64748b", fontWeight: 600, whiteSpace: "nowrap", textAlign: "left" };
const TD = { padding: "7px 12px", borderBottom: "1px solid #1e293b" };

function buildOpenPOs(poRows, grnItems) {
  const today = new Date();

  const grnMap = {};
  for (const g of grnItems) {
    if (!g.po_id) continue;
    const key = `${g.po_id}:${g.sku}`;
    grnMap[key] = (grnMap[key] || 0) + (g.quantity_received || 0);
  }

  return poRows.map(po => {
    const received   = Math.max(0, grnMap[`${po.po_id}:${po.sku}`] || 0);
    const remaining  = Math.max(0, (po.quantity || 0) - received);
    const delivDate  = po.delivery_date ? new Date(po.delivery_date) : null;
    return {
      ...po,
      received,
      remaining,
      is_overdue:  delivDate && delivDate < today,
      in_transit:  po.shipping_status_code === "ASS",
    };
  });
}

export default function OpenPOs() {
  const [lines, setLines]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [filter, setFilter]   = useState("all");
  const [sortCol, setSortCol] = useState("delivery_date");
  const [sortDir, setSortDir] = useState("asc");

  useEffect(() => {
    async function load() {
      const PAGE = 1000;
      const poRows = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("purchase_orders")
          .select("po_id,po_number,sku,product_name,option,quantity,order_date,delivery_date,supplier_name,shipping_status_code,status,synced_at")
          .eq("order_type_code", "PO")
          .order("po_id")
          .range(from, from + PAGE - 1);
        if (error) break;
        if (!data || data.length === 0) break;
        poRows.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }

      const grnItems = [];
      from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("brightpearl_goods_receipt_items")
          .select("po_id,sku,quantity_received")
          .order("id")
          .range(from, from + PAGE - 1);
        if (error) break;
        if (!data || data.length === 0) break;
        grnItems.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }

      const { data: packiyoPOs } = await supabase
        .from("packiyo_purchase_orders")
        .select("number,tracking_number,tracking_url");
      const trackingMap = {};
      for (const p of (packiyoPOs || [])) {
        if (p.number) trackingMap[p.number] = { tracking_number: p.tracking_number, tracking_url: p.tracking_url };
      }

      // Deduplicate: keep only the most recent row per (po_id, sku)
      const deduped = Object.values(
        poRows.reduce((acc, row) => {
          const key = `${row.po_id}:${row.sku}`;
          if (!acc[key] || (row.synced_at || "") > (acc[key].synced_at || "")) acc[key] = row;
          return acc;
        }, {})
      );
      const open = deduped
        .filter(r => r.status !== "Received" && r.status !== "Cancelled")
        .map(r => ({ ...r, ...(trackingMap[r.po_number] || {}) }));
      setLines(buildOpenPOs(open, grnItems));
      setLoading(false);
    }
    load();
  }, []);

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return lines
      .filter(r => {
        if (filter === "in_transit") return r.in_transit;
        if (filter === "on_order")   return !r.in_transit;
        if (filter === "overdue")    return r.is_overdue;
        return true;
      })
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
        if (["quantity","remaining","received"].includes(sortCol)) return mul * (Number(av) - Number(bv));
        return mul * String(av).localeCompare(String(bv));
      });
  }, [lines, search, filter, sortCol, sortDir]);

  function SortHdr({ col, label }) {
    const active = sortCol === col;
    return (
      <th onClick={() => handleSort(col)} style={{ ...TH, cursor: "pointer", color: active ? "#f1f5f9" : "#64748b" }}>
        {label}{active ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
      </th>
    );
  }

  if (loading) return <div style={{ color: "#64748b", padding: 40 }}>Loading…</div>;

  const today = new Date();

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Open POs",   value: new Set(lines.map(r => r.po_id)).size,                              color: "#f1f5f9" },
          { label: "Units",      value: lines.reduce((s,r) => s + r.remaining, 0).toLocaleString(),         color: "#38bdf8" },
          { label: "In Transit", value: lines.filter(r => r.in_transit).length,                             color: "#34d399" },
          { label: "Overdue",    value: lines.filter(r => r.is_overdue && !r.in_transit).length,            color: lines.filter(r => r.is_overdue && !r.in_transit).length > 0 ? "#f87171" : "#475569" },
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
        {[
          { key: "all",        label: "All" },
          { key: "on_order",   label: "On Order" },
          { key: "in_transit", label: "In Transit" },
          { key: "overdue",    label: "Overdue" },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
            background: filter === f.key ? "#3b82f6" : "#1e293b",
            color: filter === f.key ? "#fff" : "#64748b",
          }}>{f.label}</button>
        ))}
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
              <SortHdr col="remaining"     label="Remaining" />
              <SortHdr col="order_date"    label="PO Date" />
              <SortHdr col="delivery_date" label="Expected Arrival" />
              <th style={TH}>Status</th>
              <th style={TH}>Tracking</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
              const isOverdue   = r.is_overdue && !r.in_transit;
              return (
                <tr key={i} style={{ background: isOverdue ? "#1c0a0a" : "transparent" }}>
                  <td style={{ ...TD, fontFamily: "monospace", fontSize: 12 }}>
                    <div style={{ color: "#f1f5f9", fontWeight: 700 }}>{r.po_id}</div>
                    <div style={{ color: "#475569", fontSize: 11 }}>{r.po_number}</div>
                  </td>
                  <td style={{ ...TD, color: "#94a3b8" }}>{r.supplier_name || "—"}</td>
                  <td style={{ ...TD, color: "#f1f5f9" }}>{r.product_name || "—"}</td>
                  <td style={{ ...TD, color: "#64748b" }}>{r.option || "—"}</td>
                  <td style={{ ...TD, color: "#64748b", fontFamily: "monospace", fontSize: 12 }}>{r.sku}</td>
                  <td style={{ ...TD, color: "#94a3b8", textAlign: "right" }}>{r.quantity?.toLocaleString()}</td>
                  <td style={{ ...TD, color: "#f1f5f9", fontWeight: 600, textAlign: "right" }}>{r.remaining.toLocaleString()}</td>
                  <td style={{ ...TD, color: "#64748b" }}>{fmtDate(r.order_date)}</td>
                  <td style={{ ...TD, color: isOverdue ? "#f87171" : "#64748b", fontWeight: isOverdue ? 600 : 400 }}>
                    {fmtDate(r.delivery_date)}
                    {isOverdue && <span style={{ marginLeft: 6, fontSize: 11 }}>overdue</span>}
                  </td>
                  <td style={TD}>
                    {r.in_transit
                      ? <span style={{ background: "#06402b", color: "#34d399", padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 600 }}>In Transit</span>
                      : <span style={{ background: "#422006", color: "#fbbf24", padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 600 }}>On Order</span>
                    }
                  </td>
                  <td style={{ ...TD, fontFamily: "monospace", fontSize: 12 }}>
                    {r.tracking_number
                      ? r.tracking_url
                        ? <a href={r.tracking_url} target="_blank" rel="noreferrer" style={{ color: "#38bdf8", textDecoration: "none" }}>{r.tracking_number}</a>
                        : <span style={{ color: "#94a3b8" }}>{r.tracking_number}</span>
                      : <span style={{ color: "#475569" }}>—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
