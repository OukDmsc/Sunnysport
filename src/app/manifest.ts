import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SUNNY SPORT CLUB Football Field Booking",
    short_name: "SUNNY SPORT CLUB",
    description: "Book football fields and manage reservations in Cambodia.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f8f5",
    theme_color: "#0a3d2b",
    orientation: "any",
    icons: [
      { src: "/sunny-sport-club-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/sunny-sport-club-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/sunny-sport-club-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
