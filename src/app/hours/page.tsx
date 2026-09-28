import type { Metadata } from "next";
import { HoursDashboard } from "./HoursDashboard";

export const metadata: Metadata = {
  title: "My 80 Hours | HourProof",
  description: "Track paid work, volunteering, school, and training for CalFresh.",
};

export default function HoursPage() {
  return <HoursDashboard />;
}

