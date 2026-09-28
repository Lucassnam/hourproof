import type { Metadata } from "next";
import { ProofPacket } from "./ProofPacket";

export const metadata: Metadata = {
  title: "My Documents | HourProof",
  description: "Upload and organize CalFresh work, volunteer, school, and training proof.",
};

export default function ProofPage() {
  return <ProofPacket />;
}
