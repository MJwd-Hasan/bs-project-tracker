const MODEL = "openai/gpt-oss-120b";
const API_URL = "https://api.groq.com/openai/v1/chat/completions";
const HEADERS = { "Content-Type": "application/json" };

function reply(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...HEADERS, "Cache-Control": "no-store" }
  });
}

function parseModelJson(raw) {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("The AI model returned an empty response.");
  }
  const cleaned = raw.trim().replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("The AI model did not return a JSON object.");
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

function validateResult(result) {
  const numericScore = Number(result?.score);
  if (!Number.isFinite(numericScore)) {
    throw new Error("The AI model returned an invalid similarity score.");
  }
  const score = Math.max(0, Math.min(100, Math.round(numericScore)));
  const verdict = ["low", "moderate", "high"].includes(String(result.verdict).toLowerCase())
    ? String(result.verdict).toLowerCase()
    : score >= 70 ? "high" : score >= 35 ? "moderate" : "low";
  const reason = String(result.reason || "The model did not provide an explanation.").trim().slice(0, 300);
  return { score, verdict, reason, model: MODEL };
}

async function callGroq(apiKey, messages, jsonMode) {
  const body = {
    model: MODEL,
    temperature: 0,
    max_tokens: 220,
    messages
  };
  if (jsonMode) body.response_format = { type: "json_object" };

  const response = await fetch(API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error?.message || payload.message || `Groq API request failed (${response.status}).`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return payload.choices?.[0]?.message?.content;
}

export default async request => {
  if (request.method !== "POST") return reply({ error: "Method not allowed." }, 405);

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return reply({
      error: "AI judge is not configured. Add GROQ_API_KEY to Netlify environment variables, enable it for Functions, and redeploy."
    }, 503);
  }

  try {
    const body = await request.json();
    const titleA = String(body.titleA || "").trim().slice(0, 240);
    const titleB = String(body.titleB || "").trim().slice(0, 240);
    if (!titleA || !titleB) return reply({ error: "Both project titles are required." }, 400);

    const messages = [
      {
        role: "system",
        content: [
          "You are an academic project-overlap reviewer.",
          "Compare the two project titles for substantive research similarity, considering research question, population, methods, and outcome.",
          "Do not infer that projects are identical merely because they share generic words.",
          "Respond with exactly one valid JSON object and no markdown or extra text.",
          'The JSON must have exactly these keys: "score" (integer from 0 to 100), "verdict" ("low", "moderate", or "high"), and "reason" (one concise sentence).',
          "This is a screening opinion, not a plagiarism finding."
        ].join(" ")
      },
      {
        role: "user",
        content: `Compare these projects and return the JSON object described above: ${JSON.stringify({ project_A: titleA, project_B: titleB })}`
      }
    ];

    let result;
    let firstError;
    try {
      const raw = await callGroq(apiKey, messages, false);
      result = validateResult(parseModelJson(raw));
    } catch (error) {
      firstError = error;
      // Retry once using Groq's JSON mode when the model returns malformed output.
      try {
        const raw = await callGroq(apiKey, messages, true);
        result = validateResult(parseModelJson(raw));
      } catch (retryError) {
        console.error("AI judge failed on both attempts:", firstError, retryError);
        const message = retryError.message || firstError.message || "The AI judge could not produce a valid result.";
        return reply({ error: `AI judge could not format a valid response after retrying: ${message}` }, 502);
      }
    }

    return reply(result);
  } catch (error) {
    console.error("AI judge request error:", error);
    return reply({ error: error.message || "Unable to judge project similarity." }, 500);
  }
};
