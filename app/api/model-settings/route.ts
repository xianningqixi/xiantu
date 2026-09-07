import { handleModelSettings } from "@/lib/server/model-settings";
export async function POST(request: Request) {
  return handleModelSettings(request);
}
