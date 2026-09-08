import { netlifyHandler } from "@/lib/api/netlify-adapter";
import { handler } from "./impl";

export const GET = netlifyHandler(handler);
export const POST = netlifyHandler(handler);
