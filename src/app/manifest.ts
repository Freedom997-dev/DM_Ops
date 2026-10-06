import type { MetadataRoute } from "next";

// Web app manifest: lets phones "Add to Home Screen" / "Install app" with the
// logo and open the portal full-screen (no browser bar). Icons come from
// scripts/generate-icons.mjs.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DMO · Divya Motel Operations",
    short_name: "DMO", // name under the home-screen icon
    description: "Operations portal for Divya Motel staff.",
    start_url: "/services",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#1d40f5",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
