// Prints the per-day ranges periodRangesForClassName yields for Class 1..10
// as JSON, for comparison against the spec table and the deployed seed.
import { periodRangesForClassName } from "../src/lib/class-period-rules";

const out: Record<number, string> = {};
for (let n = 1; n <= 10; n++) {
  const ranges = periodRangesForClassName(`Class ${n}`);
  out[n] = (ranges ?? []).map((d) => `${d.minPeriod},${d.maxPeriod}`).join("|");
}
console.log(JSON.stringify(out));