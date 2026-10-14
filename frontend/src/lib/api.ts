export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  // Ensure path starts with /api/v1 if not already
  let url = path;
  if (!url.startsWith("/api/")) {
    url = `/api/v1${url.startsWith("/") ? url : "/" + url}`;
  }

  const defaultHeaders: Record<string, string> = {};
  if (!(options.body instanceof FormData)) {
    defaultHeaders["Content-Type"] = "application/json";
  }

  const config: RequestInit = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
    credentials: "include", // Sends and receives session cookies
  };

  const response = await fetch(url, config);

  if (!response.ok) {
    let errorDetail = `Request failed with status ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson && errJson.detail) {
        errorDetail = typeof errJson.detail === "string" ? errJson.detail : JSON.stringify(errJson.detail);
      }
    } catch {
      // ignore json parse error
    }
    throw new Error(errorDetail);
  }

  // Handle empty responses
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return response.json();
  }
  return response.text() as any;
}
