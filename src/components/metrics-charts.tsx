"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";

export type MetricsPoint = {
  key: string;
  label: string;
  spend: number;
  income: number;
  savings: number;
};

const COLORS = {
  spend: "#b42318",
  income: "#1f6b4a",
  savingsPos: "#1f6b4a",
  savingsNeg: "#b42318",
  grid: "#d9d2c5",
  muted: "#5f6f67",
  surface: "#fffcf7",
};

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm shadow-sm">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="tabular-nums">
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  );
}

export function SpendIncomeChart({ data }: { data: MetricsPoint[] }) {
  const hasData = data.some((d) => d.spend > 0 || d.income > 0);

  if (!hasData) {
    return (
      <p className="flex h-64 items-center justify-center text-sm text-[var(--muted)]">
        No activity in this period yet.
      </p>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.income} stopOpacity={0.28} />
              <stop offset="100%" stopColor={COLORS.income} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.spend} stopOpacity={0.22} />
              <stop offset="100%" stopColor={COLORS.spend} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: COLORS.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: COLORS.grid }}
            interval="preserveStartEnd"
            minTickGap={28}
          />
          <YAxis
            tick={{ fill: COLORS.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatCompactCurrency}
            width={48}
          />
          <Tooltip content={<ChartTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 12, color: COLORS.muted, paddingTop: 8 }}
          />
          <Area
            type="monotone"
            dataKey="income"
            name="Income"
            stroke={COLORS.income}
            fill="url(#incomeFill)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Area
            type="monotone"
            dataKey="spend"
            name="Spend"
            stroke={COLORS.spend}
            fill="url(#spendFill)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SavingsChart({ data }: { data: MetricsPoint[] }) {
  const hasData = data.some((d) => d.spend > 0 || d.income > 0);

  if (!hasData) {
    return (
      <p className="flex h-64 items-center justify-center text-sm text-[var(--muted)]">
        No savings data in this period yet.
      </p>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: COLORS.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: COLORS.grid }}
            interval="preserveStartEnd"
            minTickGap={28}
          />
          <YAxis
            tick={{ fill: COLORS.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatCompactCurrency}
            width={48}
          />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="savings" name="Savings" radius={[4, 4, 0, 0]} maxBarSize={36}>
            {data.map((entry) => (
              <Cell
                key={entry.key}
                fill={entry.savings >= 0 ? COLORS.savingsPos : COLORS.savingsNeg}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
