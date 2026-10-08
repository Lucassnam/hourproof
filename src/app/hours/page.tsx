import { permanentRedirect } from "next/navigation";

export default function HoursPage() {
  // Keep old bookmarks and shared links working while the app uses one hour tracker.
  permanentRedirect("/log");
}
