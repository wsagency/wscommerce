import type { APIRoute } from "astro";
import { forwardWooHttp } from "../../lib/woo-http.js";
export const prerender = false;
export const ALL: APIRoute = forwardWooHttp;
