const MODEL = "Qwen/Qwen2.5-7B-Instruct-1M";

export default async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }
  const token = process.env.HF_TOKEN;
  if (!token) {
    return new Response(JSON.stringify({ error: "AI judge is not configured. Set HF_TOKEN in Netlify environment variables." }), { status: 503, headers: { "Content-Type": "application/json" } });
  }
  try {
    const body = await request.json();
    const titleA = String(body.titleA || "").trim().slice(0, 240);
    const titleB = String(body.titleB || "").trim().slice(0, 240);
    if (!titleA || !titleB) {
      return new Response(JSON.stringify({ error: "Both project titles are required." }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 180,
        messages: [
          { role: "system", content: "You are an academic project-overlap reviewer. Compare two proposed project titles for substantive research similarity, not merely shared generic words. Consider research question, target population, methods, and intended outcome. Return only valid JSON with keys score (integer 0-100), verdict (one of low, moderate, high), and reason (one concise sentence). This is a screening opinion, not a plagiarism finding." },
          { role: "user", content: JSON.stringify({ project_A: titleA, project_B: titleB }) }
        ]
      })
    });
    const payload = await response.json();
    if (!response.ok) return new Response(JSON.stringify({ error: payload.error?.message || "The model provider request failed." }), { status: 502, headers: { "Content-Type": "application/json" } });
    const raw = payload.choices?.[0]?.message?.content || "";
    const parsedText = raw.match(/\{[\s\S]*\}/)?.[0];
    if (!parsedText) throw new Error("The model returned an unreadable result.");
    const result = JSON.parse(parsedText);
    const score = Math.max(0, Math.min(100, Math.round(Number(result.score))));
    if (!Number.isFinite(score)) throw new Error("The model returned an invalid score.");
    return new Response(JSON.stringify({ score, verdict: ["low","moderate","high"].includes(result.verdict) ? result.verdict : "moderate", reason: String(result.reason || "No explanation supplied.").slice(0, 300), model: MODEL }), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || "Unable to judge project similarity." }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
};