import type { Metadata } from "next";
import { ShiftCred } from "./ShiftCred";

export const metadata: Metadata = {
  title: "ShiftCred | HourProof",
  description: "Find volunteer shifts and turn confirmed hours into proof for CalFresh.",
};

export default function ShiftCredPage() {
  return <ShiftCred />;
}

