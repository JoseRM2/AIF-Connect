import type { SaldoVacaciones } from "@/types/solicitudes";

interface BalanceCardProps {
  label: string;
  value: number;
  caption: string;
}

function BalanceCard({ label, value, caption }: BalanceCardProps) {
  return (
    <div className="flex flex-col justify-center rounded-md bg-brand-surface p-6 shadow-sm">
      <span className="mb-2 text-[10px] font-bold uppercase tracking-widest text-brand-gold">
        {label}
      </span>
      <div className="flex items-baseline gap-3">
        <span className="font-serif text-4xl font-black text-gray-900">
          {value}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
          {caption}
        </span>
      </div>
    </div>
  );
}

export default function BalanceCards({ saldo }: { saldo: SaldoVacaciones }) {
  return (
    <section
      aria-label="Saldo de vacaciones"
      className="mb-8 grid grid-cols-2 gap-6"
    >
      <BalanceCard
        label="PERIODOS VACACIONALES"
        value={saldo.periodos_activos}
        caption="PERIODOS ACTIVOS"
      />
      <BalanceCard
        label="PARTE PROPORCIONAL"
        value={saldo.dias_proporcionales}
        caption="DÍAS AÑO EN CURSO"
      />
    </section>
  );
}
