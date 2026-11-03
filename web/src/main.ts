import { inject } from "@vercel/analytics";
import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";
import { analyticsOn, beforeSend } from "./lib/analytics";

mount(App, { target: document.getElementById("app")! });

// Page views with Vercel Web Analytics: on the public site only, without the hash or query string (lib/analytics.ts).
// "production" loads Vercel's script from this site (/_vercel/insights/script.js), never the debug script from another host.
if (analyticsOn(location.hostname)) inject({ mode: "production", beforeSend });
