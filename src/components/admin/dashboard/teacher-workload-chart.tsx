"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface TeacherLoadDatum {
  name: string;
  periods: number;
  level: "light" | "normal" | "heavy";
}

interface Props {
  data: TeacherLoadDatum[];
}

const BAR_COLORS: Record<TeacherLoadDatum["level"], string> = {
  light: "#10b981",
  normal: "#f59e0b",
  heavy: "#ef4444",
};

export function TeacherWorkloadChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: "#94a3b8" }}
          axisLine={{ stroke: "#e2e8f0" }}
          tickLine={false}
          interval={0}
          angle={-45}
          textAnchor="end"
          height={64}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(14, 165, 233, 0.06)" }}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid #e2e8f0",
            fontSize: 12,
          }}
          formatter={(value) => [
            `${value ?? 0} periods`,
            "Weekly load",
          ]}
        />
        <Bar dataKey="periods" radius={[3, 3, 0, 0]} maxBarSize={26}>
          {data.map((d) => (
            <Cell key={d.name} fill={BAR_COLORS[d.level]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}