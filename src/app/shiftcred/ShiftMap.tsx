import type { Shift } from "@/lib/shiftcred/types";

export function ShiftMap({ shifts, selectedId, onSelect }: { shifts: readonly Shift[]; selectedId?: string; onSelect: (shift: Shift) => void }) {
  const positions = [[31, 30], [61, 48], [76, 77]] as const;
  return (
    <div role="group" className="relative h-52 overflow-hidden rounded-2xl border border-border/40 bg-[#e7efe9] text-[#173c2d]" aria-label="Map of sample volunteer shifts">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <path d="M-5 20C18 29 27 17 45 26s30 4 62 15M-8 67c23-8 34-2 49 5s34 4 66-4" fill="none" stroke="#fff" strokeWidth="5"/>
        <path d="M18-5c8 22 3 37 15 51s13 31 10 59M72-5c-8 21-2 37-8 51s-2 35 8 59" fill="none" stroke="#fff" strokeWidth="3"/>
        <path d="M-5 20C18 29 27 17 45 26s30 4 62 15M-8 67c23-8 34-2 49 5s34 4 66-4M18-5c8 22 3 37 15 51s13 31 10 59M72-5c-8 21-2 37-8 51s-2 35 8 59" fill="none" stroke="#b9c9bd" strokeWidth=".7"/>
        <path d="M0 91c20-12 28-21 39-38S65 23 100 11" fill="none" stroke="#aacbd7" strokeWidth="5"/>
        <text x="5" y="10" fontSize="4" fill="#557065">MOUNTAIN VIEW</text><text x="77" y="94" fontSize="4" fill="#557065">SAN JOSE</text>
      </svg>
      {shifts.map((shift, index) => {
        const [left, top] = positions[index % positions.length];
        const selected = shift.id === selectedId;
        return <button key={shift.id} onClick={() => onSelect(shift)} aria-label={`${shift.role}, ${shift.kitchen}`} style={{ left: `${left}%`, top: `${top}%` }} className={`absolute -translate-x-1/2 -translate-y-full rounded-full border-[3px] border-white shadow-md transition-transform ${selected ? "size-12 scale-105 bg-signal text-white" : "size-11 bg-proof text-white"}`}><span className="text-xs font-black">{shift.hours}h</span><span className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-[6px] border-t-[8px] border-x-transparent border-t-current"/></button>;
      })}
      <div className="absolute bottom-2 left-2 rounded-lg bg-white/95 px-2 py-1.5 text-[11px] font-semibold shadow-sm">Sample map · illustrative locations</div>
    </div>
  );
}
