"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

interface Props {
  percent: number;
  filled: number;
  total: number;
}

export function RoutineCoverageChart({ percent, filled, total }: Props) {
  const data = [
    { name: "Scheduled", value: filled },
    { name: "Empty", value: Math.max(total - filled, 0) },
  ];

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-8">
      <div className="relative h-44 w-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={58}
              outerRadius={78}
              startAngle={90}
              endAngle={-270}
              strokeWidth={0}
              paddingAngle={total === filled ? 0 : 2}
            >
              <Cell fill="#0d9488" />
              <Cell fill="#e2e8f0" />
            </Pie>
            <Tooltip
              formatter={(value) => Number(value ?? 0).toLocaleString()}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                fontSize: 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-[#1e3a5f]">{percent}%</span>
          <span className="text-xs text-slate-400">scheduled</span>
        </div>
      </div>
      <div className="space-y-2 text-center sm:text-left">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-teal-600" />
          <span className="text-sm text-slate-600">
            <span className="font-semibold text-slate-800">
              {filled.toLocaleString()}
            </span>{" "}
            periods scheduled
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
          <span className="text-sm text-slate-600">
            <span className="font-semibold text-slate-800">
              {(total - filled).toLocaleString()}
            </span>{" "}
            slots open
          </span>
        </div>
      </div>
    </div>
  );
}