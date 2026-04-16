import { Wifi, Loader2, Check } from "lucide-react";

type StepStatus = "pending" | "loading" | "done";

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "loading") return <Loader2 className="h-4 w-4 text-red-600 animate-spin" />;
  if (status === "done") return <Check className="h-4 w-4 text-red-600" />;
  return <span className="h-3.5 w-3.5 rounded-full border border-red-600/25" />;
}

export function ConnectDatacenterOverlay({
  open,
  hubName,
  stepIndex, // 1..3 (0 = none)
}: {
  open: boolean;
  hubName: string;
  stepIndex: 0 | 1 | 2 | 3;
}) {
  if (!open) return null;

  const steps = ["Authentification du hub", "Chiffrement de la liaison", "Synchronisation des capteurs"];
  const getStatus = (i: number): StepStatus => {
    const s = i + 1;
    if (stepIndex > s) return "done";
    if (stepIndex === s) return "loading";
    return "pending";
  };

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* background blur */}
      <div className="absolute inset-0 bg-background/70 backdrop-blur-md" />

      {/* center card */}
      <div className="relative h-full w-full flex items-center justify-center p-4">
        <div className="w-full max-w-[560px] rounded-2xl border bg-card/90 shadow-xl px-10 py-12 text-center">
          {/* rings + icon */}
          <div className="relative mx-auto mb-6 h-[120px] w-[120px]">
            <span className="absolute inset-0 rounded-full border-2 border-red-600/20 animate-ping" />
            <span
              className="absolute inset-[-14px] rounded-full border-2 border-red-600/15 animate-ping"
              style={{ animationDelay: "450ms" }}
            />
            <span
              className="absolute inset-[-28px] rounded-full border-2 border-red-600/10 animate-ping"
              style={{ animationDelay: "900ms" }}
            />
            <div className="absolute inset-[22px] rounded-full bg-red-600 flex items-center justify-center shadow-md">
              <Wifi className="h-7 w-7 text-white" />
            </div>
          </div>

          <p className="text-[12px] font-semibold tracking-[0.25em] text-red-600 uppercase">
            Connexion en cours
          </p>
          <h2 className="mt-2 text-3xl font-bold">{hubName}</h2>
          <p className="mt-2 text-sm text-muted-foreground">Établissement du tunnel sécurisé…</p>

          <div className="mt-8 mx-auto max-w-[340px] space-y-3 text-left">
            {steps.map((label, i) => (
              <div key={label} className="flex items-center gap-3 text-sm text-muted-foreground">
                <StepIcon status={getStatus(i)} />
                <span className={getStatus(i) === "loading" ? "text-foreground" : ""}>{label}</span>
              </div>
            ))}
          </div>

          <div className="mt-8 h-px w-full bg-red-600/10" />
        </div>
      </div>
    </div>
  );
}