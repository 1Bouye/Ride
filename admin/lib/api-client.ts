const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000/api/v1";

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export async function apiRequest<TResponse>({
  endpoint,
  method,
  token,
  payload
}: {
  endpoint: string;
  method?: HttpMethod;
  token?: string | null;
  payload?: unknown;
}): Promise<TResponse> {
  // Ensure endpoint starts with /
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  // Ensure API_BASE_URL doesn't end with /
  const baseUrl = API_BASE_URL.replace(/\/$/, '');
  const url = `${baseUrl}${normalizedEndpoint}`;
  
  console.log("[API Request] URL:", url);
  console.log("[API Request] Method:", method || "GET");
  console.log("[API Request] Has Token:", !!token);
  
  const response = await fetch(url, {
    method: method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: payload ? JSON.stringify(payload) : undefined,
    cache: "no-store"
  });

  console.log("[API Response] Status:", response.status, response.statusText);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error("[API Error] Response:", errorData);
    const errorMessage = errorData?.message || errorData?.error || `Request failed with status ${response.status}`;
    const error = new Error(errorMessage);
    throw error;
  }

  return response.json() as Promise<TResponse>;
}

