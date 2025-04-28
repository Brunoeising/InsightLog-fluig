"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Dot } from "lucide-react";

interface InputOTPProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: string;
  maxLength?: number;
  onComplete?: (value: string) => void;
}

const InputOTP = React.forwardRef<HTMLInputElement, InputOTPProps>(
  ({ className, maxLength = 6, value, onComplete, ...props }, ref) => {
    const dots = Array.from({ length: maxLength }).map((_, i) => (
      <div
        key={i}
        className={cn(
          "w-4 h-4 rounded-full border-2",
          value[i] ? "border-primary bg-primary" : "border-muted"
        )}
      >
        {!value[i] && <Dot className="w-4 h-4 text-muted-foreground" />}
      </div>
    ));

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value.replace(/[^0-9]/g, "").slice(0, maxLength);
      if (props.onChange) {
        const event = {
          ...e,
          target: {
            ...e.target,
            value: newValue,
          },
        };
        props.onChange(event);
      }
      if (newValue.length === maxLength && onComplete) {
        onComplete(newValue);
      }
    };

    return (
      <div className="relative">
        <div className="flex gap-2 items-center justify-center mb-2">{dots}</div>
        <input
          ref={ref}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d*"
          maxLength={maxLength}
          className={cn(
            "absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer",
            className
          )}
          value={value}
          onChange={handleChange}
          {...props}
        />
      </div>
    );
  }
);

InputOTP.displayName = "InputOTP";

export { InputOTP };