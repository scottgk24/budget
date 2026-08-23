"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMoneyFormat } from "@/components/privacy-context";

export type MetricsPoint = {
  key: string;
  label: string;
  spend: number;
  fixedSpend?: number;
  discretionarySpend?: number;
  reserveSpend?: number;
  income: number;
  savings: number;
  balance?: number;
};

type ChartProps = {
  data: MetricsPoint[];
  onSelectPeriod?: (point: MetricsPoint) => void;
  selectedKey?: string | null;
  incomeLabel?: string;
  spendLabel?: string;
  savingsLabel?: string;
  emptyLabel?: string;
  /** When true, stack fixed + discretionary spend instead of a single spend series. */
  splitSpend?: boolean;
};

const COLORS = {
  spend: "#7a9a6a",
  fixed: "#5c6b46",
  discretionary: "#6eb5a8",
  reserve: "#d4a857",
  income: "#7ec07a",
  savingsPos: "#7ec07a",
  savingsNeg: "#d4655a",
  balance: "#d4a857",
  grid: "#2f5a3c",
  muted: "#8fb396",
  surface: "#1c3828",
  selected: "#2c5f2b",
};

/** Thin vertical guide instead of Recharts' default full-height hover rectangle. */
const AREA_CURSOR = {
  stroke: COLORS.muted,
  strokeWidth: 1,
  strokeDasharray: "3 3",
  strokeOpacity: 0.55,
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
  const { formatCurrency } = useMoneyFormat();
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

function handleChartClick(
  state: {
    activeIndex?: number | string | null | undefined;
    activeLabel?: string | number | undefined;
  },
  data: MetricsPoint[],
  onSelectPeriod?: (point: MetricsPoint) => void,
) {
  if (!onSelectPeriod) return;
  const raw = state.activeIndex;
  const index =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && /^\d+$/.test(raw)
        ? Number(raw)
        : -1;
  if (index >= 0 && data[index]) {
    onSelectPeriod(data[index]);
    return;
  }
  if (state.activeLabel != null) {
    const byLabel = data.find((d) => d.label === String(state.activeLabel));
    if (byLabel) onSelectPeriod(byLabel);
  }
}

export function SpendIncomeChart({
  data,
  onSelectPeriod,
  selectedKey,
  incomeLabel = "Income",
  spendLabel = "Spend",
  splitSpend = false,
}: ChartProps) {
  const { formatCompactCurrency } = useMoneyFormat();
  const hasData = data.some((d) => d.spend > 0 || d.income > 0);
  const useSplit =
    splitSpend &&
    data.some(
      (d) =>
        (d.fixedSpend ?? 0) > 0 ||
        (d.discretionarySpend ?? 0) > 0 ||
        (d.reserveSpend ?? 0) > 0,
    );

  if (!hasData) {
    return (
      <p className="flex h-64 items-center justify-center text-sm text-[var(--muted)]">
        No activity in this period yet.
      </p>
    );
  }

  const lastKey = data[data.length - 1]?.key;
  function barOpacity(key: string) {
    if (key === selectedKey) return 1;
    if (key === lastKey) return 0.55;
    return 1;
  }

  return (
    <div>
      <div className={`h-72 w-full ${onSelectPeriod ? "cursor-pointer" : ""}`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            onClick={(state) => handleChartClick(state, data, onSelectPeriod)}
          >
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
          <Tooltip content={<ChartTooltip />} cursor={AREA_CURSOR} />
          <Legend
            wrapperStyle={{ fontSize: 12, color: COLORS.muted, paddingTop: 8 }}
          />
          {useSplit ? (
            <>
              <Bar
                dataKey="fixedSpend"
                name="Committed"
                stackId="spend"
                maxBarSize={36}
                fill={COLORS.fixed}
              >
                {data.map((entry) => (
                  <Cell
                    key={`fixed-${entry.key}`}
                    fill={COLORS.fixed}
                    fillOpacity={barOpacity(entry.key)}
                    stroke={entry.key === selectedKey ? "#e8f0e4" : undefined}
                    strokeWidth={entry.key === selectedKey ? 1.5 : 0}
                    cursor="pointer"
                  />
                ))}
              </Bar>
              <Bar
                dataKey="reserveSpend"
                name="Reserves"
                stackId="spend"
                maxBarSize={36}
                fill={COLORS.reserve}
              >
                {data.map((entry) => (
                  <Cell
                    key={`reserve-${entry.key}`}
                    fill={COLORS.reserve}
                    fillOpacity={barOpacity(entry.key)}
                    stroke={entry.key === selectedKey ? "#e8f0e4" : undefined}
                    strokeWidth={entry.key === selectedKey ? 1.5 : 0}
                    cursor="pointer"
                  />
                ))}
              </Bar>
              <Bar
                dataKey="discretionarySpend"
                name="Flexible"
                stackId="spend"
                maxBarSize={36}
                fill={COLORS.discretionary}
                radius={[4, 4, 0, 0]}
              >
                {data.map((entry) => (
                  <Cell
                    key={`flex-${entry.key}`}
                    fill={COLORS.discretionary}
                    fillOpacity={barOpacity(entry.key)}
                    stroke={entry.key === selectedKey ? "#e8f0e4" : undefined}
                    strokeWidth={entry.key === selectedKey ? 1.5 : 0}
                    cursor="pointer"
                  />
                ))}
              </Bar>
            </>
          ) : (
            <Bar
              dataKey="spend"
              name={spendLabel}
              maxBarSize={36}
              fill={COLORS.spend}
              radius={[4, 4, 0, 0]}
            >
              {data.map((entry) => (
                <Cell
                  key={`spend-${entry.key}`}
                  fill={COLORS.spend}
                  fillOpacity={barOpacity(entry.key)}
                  stroke={entry.key === selectedKey ? "#e8f0e4" : undefined}
                  strokeWidth={entry.key === selectedKey ? 1.5 : 0}
                  cursor="pointer"
                />
              ))}
            </Bar>
          )}
          <Line
            type="monotone"
            dataKey="income"
            name={incomeLabel}
            stroke={COLORS.income}
            strokeWidth={2}
            dot={{ r: 3, fill: COLORS.income, strokeWidth: 0 }}
            activeDot={{ r: 5, strokeWidth: 0 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      </div>
      <p className="text-center text-[11px] text-[var(--muted)]">
        Faded bar is the current period (in progress).
      </p>
    </div>
  );
}

export function SavingsChart({
  data,
  onSelectPeriod,
  selectedKey,
  savingsLabel = "Savings",
  emptyLabel = "No savings data in this period yet.",
}: ChartProps) {
  const { formatCompactCurrency } = useMoneyFormat();
  const hasData = data.some((d) => d.spend > 0 || d.income > 0);

  if (!hasData) {
    return (
      <p className="flex h-64 items-center justify-center text-sm text-[var(--muted)]">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className={`h-72 w-full ${onSelectPeriod ? "cursor-pointer" : ""}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          onClick={(state) => handleChartClick(state, data, onSelectPeriod)}
        >
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
          <Tooltip content={<ChartTooltip />} cursor={false} />
          <Bar
            dataKey="savings"
            name={savingsLabel}
            radius={[4, 4, 0, 0]}
            maxBarSize={36}
            activeBar={{ stroke: "#e8f0e4", strokeWidth: 1.5, opacity: 1 }}
          >
            {data.map((entry) => (
              <Cell
                key={entry.key}
                fill={
                  entry.key === selectedKey
                    ? COLORS.selected
                    : entry.savings >= 0
                      ? COLORS.savingsPos
                      : COLORS.savingsNeg
                }
                cursor="pointer"
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BalanceChart({ data, onSelectPeriod, selectedKey }: ChartProps) {
  const { formatCompactCurrency } = useMoneyFormat();
  const series = data.map((d) => ({ ...d, balance: d.balance ?? 0 }));
  const hasData = series.some((d) => d.balance !== 0 || d.spend > 0 || d.income > 0);

  if (!hasData) {
    return (
      <p className="flex h-64 items-center justify-center text-sm text-[var(--muted)]">
        No balance history in this period yet.
      </p>
    );
  }

  return (
    <div className={`h-72 w-full ${onSelectPeriod ? "cursor-pointer" : ""}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={series}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          onClick={(state) => handleChartClick(state, series, onSelectPeriod)}
        >
          <defs>
            <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.balance} stopOpacity={0.3} />
              <stop offset="100%" stopColor={COLORS.balance} stopOpacity={0.02} />
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
            width={52}
            domain={["auto", "auto"]}
          />
          <Tooltip content={<ChartTooltip />} cursor={AREA_CURSOR} />
          <Area
            type="monotone"
            dataKey="balance"
            name="Balance"
            stroke={selectedKey ? COLORS.selected : COLORS.balance}
            fill="url(#balanceFill)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
