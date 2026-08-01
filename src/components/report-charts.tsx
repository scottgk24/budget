"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Sankey,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMoneyFormat } from "@/components/privacy-context";
import type { SpendPacePoint } from "@/lib/report-types";

export type { SpendPacePoint };

const COLORS = {
  spend: "#d4655a",
  income: "#7ec07a",
  ideal: "#8fb396",
  pace: "#d4a857",
  grid: "#2f5a3c",
  muted: "#8fb396",
  sankeyNode: "#2c5f2b",
  sankeyLink: "#5c6b46",
};

const STACK_COLORS = [
  "#2c5f2b",
  "#5c6b46",
  "#7a9a6a",
  "#d4a857",
  "#3d5c40",
  "#8fa38c",
  "#6b8f71",
  "#d4655a",
  "#4a6b4e",
  "#b8975c",
];

function MoneyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number | null; color: string }>;
  label?: string;
}) {
  const { formatCurrency } = useMoneyFormat();
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm shadow-sm">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((p) =>
        p.value == null ? null : (
          <p key={p.name} style={{ color: p.color }} className="tabular-nums">
            {p.name}: {formatCurrency(p.value)}
          </p>
        ),
      )}
    </div>
  );
}

export function SpendPaceChart({
  data,
  budgetTotal,
}: {
  data: SpendPacePoint[];
  budgetTotal: number;
}) {
  const { formatCompactCurrency } = useMoneyFormat();
  const hasData = data.some((d) => (d.actual ?? 0) > 0) || budgetTotal > 0;

  if (!hasData) {
    return (
      <p className="flex h-64 items-center justify-center text-sm text-[var(--muted)]">
        Set a budget to see spend pace.
      </p>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
          <Tooltip content={<MoneyTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 12, color: COLORS.muted, paddingTop: 8 }}
          />
          <Line
            type="monotone"
            dataKey="ideal"
            name="Ideal pace"
            stroke={COLORS.ideal}
            strokeDasharray="6 4"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="actual"
            name="Actual spend"
            stroke={COLORS.pace}
            strokeWidth={2.5}
            dot={false}
            connectNulls
            activeDot={{ r: 5 }}
          />
          {budgetTotal > 0 ? (
            <ReferenceLine
              y={budgetTotal}
              stroke={COLORS.spend}
              strokeDasharray="4 4"
              strokeOpacity={0.55}
            />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryTrendsChart({
  data,
  keys,
}: {
  data: Array<Record<string, string | number>>;
  keys: string[];
}) {
  const { formatCompactCurrency } = useMoneyFormat();
  const hasData = data.some((row) =>
    keys.some((k) => typeof row[k] === "number" && (row[k] as number) > 0),
  );

  if (!hasData || keys.length === 0) {
    return (
      <p className="flex h-72 items-center justify-center text-sm text-[var(--muted)]">
        No category spending in this range.
      </p>
    );
  }

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: COLORS.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: COLORS.grid }}
          />
          <YAxis
            tick={{ fill: COLORS.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatCompactCurrency}
            width={48}
          />
          <Tooltip content={<MoneyTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 11, color: COLORS.muted, paddingTop: 8 }}
          />
          {keys.map((key, i) => (
            <Bar
              key={key}
              dataKey={key}
              name={key}
              stackId="spend"
              fill={STACK_COLORS[i % STACK_COLORS.length]}
              maxBarSize={40}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MerchantBarChart({
  data,
}: {
  data: Array<{ merchant: string; amount: number; count: number }>;
}) {
  const { formatCompactCurrency, formatCurrency } = useMoneyFormat();

  if (data.length === 0) {
    return (
      <p className="flex h-72 items-center justify-center text-sm text-[var(--muted)]">
        No merchant spending in this range.
      </p>
    );
  }

  const chartData = [...data].reverse();

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
        >
          <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: COLORS.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatCompactCurrency}
          />
          <YAxis
            type="category"
            dataKey="merchant"
            width={110}
            tick={{ fill: COLORS.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as {
                merchant: string;
                amount: number;
                count: number;
              };
              return (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm shadow-sm">
                  <p className="font-medium">{row.merchant}</p>
                  <p className="tabular-nums text-[var(--muted)]">
                    {formatCurrency(row.amount)} · {row.count} tx
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="amount" name="Spend" radius={[0, 4, 4, 0]} maxBarSize={22}>
            {chartData.map((entry) => (
              <Cell key={entry.merchant} fill={COLORS.pace} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CashFlowSankey({
  nodes,
  links,
}: {
  nodes: Array<{ name: string }>;
  links: Array<{ source: number; target: number; value: number }>;
}) {
  const { formatCurrency } = useMoneyFormat();

  if (nodes.length < 2 || links.length === 0) {
    return (
      <p className="flex h-80 items-center justify-center text-sm text-[var(--muted)]">
        Not enough income and spend data for a cash-flow diagram.
      </p>
    );
  }

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <Sankey
          data={{ nodes, links }}
          nodePadding={28}
          nodeWidth={12}
          margin={{ top: 12, right: 160, bottom: 12, left: 16 }}
          link={{ stroke: COLORS.sankeyLink, strokeOpacity: 0.35 }}
          node={(props) => {
            const { x, y, width, height, payload, index } = props;
            const name =
              (payload as { name?: string })?.name ?? nodes[index]?.name ?? "";
            return (
              <g>
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  fill={COLORS.sankeyNode}
                  rx={2}
                />
                <text
                  x={x + width + 8}
                  y={y + height / 2}
                  dy="0.35em"
                  fill={COLORS.muted}
                  fontSize={11}
                >
                  {name}
                </text>
              </g>
            );
          }}
        >
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const raw = payload[0].payload as {
                name?: string;
                value?: number;
                source?: { name?: string };
                target?: { name?: string };
              };
              const label =
                raw.name ??
                (raw.source?.name && raw.target?.name
                  ? `${raw.source.name} → ${raw.target.name}`
                  : "Flow");
              const value = raw.value ?? (payload[0].value as number | undefined);
              return (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm shadow-sm">
                  <p className="font-medium">{label}</p>
                  {value != null ? (
                    <p className="tabular-nums text-[var(--muted)]">
                      {formatCurrency(value)}
                    </p>
                  ) : null}
                </div>
              );
            }}
          />
        </Sankey>
      </ResponsiveContainer>
    </div>
  );
}

export function AgeOfMoneyChart({
  series,
}: {
  series: Array<{ date: string; ageDays: number }>;
}) {
  if (series.length < 2) {
    return (
      <p className="flex h-56 items-center justify-center text-sm text-[var(--muted)]">
        Need more income and spend history to chart Age of Money.
      </p>
    );
  }

  const data = series.map((p) => ({
    ...p,
    label: p.date.slice(5),
  }));

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="ageFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.income} stopOpacity={0.28} />
              <stop offset="100%" stopColor={COLORS.income} stopOpacity={0.02} />
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
            width={36}
            unit="d"
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as { date: string; ageDays: number };
              return (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm shadow-sm">
                  <p className="font-medium">{row.date}</p>
                  <p className="tabular-nums text-[var(--muted)]">
                    {row.ageDays.toFixed(1)} days
                  </p>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="ageDays"
            name="Age of money"
            stroke={COLORS.income}
            fill="url(#ageFill)"
            strokeWidth={2}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export { STACK_COLORS };
