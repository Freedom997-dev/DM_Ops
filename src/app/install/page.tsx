import type { Metadata } from "next";
import { InstallGuide } from "@/components/install/InstallGuide";

// Public page — the link to share with staff: <site>/install
export const metadata: Metadata = { title: "Install the app · Divya Motel" };

export default function InstallPage() {
  return <InstallGuide />;
}
