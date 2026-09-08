import { netlifyHandler } from "@/lib/api/netlify-adapter";
import { handler } from "./impl";

export const POST = netlifyHandler(handler);
export const PUT = netlifyHandler(handler);
