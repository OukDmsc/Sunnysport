import { createElement } from "react";
import { ImageResponse } from "next/og";

export function GET() {
  return new ImageResponse(
    createElement("div", { style: { background: "#0a3d2b", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" } },
      createElement("div", { style: { width: "70%", height: "70%", border: "5px solid #f2c45e", borderRadius: 24, display: "flex", alignItems: "center", justifyContent: "center", color: "#e8f4ed", fontSize: 100, fontWeight: 700 } }, "S")),
    { width: 180, height: 180 },
  );
}
