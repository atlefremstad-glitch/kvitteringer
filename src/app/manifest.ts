import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ReceiptMe",
    short_name: "ReceiptMe",
    description: "Skann og hold oversikt over kvitteringer",
    lang: "nb",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f7f5",
    theme_color: "#056b5a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
