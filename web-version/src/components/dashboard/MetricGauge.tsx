import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { getStatusColor } from "@/lib/mock-data";

interface MetricGaugeProps {
  title: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  status: "normal" | "warning" | "critical";
}

export function MetricGauge({ title, value, min, max, unit, status }: MetricGaugeProps) {
  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  return (
    <Card>
      <CardHeader className="pb-2 p-4">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="flex items-baseline gap-1 mb-3">
          <span className={cn("text-3xl font-bold", getStatusColor(status))}>
            {typeof value === "number" ? value.toFixed(1) : value}
          </span>
          <span className="text-sm text-muted-foreground">{unit}</span>
        </div>
        <Progress value={percentage} className="h-2" />
        <div className="flex justify-between mt-1.5">
          <span className="text-[10px] text-muted-foreground">{min}{unit}</span>
          <span className="text-[10px] text-muted-foreground">{max}{unit}</span>
        </div>
      </CardContent>
    </Card>
  );
}
