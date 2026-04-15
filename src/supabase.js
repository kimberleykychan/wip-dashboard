import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "https://qcpvmyholfiymflrnaav.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjcHZteWhvbGZpeW1mbHJuYWF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NzA3NTYsImV4cCI6MjA4ODA0Njc1Nn0.aQqcTtilXRx1DE5gZTZ0-JAgK2_mywv8opODSYf98S8"
);

export function fmtDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
