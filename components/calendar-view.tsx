"use client";

import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DateRange } from "react-day-picker";

export function CalendarView() {
  const [range, setRange] = useState<DateRange | undefined>();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 pt-14">
      <Card>
        <CardHeader>
          <CardTitle>Calendar</CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Calendar
            mode="range"
            selected={range}
            onSelect={setRange}
            numberOfMonths={1}
          />
        </CardContent>
      </Card>
    </div>
  );
}
