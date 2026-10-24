"use client";

import { useEffect, useState } from "react";

const DATE_FORMATTER = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const TIME_FORMATTER = new Intl.DateTimeFormat("es-MX", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

export default function DateTimeDisplay() {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    setNow(new Date());

    const intervalId = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  const fechaFormateada = DATE_FORMATTER.format(now);
  const horaFormateada = TIME_FORMATTER.format(now);

  return (
    <div className="flex min-h-[52px] flex-col items-end justify-end">
      <time
        dateTime={now.toISOString()}
        suppressHydrationWarning
        className="text-[10px] font-bold uppercase tracking-widest text-brand-gold"
      >
        {fechaFormateada}
      </time>
      <time
        dateTime={now.toISOString()}
        suppressHydrationWarning
        className="mt-1 font-serif text-4xl font-bold tabular-nums leading-none text-gray-900"
      >
        {horaFormateada}
      </time>
    </div>
  );
}
