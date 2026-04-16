import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getStatusBg, getStatusColor } from "@/lib/mock-data";
import { LucideIcon } from "lucide-react";

interface StatusCardProps {
  title: string;
  value: string | number;
  unit?: string;
  status: "normal" | "warning" | "critical";
  icon: LucideIcon;
  subtitle?: string;
}

export function StatusCard({ title, value, unit, status, icon: Icon, subtitle }: StatusCardProps) {
  return (
    <Card className={cn("border", getStatusBg(status))}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-1">
          <div className="space-y-0.5 min-w-0">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider truncate">{title}</p>
            <div className="flex items-baseline gap-1">
              <span className={cn("text-xl font-bold", getStatusColor(status))}>{value}</span>
              {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
            </div>
            {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
          </div>
          <div className={cn("h-7 w-7 rounded-md flex items-center justify-center shrink-0", getStatusBg(status))}>
            <Icon className={cn("h-4 w-4", getStatusColor(status))} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
