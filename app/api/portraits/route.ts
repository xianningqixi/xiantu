import { handlePortrait } from "@/lib/server/portraits";
export async function POST(request: Request) {
  return handlePortrait(request);
}
