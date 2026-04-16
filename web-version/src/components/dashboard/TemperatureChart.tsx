import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import { mockTemperatureHistory } from "@/lib/mock-data";

const chartConfig = {
  zoneA: { label: "Zone A", color: "hsl(var(--status-normal))" },
  zoneB: { label: "Zone B", color: "hsl(var(--status-warning))" },
  zoneC: { label: "Zone C", color: "hsl(210 70% 50%)" },
};

export function TemperatureChart() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Température (24h)</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[250px] w-full">
          <LineChart data={mockTemperatureHistory}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} className="text-muted-foreground" />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} domain={[16, 32]} className="text-muted-foreground" />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ReferenceLine y={27} stroke="hsl(var(--status-critical))" strokeDasharray="5 5" label={{ value: "Max", position: "right", fontSize: 10 }} />
            <Line type="monotone" dataKey="zoneA" stroke="var(--color-zoneA)" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="zoneB" stroke="var(--color-zoneB)" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="zoneC" stroke="var(--color-zoneC)" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
