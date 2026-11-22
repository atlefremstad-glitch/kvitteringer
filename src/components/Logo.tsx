/* eslint-disable @next/next/no-img-element */

/** ReceiptMe-logo: ikonet og navnet, der «Me» får logoens grønne farge. */
export function Logo({ size = "sm" }: { size?: "sm" | "lg" }) {
  const big = size === "lg";
  return (
    <span className={`inline-flex items-center ${big ? "flex-col gap-3" : "gap-2"}`}>
      <img
        src="/brand/logo-mark.png"
        alt=""
        width={big ? 88 : 30}
        height={big ? 88 : 30}
        className={big ? "drop-shadow-lg" : "drop-shadow-sm"}
      />
      {/* På smal mobil vises bare ikonet i toppmenyen, så knappene får plass */}
      <span className={`font-bold tracking-tight ${big ? "text-3xl" : "hidden text-lg min-[420px]:inline"}`}>
        Receipt<span className="brand-text">Me</span>
      </span>
    </span>
  );
}
