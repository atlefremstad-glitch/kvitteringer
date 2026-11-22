"use client";

import { useRef, useState } from "react";

/** Søkefelt med X-knapp som tømmer feltet, så du kan skrive ditt eget søk. */
export function SearchInput({ defaultValue }: { defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="relative flex-1">
      <input
        ref={ref}
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="input pr-10"
        aria-label="Søk i Gmail"
        placeholder="Skriv hva du vil søke etter"
      />
      {value && (
        <button
          type="button"
          aria-label="Tøm søkefeltet"
          title="Tøm"
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-lg leading-none text-muted hover:bg-background hover:text-foreground"
          onClick={() => {
            setValue("");
            ref.current?.focus();
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
