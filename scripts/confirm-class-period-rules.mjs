#!/usr/bin/env node
/**
 * Manual verification for the class-period-rules feature.
 *
 * Prerequisite: run supabase/class-period-rules.sql once in the Supabase SQL
 * Editor (the /pg SQL REST endpoint is disabled on this project, so DDL cannot
 * be applied from a script). After that, run:
 *   node scripts/confirm-class-period-rules.mjs
 *
 * It verifies:
 *   1. class_period_rules is seeded for every existing class (one row per day).
 *   2. No residual routine/adjustment rows violate the rules.
 *   3. DB trigger (defense-in-depth): inserting an out-of-range routine slot
 *      for Class 6 (period 7) is rejected even when bypassing the API.
 *   4. DB trigger: an in-range insert is accepted (and rolled back via delete).
 *   5. Adjustment trigger: out-of-range period rejected on a Thursday batch,
 *      in-range accepted.
 *   6. TS helper (isPeriodAllowed / periodRangesForClassName) matches the spec
 *      and the deployed seed table.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const root = dirname(fileURLToPath(import.meta.url));
const spec = {
  1: [5, 7, 5, 7], 2: [5, 7, 5, 7], 3: [1, 4, 1, 3], 4: [1, 4, 1, 3],
  5: [1, 5, 1, 4], 6: [1, 6, 1, 6], 7: [1, 6, 1, 6], 8: [1, 6, 1, 6],
  9: [1, 7, 1, 7], 10: [1, 7, 1, 7],
};

// ---- env loader (no dotenv dependency) ----
const env = {};
for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const srk = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!url || !srk) throw new Error("Missing Supabase env values in .env.local.");

const svc = createClient(url, srk, { auth: { persistSession: false } });
const DAYS = [0, 1, 2, 3, 4];

let passed = 0;
let failed = 0;
function check(label, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function findClass(name) {
  const { data } = await svc.from("classes").select("id, name").eq("name", name).single();
  return data;
}
async function findSection(classId, name = "A") {
  const { data } = await svc
    .from("sections").select("id, name, class_id")
    .eq("class_id", classId).eq("name", name).limit(1).maybeSingle();
  return data;
}

async function main() {
  const { data: classes, error: clsErr } = await svc
    .from("classes").select("id, name").order("sort_order");
  if (clsErr) { check("read classes", false, clsErr.message); return; }
  const { data: rules, error: rulesErr } = await svc
    .from("class_period_rules").select("class_id, day, min_period, max_period");
  if (rulesErr) { check("read class_period_rules", false, rulesErr.message); return; }
  const byClass = new Map();
  for (const r of rules ?? []) {
    if (!byClass.has(r.class_id)) byClass.set(r.class_id, []);
    byClass.get(r.class_id).push(r);
  }
  const ruleFor = (cid, day) => (byClass.get(cid) ?? []).find((r) => r.day === day);

  console.log("\n[1] class_period_rules seeded for each existing class");
  for (const c of classes ?? []) {
    const rs = byClass.get(c.id) ?? [];
    const daysCovered = DAYS.filter((d) => rs.some((r) => r.day === d)).length;
    check(`${c.name} has rules for all 5 days`, daysCovered === 5, `${rs.length} rule row(s)`);
  }

  console.log("\n[2] No residual routine/adjustment violations");
  const { data: allSections } = await svc.from("sections").select("id, class_id");
  const sectionClass = new Map((allSections ?? []).map((s) => [s.id, s.class_id]));
  const isAllowed = (cid, day, period) => {
    const r = ruleFor(cid, day);
    return !r || (period >= r.min_period && period <= r.max_period);
  };

  const { data: slots } = await svc.from("routine_slots").select("id, day, period_number, section_id");
  const slotViolations = (slots ?? []).filter((s) =>
    !isAllowed(sectionClass.get(s.section_id), s.day, s.period_number)).length;
  check("routine_slots clean", slotViolations === 0, `${slotViolations} violation(s)`);

  const { data: adj } = await svc.from("adjustment_assignments").select("id, period_number, batch_id");
  const { data: batches } = await svc.from("adjustment_batches").select("id, section_id, adjust_date");
  const batchInfo = new Map((batches ?? []).map((b) => [b.id, b]));
  const adjViolations = (adj ?? []).filter((a) => {
    const b = batchInfo.get(a.batch_id);
    if (!b) return false;
    const day = new Date(b.adjust_date + "T00:00:00").getDay();
    return !isAllowed(sectionClass.get(b.section_id), day, a.period_number);
  }).length;
  check("adjustment_assignments clean", adjViolations === 0, `${adjViolations} violation(s)`);

  console.log("\n[3] DB trigger — Class 6, period 7 rejected (bypasses API)");
  const class6 = await findClass("Class 6");
  const sec6 = await findSection(class6.id, "A");
  if (sec6) {
    const { data: slot, error: err } = await svc
      .from("routine_slots").insert({ section_id: sec6.id, day: 0, period_number: 7 })
      .select("id").maybeSingle();
    check("out-of-range insert rejected", !slot && !!err, (err?.message ?? "unknown").split("\n")[0]);
    if (slot) await svc.from("routine_slots").delete().eq("id", slot.id);
  } else {
    check("Class 6 section A resolved", false, "missing");
  }

  console.log("\n[4] DB trigger — in-range insert accepted then cleaned up");
  if (sec6) {
    const { data: existing } = await svc.from("routine_slots").select("day, period_number").eq("section_id", sec6.id);
    const used = new Set((existing ?? []).map((x) => `${x.day}:${x.period_number}`));
    let free = null;
    for (const d of DAYS) for (let p = 1; p <= 6; p++) if (!used.has(`${d}:${p}`)) { free = { day: d, period: p }; break; }
    if (free) {
      const { data: slot, error: err } = await svc
        .from("routine_slots").insert({ section_id: sec6.id, day: free.day, period_number: free.period })
        .select("id").maybeSingle();
      check("in-range insert accepted", !!slot && !err, `day ${free.day} / p${free.period}`);
      if (slot) await svc.from("routine_slots").delete().eq("id", slot.id);
    } else {
      check("free in-range slot available", false, "none found — unique conflict");
    }
  }

  console.log("\n[5] DB trigger — adjustment rules (Thursday Class 6)");
  if (sec6) {
    const { data: room } = await svc.from("rooms").select("id").limit(1).maybeSingle();
    const { data: batch, error: bErr } = await svc
      .from("adjustment_batches").insert({ adjust_date: "2026-09-24", section_id: sec6.id, reason: "cpr-verify" })
      .select("id").single();
    if (bErr) {
      check("batch created", false, bErr.message);
    } else {
      const { data: bad, error: badErr } = await svc
        .from("adjustment_assignments")
        .insert({ batch_id: batch.id, period_number: 7, assignment_role: "primary", new_room_id: room?.id ?? null })
        .select("id").maybeSingle();
      check("Thu p7 rejected", !bad && !!badErr, (badErr?.message ?? "unknown").split("\n")[0]);
      if (bad) await svc.from("adjustment_assignments").delete().eq("id", bad.id);

      const { data: ok1, error: okErr } = await svc
        .from("adjustment_assignments")
        .insert({ batch_id: batch.id, period_number: 5, assignment_role: "primary", new_room_id: room?.id ?? null })
        .select("id").maybeSingle();
      check("Thu p5 accepted", !!ok1 && !okErr, okErr?.message ?? "");
      if (ok1) await svc.from("adjustment_assignments").delete().eq("id", ok1.id);

      await svc.from("adjustment_batches").delete().eq("id", batch.id);
    }
  }

  console.log("\n[6] TS helper parity with spec + deployed seed");
  const helperOut = spawnSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "scripts/helper-parity.ts"],
    { cwd: root, encoding: "utf8" },
  );
  if (helperOut.status !== 0) {
    check("tsx helper run", false, helperOut.stderr.trim().split("\n")[0] ?? "subprocess failed");
  } else {
    const helper = JSON.parse(helperOut.stdout.trim());
    let ok = true;
    for (const c of classes ?? []) {
      const m = /^Class\s+(\d+)$/.exec(c.name);
      if (!m) continue;
      const [lo, hi, loThu, hiThu] = spec[Number(m[1])] ?? [1, 7, 1, 7];
      const expected = `${lo},${hi}|${lo},${hi}|${lo},${hi}|${lo},${hi}|${loThu},${hiThu}`;
      const help = helper[Number(m[1])];
      if (!help || help !== expected) ok = false;
      for (const d of DAYS) {
        const rule = ruleFor(c.id, d);
        const expMin = d === 4 ? loThu : lo;
        const expMax = d === 4 ? hiThu : hi;
        if (!rule || rule.min_period !== expMin || rule.max_period !== expMax) ok = false;
      }
    }
    check("TS helper matches spec and seeded rules", ok);
  }

  console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });