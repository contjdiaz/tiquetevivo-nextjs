/**
 * Netlify scheduled function: triggers /api/cron-reactivation daily at 14:00 UTC.
 * Delegates to the Next.js route handler, which owns the reactivation logic.
 */
const handler = async () => {
  const baseUrl = process.env.URL || "https://tiquete.netlify.app";
  const secret = process.env.CRON_SECRET || "";
  try {
    const res = await fetch(`${baseUrl}/api/cron-reactivation`, {
      method: "POST",
      headers: { "x-cron-secret": secret, "Content-Type": "application/json" }
    });
    const body = await res.text();
    return {
      statusCode: res.status,
      body,
      headers: { "Content-Type": "application/json" }
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: err.message || "scheduled call failed" }),
      headers: { "Content-Type": "application/json" }
    };
  }
};

exports.handler = handler;