export async function fetchTavilyAssumptions(
  countryHint = "Germany residential electricity incentives"
): Promise<string[]> {
  if (!process.env.TAVILY_API_KEY) {
    return ["No Tavily API key configured; using internal benchmark assumptions."];
  }

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query: `${countryHint} household PV battery heat pump incentives`,
        search_depth: "basic",
        max_results: 3,
      }),
    });

    if (!response.ok) {
      return ["Tavily request failed; relying on default assumptions."];
    }

    const data = (await response.json()) as {
      results?: Array<{ title?: string; content?: string }>;
    };

    const parsed =
      data.results?.map((item) => `${item.title ?? "Source"}: ${(item.content ?? "").slice(0, 120)}...`) ??
      [];

    return parsed.length > 0
      ? parsed
      : ["No Tavily assumption data returned; using default assumptions."];
  } catch {
    return ["Tavily unreachable; using default assumptions."];
  }
}
