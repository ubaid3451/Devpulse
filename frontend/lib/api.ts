/**
 * Typed API fetch wrapper for DevPulse.
 * - Automatically includes credentials (cookies) on all requests.
 * - Throws ApiError on non-2xx responses for consistent error handling.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
    message?: string
  ) {
    super(message || detail);
    this.name = "ApiError";
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include", // always send httpOnly cookies
    headers,
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail || body.message || detail;
      if (Array.isArray(detail) && detail.length > 0 && typeof detail[0] === "object" && detail[0].msg) {
        detail = detail.map((err: { msg: string }) => err.msg).join(", ");
      } else if (typeof detail === "object" && detail !== null) {
        detail = JSON.stringify(detail);
      }
    } catch {
      // ignore JSON parse errors
    }
    throw new ApiError(res.status, detail);
  }

  // 204 No Content
  if (res.status === 204) return undefined as unknown as T;

  return res.json() as Promise<T>;
}

export const apiGet = <T>(path: string) => apiFetch<T>(path);

export const apiPost = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

export const apiPut = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, {
    method: "PUT",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

export const apiPatch = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, {
    method: "PATCH",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

export const apiDelete = <T>(path: string) =>
  apiFetch<T>(path, { method: "DELETE" });

// ── Types ──────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  full_name: string;
  username: string;
  role: "user" | "admin";
  is_verified: boolean;
  is_active: boolean;
  avatar_url: string | null;
  bio: string | null;
  oauth_provider: string | null;
  created_at: string;
}

export interface AuthResponse {
  message: string;
  user: User;
}

export interface MessageResponse {
  message: string;
}

export interface AuthorResponse {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
}

export interface CommentResponse {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  author: AuthorResponse;
}

export interface PostResponse {
  id: string;
  title: string;
  content: string;
  author_id: string;
  created_at: string;
  updated_at: string;
  author: AuthorResponse;
  likes_count: number;
  comments_count: number;
  is_liked: boolean;
  is_reposted: boolean;
  repost_id: string | null;
  original_post: PostResponse | null;
  image_url: string | null;
}

export interface PostDetailResponse extends PostResponse {
  comments: CommentResponse[];
}

export interface UserProfileResponse {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  followers_count?: number;
  following_count?: number;
  is_following?: boolean;
}

// ── Chat types (conversation-based, group-chat capable) ─────────────────────────

export interface ConversationParticipantInfo {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
}

export interface ConversationResponse {
  conversation_id: string;
  is_group: boolean;
  name: string | null; // group name; null for 1-on-1
  participants: ConversationParticipantInfo[]; // everyone except current user
  last_message: string | null;
  last_message_at: string;
}

export interface ChatMessageResponse {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  image_url?: string | null;
  is_read: boolean;
  created_at: string;
  reactions: { user_id: string; emoji: string }[];
}

export interface StartDirectConversationResponse {
  conversation_id: string;
  is_group: boolean;
}

export interface CreateGroupConversationResponse {
  conversation_id: string;
  is_group: boolean;
  name: string;
}

// ── Endpoints ──────────────────────────────────────────────────────────────────

export const getPosts = (username?: string) => {
  const url = username ? `/posts?username=${encodeURIComponent(username)}` : "/posts";
  return apiGet<PostResponse[]>(url);
};
export const getPost = (id: string) => apiGet<PostDetailResponse>(`/posts/${id}`);
export const createPost = (data: FormData) => apiFetch<PostResponse>("/posts", { method: "POST", body: data });
export const toggleLike = (postId: string) => apiPost<{ liked: boolean }>(`/posts/${postId}/like`);
export const addComment = (postId: string, content: string) => apiPost<CommentResponse>(`/posts/${postId}/comments`, { content });
export const repostPost = (postId: string) => apiPost<{ reposted: boolean }>(`/posts/${postId}/repost`);
export const deletePost = (postId: string) => apiDelete(`/posts/${postId}`);

export const getUserProfile = (username: string) => apiGet<UserProfileResponse>(`/users/${username}`);
export const updateProfile = (data: { bio?: string, avatar_url?: string, full_name?: string }) => apiPatch<UserProfileResponse>("/users/me/profile", data);
export const uploadAvatar = (data: FormData) => apiFetch<{ avatar_url: string }>("/users/me/avatar", { method: "POST", body: data });

export const toggleFollow = (username: string) => apiPost<{ status: string }>(`/users/${username}/follow`);
export const getFollowers = (username: string) => apiGet<AuthorResponse[]>(`/users/${username}/followers`);
export const getFollowing = (username: string) => apiGet<AuthorResponse[]>(`/users/${username}/following`);

export const getConversations = () => apiGet<ConversationResponse[]>("/chat/conversations");
export const getChatHistory = (conversationId: string) =>
  apiGet<ChatMessageResponse[]>(`/chat/${conversationId}`);
export const startDirectConversation = (username: string) =>
  apiPost<StartDirectConversationResponse>("/chat/conversations/direct", { username });
export const createGroupConversation = (name: string, usernames: string[]) =>
  apiPost<CreateGroupConversationResponse>("/chat/conversations/group", { name, usernames });
export const searchUsers = (q: string) => apiGet<AuthorResponse[]>(`/users/search?q=${encodeURIComponent(q)}`);
export const getOnlineUsers = () => apiGet<string[]>("/chat/online");
export const uploadChatImage = async (file: File) => {
  const formData = new FormData();
  formData.append("image", file);
  return apiFetch<{ image_url: string }>("/chat/upload_image", {
    method: "POST",
    body: formData,
  });
};