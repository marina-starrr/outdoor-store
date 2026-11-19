import type { NextRequest } from "next/server";
import { readLocalPhoto } from "../../../lib/server/photo-storage";

/** Фото з локальної теки uploads — лише в розробці й тестах (на сайті фото віддає Supabase) */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/uploads/[name]">) {
  const { name } = await ctx.params;
  const photo = await readLocalPhoto(name);
  if (!photo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(photo.bytes), {
    headers: { "Content-Type": photo.type, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
