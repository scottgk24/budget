"use client";

import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
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
import type { CategoryMonthSeries } from "@/lib/category-month-series";
import type { SpendPacePoint } from "@/lib/report-types";
import { format, parseISO } from "date-fns";

export type { SpendPacePoint };

const COLORS = {
  spend: "#d4655a",
  income: "#7ec07a",
  ideal: "#8fb396",
  pace: "#d4a857",
  grid: "#2f5a3c",
  muted: "#8fb396",
  sankeyNode: "#2c5f2b",
  sankeySavings: "#d4a857",
  sankeyFixed: "#5c6b46",
  sankeyDiscretionary: "#6eb5a8",
  sankeyReserve: "#d4a857",
  sankeyLinkReserve: "#d4a857",
  sankeyLink: "#5c6b46",
  sankeyLinkSavings: "#d4a857",
  sankeyLinkDiscretionary: "#6eb5a8",
  fixed: "#5c6b46",
  discretionary: "#6eb5a8",
};

/** Thin vertical guide instead of Recharts' default full-height hover rectangle. */
const LINE_CURSOR = {
  stroke: COLORS.muted,
  strokeWidth: 1,
  strokeDasharray: "3 3",
  strokeOpacity: 0.55,
};

const SAVINGS_NODE_NAMES = new Set(["Savings", "Profit"]);
const FLEX_NODE_NAMES = new Set(["Committed", "Flexible", "Reserves", "Fixed", "Discretionary"]);

function sankeyNodeFill(name: string): string {
  if (SAVINGS_NODE_NAMES.has(name)) return COLORS.sankeySavings;
  if (name === "Committed" || name === "Fixed") return COLORS.sankeyFixed;
  if (name === "Flexible" || name === "Discretionary") return COLORS.sankeyDiscretionary;
  if (name === "Reserves") return COLORS.sankeyReserve;
  return COLORS.sankeyNode;
}

function sankeyLinkStroke(sourceName: string | undefined): {
  stroke: string;
  opacity: number;
} {
  if (sourceName && SAVINGS_NODE_NAMES.has(sourceName)) {
    return { stroke: COLORS.sankeyLinkSavings, opacity: 0.45 };
  }
  if (sourceName === "Flexible" || sourceName === "Discretionary") {
    return { stroke: COLORS.sankeyLinkDiscretionary, opacity: 0.4 };
  }
  if (sourceName === "Reserves") {
    return { stroke: COLORS.sankeyLinkReserve, opacity: 0.4 };
  }
  return { stroke: COLORS.sankeyLink, opacity: 0.35 };
}


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

const AVG_LINE = {
  stroke: COLORS.spend,
  strokeDasharray: "6 4",
  strokeWidth: 2,
} as const;

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Mean of monthly totals over the chart’s time period (0 if empty). */
function averageMonthlyTotal(
  rows: Array<Record<string, string | number>>,
  valueKeys: string[],
): number {
  if (rows.length === 0 || valueKeys.length === 0) return 0;
  const sum = rows.reduce((acc, row) => {
    let monthTotal = 0;
    for (const key of valueKeys) {
      const v = row[key];
      if (typeof v === "number") monthTotal += v;
    }
    return acc + monthTotal;
  }, 0);
  return round2(sum / rows.length);
}

function withAverageLine<T extends Record<string, string | number>>(
  rows: T[],
  average: number,
): Array<T & { average: number }> {
  return rows.map((row) => ({ ...row, average }));
}

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
          <Tooltip content={<MoneyTooltip />} cursor={LINE_CURSOR} />
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
            activeDot={false}
          />
          <Line
            type="monotone"
            dataKey="actual"
            name="Actual spend"
            stroke={COLORS.pace}
            strokeWidth={2.5}
            dot={false}
            connectNulls
            activeDot={{ r: 5, strokeWidth: 0 }}
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
  onSelect,
}: {
  data: Array<Record<string, string | number>>;
  keys: string[];
  onSelect?: (selection: { monthKey: string; categoryName: string; label: string }) => void;
}) {
  const { formatCompactCurrency } = useMoneyFormat();
  const hasData = data.some((row) =>
    keys.some((k) => typeof row[k] === "number" && (row[k] as number) > 0),
  );
  const average = averageMonthlyTotal(data, keys);
  const chartData = withAverageLine(data, average);

  if (!hasData || keys.length === 0) {
    return (
      <p className="flex h-72 items-center justify-center text-sm text-[var(--muted)]">
        No category spending in this range.
      </p>
    );
  }

  return (
    <div className={`h-80 w-full ${onSelect ? "cursor-pointer" : ""}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
          <Tooltip content={<MoneyTooltip />} cursor={false} />
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
              activeBar={{ stroke: "#e8f0e4", strokeWidth: 1, opacity: 1 }}
              cursor={onSelect ? "pointer" : undefined}
              onClick={(entry) => {
                if (!onSelect) return;
                const row = (entry as { payload?: Record<string, string | number> })
                  .payload;
                const month = typeof row?.key === "string" ? row.key : null;
                const label =
                  typeof row?.label === "string" ? row.label : key;
                if (!month) return;
                onSelect({ monthKey: month, categoryName: key, label });
              }}
            >
              {data.map((row, idx) => (
                <Cell
                  key={`${key}-${typeof row.key === "string" ? row.key : idx}`}
                  fillOpacity={
                    idx === data.length - 1 &&
                    typeof row.key === "string" &&
                    row.key === format(new Date(), "yyyy-MM")
                      ? 0.55
                      : 1
                  }
                />
              ))}
            </Bar>
          ))}
          {average > 0 ? (
            <Line
              type="monotone"
              dataKey="average"
              name="Average"
              stroke={AVG_LINE.stroke}
              strokeDasharray={AVG_LINE.strokeDasharray}
              strokeWidth={AVG_LINE.strokeWidth}
              dot={false}
              activeDot={false}
              legendType="plainline"
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategorySpendVsBudgetChart({
  series,
  onSelect,
}: {
  series: CategoryMonthSeries;
  onSelect?: (sel: { month: string; categoryId: string; name: string }) => void;
}) {
  const { formatCompactCurrency } = useMoneyFormat();
  const base = series.points.map((p) => ({
    key: p.month,
    label: format(new Date(`${p.month}-01T12:00:00`), "MMM yy"),
    spent: p.spent,
    budget: p.budget,
  }));
  const average = averageMonthlyTotal(base, ["spent"]);
  const data = withAverageLine(base, average);
  const hasData = data.some((d) => d.spent !== 0 || d.budget !== 0);
  const currentMonth = format(new Date(), "yyyy-MM");

  if (!hasData) {
    return (
      <p className="flex h-64 items-center justify-center text-sm text-[var(--muted)]">
        No spend or budget for this category.
      </p>
    );
  }

  return (
    <div className={`h-72 w-full ${onSelect ? "cursor-pointer" : ""}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
          <Tooltip content={<MoneyTooltip />} cursor={false} />
          <Legend
            wrapperStyle={{ fontSize: 11, color: COLORS.muted, paddingTop: 8 }}
          />
          <Bar
            dataKey="spent"
            name="Spent"
            fill={COLORS.spend}
            maxBarSize={40}
            radius={[4, 4, 0, 0]}
            activeBar={{ stroke: "#e8f0e4", strokeWidth: 1, opacity: 1 }}
            cursor={onSelect ? "pointer" : undefined}
            onClick={(entry) => {
              if (!onSelect) return;
              const row = (
                entry as { payload?: { key?: string } }
              ).payload;
              if (!row?.key) return;
              onSelect({
                month: row.key,
                categoryId: series.categoryId,
                name: series.name,
              });
            }}
          >
            {data.map((row) => (
              <Cell
                key={`spent-${row.key}`}
                fillOpacity={row.key === currentMonth ? 0.55 : 1}
              />
            ))}
          </Bar>
          <Line
            type="monotone"
            dataKey="budget"
            name="Budget"
            stroke={COLORS.ideal}
            strokeDasharray="6 4"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
          {average > 0 ? (
            <Line
              type="monotone"
              dataKey="average"
              name="Average"
              stroke={AVG_LINE.stroke}
              strokeDasharray={AVG_LINE.strokeDasharray}
              strokeWidth={AVG_LINE.strokeWidth}
              dot={false}
              activeDot={false}
              legendType="plainline"
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

const HUB_NODE_NAMES = new Set(["Income", "Savings", "Profit"]);

export function CashFlowSankey({
  nodes,
  links,
  onSelectNode,
}: {
  nodes: Array<{ name: string }>;
  links: Array<{ source: number; target: number; value: number }>;
  onSelectNode?: (nodeName: string) => void;
}) {
  const { formatCurrency } = useMoneyFormat();

  if (nodes.length < 2 || links.length === 0) {
    return (
      <p className="flex h-80 items-center justify-center text-sm text-[var(--muted)]">
        Not enough income and spend data for a cash-flow diagram.
      </p>
    );
  }

  const hasFlexLayer = nodes.some((n) => FLEX_NODE_NAMES.has(n.name));

  return (
    <div className={`w-full ${hasFlexLayer ? "h-96" : "h-80"} ${onSelectNode ? "cursor-pointer" : ""}`}>
      <ResponsiveContainer width="100%" height="100%">
        <Sankey
          data={{ nodes, links }}
          nodePadding={hasFlexLayer ? 18 : 28}
          nodeWidth={12}
          margin={{ top: 12, right: 140, bottom: 12, left: 16 }}
          linkCurvature={0.5}
          link={(props) => {
            const {
              sourceX,
              targetX,
              sourceY,
              targetY,
              sourceControlX,
              targetControlX,
              linkWidth,
              payload,
              index,
            } = props;
            const sourceName =
              (payload as { source?: { name?: string } })?.source?.name ??
              nodes[links[index]?.source]?.name;
            const { stroke, opacity } = sankeyLinkStroke(sourceName);
            const d = `M${sourceX},${sourceY}C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`;
            return (
              <path
                d={d}
                fill="none"
                stroke={stroke}
                strokeOpacity={opacity}
                strokeWidth={linkWidth}
              />
            );
          }}
          node={(props) => {
            const { x, y, width, height, payload, index } = props;
            const name =
              (payload as { name?: string })?.name ?? nodes[index]?.name ?? "";
            const clickable =
              Boolean(onSelectNode) && name && !HUB_NODE_NAMES.has(name);
            return (
              <g
                style={{ cursor: clickable ? "pointer" : undefined }}
                onClick={
                  clickable
                    ? () => {
                        onSelectNode?.(name);
                      }
                    : undefined
                }
              >
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  fill={sankeyNodeFill(name)}
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

export function FlexibilityTrendsChart({
  data,
  onSelect,
}: {
  data: Array<{
    key: string;
    label: string;
    Committed?: number;
    Flexible?: number;
    Reserves?: number;
    Fixed?: number;
    Discretionary?: number;
  }>;
  onSelect?: (selection: {
    monthKey: string;
    label: string;
    flexibility: "fixed" | "discretionary" | "reserve";
  }) => void;
}) {
  const { formatCompactCurrency } = useMoneyFormat();
  const hasData = data.some(
    (d) =>
      (d.Committed ?? d.Fixed ?? 0) > 0 ||
      (d.Flexible ?? d.Discretionary ?? 0) > 0 ||
      (d.Reserves ?? 0) > 0,
  );
  const average = averageMonthlyTotal(data, ["Committed", "Flexible", "Reserves"]);
  const chartData = withAverageLine(data, average);

  if (!hasData) {
    return (
      <p className="flex h-72 items-center justify-center text-sm text-[var(--muted)]">
        No spending in this range.
      </p>
    );
  }

  return (
    <div className={`h-72 w-full ${onSelect ? "cursor-pointer" : ""}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
          <Tooltip content={<MoneyTooltip />} cursor={false} />
          <Legend
            wrapperStyle={{ fontSize: 11, color: COLORS.muted, paddingTop: 8 }}
          />
          <Bar
            dataKey="Committed"
            name="Committed"
            stackId="flex"
            fill={COLORS.fixed}
            maxBarSize={40}
            activeBar={{ stroke: "#e8f0e4", strokeWidth: 1, opacity: 1 }}
            cursor={onSelect ? "pointer" : undefined}
            onClick={(entry) => {
              if (!onSelect) return;
              const row = (
                entry as { payload?: { key: string; label: string } }
              ).payload;
              if (row?.key) {
                onSelect({
                  monthKey: row.key,
                  label: row.label,
                  flexibility: "fixed",
                });
              }
            }}
          >
            {data.map((row) => (
              <Cell
                key={`committed-${row.key}`}
                fillOpacity={
                  row.key === data[data.length - 1]?.key &&
                  row.key === format(new Date(), "yyyy-MM")
                    ? 0.55
                    : 1
                }
              />
            ))}
          </Bar>
          <Bar
            dataKey="Reserves"
            name="Reserves"
            stackId="flex"
            fill={COLORS.pace}
            maxBarSize={40}
            activeBar={{ stroke: "#e8f0e4", strokeWidth: 1, opacity: 1 }}
            cursor={onSelect ? "pointer" : undefined}
            onClick={(entry) => {
              if (!onSelect) return;
              const row = (
                entry as { payload?: { key: string; label: string } }
              ).payload;
              if (row?.key) {
                onSelect({
                  monthKey: row.key,
                  label: row.label,
                  flexibility: "reserve",
                });
              }
            }}
          >
            {data.map((row) => (
              <Cell
                key={`reserves-${row.key}`}
                fillOpacity={
                  row.key === data[data.length - 1]?.key &&
                  row.key === format(new Date(), "yyyy-MM")
                    ? 0.55
                    : 1
                }
              />
            ))}
          </Bar>
          <Bar
            dataKey="Flexible"
            name="Flexible"
            stackId="flex"
            fill={COLORS.discretionary}
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
            activeBar={{ stroke: "#e8f0e4", strokeWidth: 1, opacity: 1 }}
            cursor={onSelect ? "pointer" : undefined}
            onClick={(entry) => {
              if (!onSelect) return;
              const row = (
                entry as { payload?: { key: string; label: string } }
              ).payload;
              if (row?.key) {
                onSelect({
                  monthKey: row.key,
                  label: row.label,
                  flexibility: "discretionary",
                });
              }
            }}
          >
            {data.map((row) => (
              <Cell
                key={`flexible-${row.key}`}
                fillOpacity={
                  row.key === data[data.length - 1]?.key &&
                  row.key === format(new Date(), "yyyy-MM")
                    ? 0.55
                    : 1
                }
              />
            ))}
          </Bar>
          {average > 0 ? (
            <Line
              type="monotone"
              dataKey="average"
              name="Average"
              stroke={AVG_LINE.stroke}
              strokeDasharray={AVG_LINE.strokeDasharray}
              strokeWidth={AVG_LINE.strokeWidth}
              dot={false}
              activeDot={false}
              legendType="plainline"
            />
          ) : null}
        </ComposedChart>
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
    label: format(parseISO(p.date), "MMM d"),
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
            cursor={LINE_CURSOR}
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
            activeDot={{ r: 5, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function NetWorthTrendChart({
  data,
}: {
  data: Array<{ date: string; label: string; net: number; assets: number; liabilities: number }>;
}) {
  const { formatCompactCurrency, formatCurrency } = useMoneyFormat();
  if (data.length < 2) {
    return (
      <p className="flex h-64 items-center justify-center text-sm text-[var(--muted)]">
        History starts after the first snapshot. Check back tomorrow, or sync accounts.
      </p>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
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
            tickFormatter={formatCompactCurrency}
            width={52}
          />
          <Tooltip
            cursor={LINE_CURSOR}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as {
                label: string;
                net: number;
                assets: number;
                liabilities: number;
              };
              return (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm shadow-sm">
                  <p className="mb-1 font-medium">{row.label}</p>
                  <p className="tabular-nums">Net {formatCurrency(row.net)}</p>
                  <p className="tabular-nums text-[var(--muted)]">
                    Assets {formatCurrency(row.assets)}
                  </p>
                  <p className="tabular-nums text-[var(--muted)]">
                    Debts {formatCurrency(row.liabilities)}
                  </p>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="net"
            name="Net worth"
            stroke={COLORS.income}
            fill="url(#netWorthFill)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export { STACK_COLORS };
