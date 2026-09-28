import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";
import path from "node:path";

const FORM_PATH = path.join(process.cwd(), "public", "forms", "cf888-template.pdf");

type FormData = { name: string; birthdate: string; address1: string; address2?: string; address3?: string; organization: string; representative: string; organizationAddress: string; phone: string; month: string; hours: number; ongoing: boolean };

function displayDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : value;
}

export async function POST(request: Request) {
  const values = await request.json() as Partial<FormData>;
  if (!values.name || !values.birthdate || !values.address1 || !values.organization || !values.representative || !values.month || typeof values.hours !== "number") return Response.json({ error: "Missing required fields" }, { status: 400 });
  const source = await readFile(FORM_PATH);
  const pdf = await PDFDocument.load(source);
  const form = pdf.getForm();
  const text: Record<string, string> = {
    "CF 888_Text Field 0": values.name,
    "CF 888_Text Field 1": displayDate(values.birthdate),
    "CF 888_Text Field 2": values.address1,
    "CF 888_Text Field 3": values.address2 ?? "",
    "CF 888_Text Field 4": values.address3 ?? "",
    "CF 888_Text Field 5": values.organization,
    "CF 888_Text Field 6": values.representative,
    "CF 888_Text Field 7": values.organizationAddress ?? "",
    "CF 888_Text Field 10": values.phone ?? "",
    "CF 888_Text Field 11": values.month,
    "CF 888_Text Field 12": String(values.hours),
  };
  for (const [name, value] of Object.entries(text)) form.getTextField(name).setText(value);
  form.getCheckBox(values.ongoing ? "CF 888_Check Box 13" : "CF 888_Check Box 14").check();
  form.updateFieldAppearances();
  const bytes = await pdf.save();
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Response(body, { headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="CF-888-volunteer-hours-filled.pdf"' } });
}
