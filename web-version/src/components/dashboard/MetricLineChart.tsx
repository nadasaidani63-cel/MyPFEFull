import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type MetricLineChartProps = {
  title: string;
  unit: string;
  data: Array<{ time: string; value: number }>;
  color?: string;
  warningMin?: number;
  warningMax?: number;
  alertMin?: number;
  alertMax?: number;
};

export function MetricLineChart({
  title,
  unit,
  data,
  color = "hsl(var(--primary))",
  warningMin,
  warningMax,
  alertMin,
  alertMax,
}: MetricLineChartProps) {
  const gradId = `grad-${title.replace(/\s+/g, "-")}`;
  const tickCount = Math.min(5, Math.max(2, data.length));

  return (
    <Card className="flex h-[260px] min-w-0 w-full flex-col overflow-hidden">
      <CardHeader className="shrink-0 px-4 pb-2 pt-4">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-w-0 px-4 pb-4 pt-0">
        <div className="h-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 10, left: 0, bottom: 2 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.14} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              width={38}
              tickCount={tickCount}
            />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
              formatter={(value: number) => [`${value.toFixed(2)} ${unit}`, title]}
            />
            {warningMin !== undefined && <ReferenceLine y={warningMin} stroke="hsl(var(--status-warning))" strokeDasharray="4 4" ifOverflow="extendDomain" />}
            {warningMax !== undefined && <ReferenceLine y={warningMax} stroke="hsl(var(--status-warning))" strokeDasharray="4 4" ifOverflow="extendDomain" />}
            {alertMin !== undefined && <ReferenceLine y={alertMin} stroke="hsl(var(--status-critical))" strokeDasharray="6 4" ifOverflow="extendDomain" />}
            {alertMax !== undefined && <ReferenceLine y={alertMax} stroke="hsl(var(--status-critical))" strokeDasharray="6 4" ifOverflow="extendDomain" />}
            <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${gradId})`} dot={false} isAnimationActive={false} />
          </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
