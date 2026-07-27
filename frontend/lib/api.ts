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
  public_key?: string | null;
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
  is_archived: boolean;
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
  is_private?: boolean;
  has_pending_request?: boolean;
}

export interface FollowRequestResponse {
  id: string;
  requester: AuthorResponse;
  created_at: string;
}

export type ToggleFollowStatus = "followed" | "unfollowed" | "requested" | "request_cancelled";

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
  last_message: string | null; // ciphertext if last_message_encrypted is true — do not render directly
  last_message_id: string | null;
  last_message_msg_type: number | null;
  last_message_encrypted: boolean;
  last_message_at: string;
}

export interface ChatMessageResponse {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string; // base64 Signal Protocol ciphertext for E2EE conversations, plaintext otherwise
  msg_type?: number | null; // 3 = PreKeyWhisperMessage, 1 = WhisperMessage; present when content is encrypted
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

export const getPosts = (username?: string, includeArchived?: boolean) => {
  const params = new URLSearchParams();
  if (username) params.set("username", username);
  if (includeArchived) params.set("include_archived", "true");
  const qs = params.toString();
  return apiGet<PostResponse[]>(`/posts${qs ? `?${qs}` : ""}`);
};
export const getPost = (id: string) => apiGet<PostDetailResponse>(`/posts/${id}`);
export const createPost = (data: FormData) => apiFetch<PostResponse>("/posts", { method: "POST", body: data });
export const updatePost = (postId: string, data: { title?: string; content?: string }) =>
  apiPut<PostResponse>(`/posts/${postId}`, data);
export const archivePost = (postId: string) => apiPost<PostResponse>(`/posts/${postId}/archive`);
export const unarchivePost = (postId: string) => apiPost<PostResponse>(`/posts/${postId}/unarchive`);
export const toggleLike = (postId: string) => apiPost<{ liked: boolean }>(`/posts/${postId}/like`);
export const addComment = (postId: string, content: string) => apiPost<CommentResponse>(`/posts/${postId}/comments`, { content });
export const repostPost = (postId: string) => apiPost<{ reposted: boolean }>(`/posts/${postId}/repost`);
export const deletePost = (postId: string) => apiDelete(`/posts/${postId}`);

export const getUserProfile = (username: string) => apiGet<UserProfileResponse>(`/users/${username}`);
export const updateProfile = (data: { bio?: string, avatar_url?: string, full_name?: string }) => apiPatch<UserProfileResponse>("/users/me/profile", data);
export const uploadAvatar = (data: FormData) => apiFetch<{ avatar_url: string }>("/users/me/avatar", { method: "POST", body: data });

export const toggleFollow = (username: string) =>
  apiPost<{ status: ToggleFollowStatus }>(`/users/${username}/follow`);
export const updatePrivacy = (isPrivate: boolean) =>
  apiPatch<{ is_private: boolean }>("/users/me/privacy", { is_private: isPrivate });
export const getFollowRequests = () => apiGet<FollowRequestResponse[]>("/users/me/follow-requests");
export const acceptFollowRequest = (requestId: string) =>
  apiPost<{ status: string }>(`/users/follow-requests/${requestId}/accept`);
export const rejectFollowRequest = (requestId: string) =>
  apiPost<{ status: string }>(`/users/follow-requests/${requestId}/reject`);
export const getFollowers = (username: string) => apiGet<AuthorResponse[]>(`/users/${username}/followers`);
export const getFollowing = (username: string) => apiGet<AuthorResponse[]>(`/users/${username}/following`);

export const getConversations = () => apiGet<ConversationResponse[]>("/chat/conversations");
// Soft delete: hides the conversation from the current user's list only.
// The other participant(s) keep seeing it and their full message history.
// Backend contract: this does NOT delete messages or the conversation row —
// it just records a per-user "hidden_at" marker. If the current user
// receives a new message in that conversation afterwards, the backend
// should clear the marker so it reappears in their list.
export const hideConversation = (conversationId: string) =>
  apiDelete<{ status: string }>(`/chat/conversations/${conversationId}/hide`);
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

// ── E2E Encryption (Signal Protocol) ─────────────────────────────────────────

export interface KeyBundleUploadPayload {
  identity_public_key: string;
  registration_id: number;
  signed_prekey: { key_id: number; public_key: string; signature: string };
  one_time_prekeys: { key_id: number; public_key: string }[];
}

export interface KeyBundleResponse {
  identity_key: string;
  registration_id: number;
  signed_prekey: { key_id: number; public_key: string; signature: string };
  one_time_prekey: { key_id: number; public_key: string } | null;
}

export const uploadKeyBundle = (payload: KeyBundleUploadPayload) =>
  apiFetch<{ status: string; one_time_prekeys_uploaded: number }>("/users/me/key-bundle", {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const getKeyBundle = (username: string) =>
  apiGet<KeyBundleResponse>(`/users/${username}/key-bundle`);

// ── Explore page ──────────────────────────────────────────────────────────────

export interface ExploreUser {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
  bio: string | null;
  is_private: boolean;
  is_following: boolean;
  has_pending_request: boolean;
}

export interface ExploreUsersResponse {
  users: ExploreUser[];
  total: number;
  has_more: boolean;
}

export const getExploreUsers = (skip: number = 0, limit: number = 20) =>
  apiGet<ExploreUsersResponse>(`/users/explore?skip=${skip}&limit=${limit}`);